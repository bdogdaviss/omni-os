import { NextResponse } from "next/server";
import { z } from "zod";

import { generateStructured } from "@/lib/ai/generate";
import { recordAiUsage } from "@/lib/ai/usage";
import { createClient } from "@/lib/supabase/server";

// Video production kits for the Marketing page. The model writes everything
// EXCEPT the video: a paste-into-any-video-generator prompt, the narration
// script, a shot list, voiceover copy, and captions. No video API is called —
// the operator pastes the prompt into whichever generator they use (Sora, Veo,
// Runway), and demo/onboarding kits are built around screen recordings because
// text-to-video models cannot show a real product UI.
//
// ponytail: kits are stored as activity_events rows (event_type
// "marketing_kit", kit in metadata) instead of their own table — no migration,
// RLS already in place. Ceiling: the marketing page reads kits with a filtered
// select on an ever-growing events table. Upgrade path: a marketing_assets
// table if kits eventually need richer mutable state.

const VIDEO_TYPES = ["demo", "onboarding", "marketing", "custom"] as const;

const requestSchema = z
  .object({
    videoType: z.enum(VIDEO_TYPES, {
      message: "Video type must be demo, onboarding, marketing, or custom",
    }),
    clientId: z.string().uuid().optional(),
    prompt: z.string().trim().max(2000).optional().default(""),
  })
  .refine((data) => data.videoType !== "custom" || data.prompt.length >= 10, {
    message: "A custom video needs a prompt describing it (10+ characters).",
    path: ["prompt"],
  });

const deleteSchema = z.object({
  kitEventId: z.string().uuid("A valid kit ID is required"),
});

const kitSchema = z.object({
  title: z.string().min(1),
  duration: z.string().min(1),
  video_prompt: z.string().min(1),
  script: z.string().min(1),
  shot_list: z.array(z.string()).min(1),
  voiceover: z.string().min(1),
  captions: z.array(z.string()).min(1),
});

const marketingKitPrompt = `
You are Omni Strive's Video Production Agent.

Omni Strive builds mobile apps, web platforms, dashboards, and marketing sites
for clients. Your job is to turn a one-line request into a complete, ready-to-
use video production kit.

Return every field:

1. "title" — short working title for the video.
2. "duration" — suggested length (e.g. "30 seconds", "60-90 seconds").
3. "video_prompt" — a single, detailed prompt ready to paste into a
   text-to-video generator (Sora, Veo, Runway). Describe subject, style,
   camera movement, lighting, pacing, and mood concretely. CRITICAL RULE:
   text-to-video models CANNOT render a real product's actual interface, so
   never ask one to show the client's app or website. For demo and onboarding
   videos, this prompt covers only the non-UI footage (intro, outro, lifestyle
   b-roll, abstract background loops) — the product itself is captured by
   screen recording per the shot list.
4. "script" — the full narration script with [SCENE] markers, timed to the
   suggested duration.
5. "shot_list" — ordered shots. For demo/onboarding videos, most entries are
   specific screen recordings ("Screen recording: submitting the contact form
   on mobile, 8s"); for marketing videos, entries describe generated or stock
   footage.
6. "voiceover" — clean voiceover text only, no markers, ready for a
   text-to-speech tool or a human read.
7. "captions" — 2-3 short social caption options with distinct tones.

Rules:
- Be specific to the client and project context provided; never generic filler.
- Do not include pricing or private client details in any on-screen text.
- Do not claim the video exists or will be generated — this is a kit.
- Keep everything practical for a solo operator producing on a phone or laptop.
`;

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Marketing kit API route is working",
  });
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated. Please log in first." },
        { status: 401 },
      );
    }

    // After auth on purpose: configuration state is nobody else's business.
    if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: "No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
        },
        { status: 500 },
      );
    }

    const body: unknown = await req.json();
    const { videoType, clientId, prompt } = requestSchema.parse(body);

    // Optional client context makes the kit specific instead of generic.
    let client = null;
    let brief = null;

    if (clientId) {
      const { data: clientData } = await supabase
        .from("clients")
        .select("id, name, company, website")
        .eq("id", clientId)
        .eq("user_id", user.id)
        .maybeSingle();

      client = clientData;

      const { data: briefData } = await supabase
        .from("project_briefs")
        .select("project_type, problem, mvp_features")
        .eq("client_id", clientId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      brief = briefData;
    }

    // Only the ownership-verified id is ever persisted. The raw request UUID
    // could be stale (client deleted mid-session -> FK violation) or, in a
    // multi-user world, someone else's client entirely.
    const verifiedClientId = (client as { id: string } | null)?.id ?? null;

    const typeLabel = {
      demo: "a product demo video showing how the delivered software works",
      onboarding:
        "an onboarding video walking a new user through getting started",
      marketing: "a short marketing/promo video for social or a landing page",
      custom: "a custom video",
    }[videoType];

    const { data: kit, usage } = await generateStructured({
      system: marketingKitPrompt,
      maxTokens: 3000,
      schema: kitSchema,
      toolName: "record_video_kit",
      user: `
Video requested: ${typeLabel}

Operator's notes/prompt:
${prompt || "(none — use the client context)"}

Client:
${JSON.stringify(client, null, 2)}

Latest project brief for this client:
${JSON.stringify(brief, null, 2)}
          `,
    });

    await recordAiUsage(supabase, {
      userId: user.id,
      kind: "marketing_kit",
      usage,
      clientId: verifiedClientId,
    });

    const { error: saveError } = await supabase.from("activity_events").insert({
      user_id: user.id,
      client_id: verifiedClientId,
      event_type: "marketing_kit",
      title: `Video kit: ${kit.title}`,
      description: `${typeLabel} — ${kit.duration}`,
      metadata: { videoType, requestPrompt: prompt, kit },
    });

    if (saveError) {
      // The page renders kits exclusively from this row — an unsaved kit is a
      // lost kit, so this must be a real failure, not a warning. (The tokens
      // are spent either way; a retry costs pennies, a lying success costs
      // trust.)
      console.error(`Marketing kit save failed: ${saveError.message}`);

      return NextResponse.json(
        {
          success: false,
          error: "The kit was generated but could not be saved. Try again.",
          details: saveError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Marketing kit error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate the video kit",
        details: error instanceof Error ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });

    const { kitEventId } = deleteSchema.parse(await req.json());
    const { data, error } = await supabase
      .from("activity_events")
      .delete()
      .eq("id", kitEventId)
      .eq("user_id", user.id)
      .eq("event_type", "marketing_kit")
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, error: "Marketing kit not found." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    return NextResponse.json({ success: false, error: "Failed to remove marketing kit", details: error instanceof Error ? error.message : undefined }, { status: 500 });
  }
}
