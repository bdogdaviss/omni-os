import { NextResponse } from "next/server";
import { z } from "zod";

import { generateAgentText } from "@/lib/ai/generate";
import { recordAiUsage } from "@/lib/ai/usage";
import { createClient } from "@/lib/supabase/server";

// Dev-test video jobs: sends a kit's video prompt to the text model, verbatim,
// as a "make this video" request. A text model cannot return a video, so every
// job produced here ends at status "responded_no_video" with the model's
// actual reply stored — the UI says so plainly. The row's video_url column is
// the socket a real producer (the Playwright screen-recording agent) fills
// later; nothing in this route pretends to fill it.

const requestSchema = z.object({
  kitEventId: z.string().uuid("A valid kit ID is required"),
});

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Marketing videos API route is working",
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

    // Same preflight as the sibling marketing-kit route: fail clean before
    // any DB write when no provider is configured.
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
    const { kitEventId } = requestSchema.parse(body);

    const { data: kitRow, error: kitError } = await supabase
      .from("activity_events")
      .select("id, client_id, metadata")
      .eq("id", kitEventId)
      .eq("user_id", user.id)
      .eq("event_type", "marketing_kit")
      .maybeSingle();

    if (kitError || !kitRow) {
      return NextResponse.json(
        { success: false, error: "Kit not found." },
        { status: 404 },
      );
    }

    const metadata = (kitRow.metadata ?? {}) as Record<string, unknown>;
    const kit = (metadata.kit ?? {}) as Record<string, unknown>;
    const videoPrompt = typeof kit.video_prompt === "string" ? kit.video_prompt : "";
    const title = typeof kit.title === "string" ? kit.title : "Untitled video";
    const videoType =
      typeof metadata.videoType === "string" ? metadata.videoType : "custom";

    if (!videoPrompt) {
      return NextResponse.json(
        { success: false, error: "This kit has no video prompt to send." },
        { status: 400 },
      );
    }

    // The operator's literal ask, on purpose: this is a dev test of the pipe,
    // and the honest result is whatever the model actually says back.
    const prompt = `Make a video. Return the finished video file.\n\n${videoPrompt}`;

    const { data: job, error: insertError } = await supabase
      .from("marketing_videos")
      .insert({
        user_id: user.id,
        client_id: kitRow.client_id,
        kit_event_id: kitRow.id,
        video_type: videoType,
        title,
        prompt,
        status: "requested",
      })
      .select("id")
      .single();

    if (insertError || !job) {
      return NextResponse.json(
        { success: false, error: `Could not create the job: ${insertError?.message}` },
        { status: 500 },
      );
    }

    let status = "responded_no_video";
    let responseText = "";
    let provider: string | null = null;

    try {
      const result = await generateAgentText({
        system:
          "You are asked to produce a video. Respond honestly about what you can and cannot deliver, and provide your best text alternative.",
        user: prompt,
        maxTokens: 1000,
      });
      responseText = result.text;
      provider = result.provider;

      await recordAiUsage(supabase, {
        userId: user.id,
        kind: "marketing_video",
        usage: result.usage,
        clientId: kitRow.client_id,
      });
    } catch (modelError) {
      status = "failed";
      responseText =
        modelError instanceof Error ? modelError.message : "Model call failed.";
    }

    const { error: updateError } = await supabase
      .from("marketing_videos")
      .update({
        status,
        provider,
        model_response: responseText,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("user_id", user.id);

    if (updateError) {
      console.error(`Video job update failed: ${updateError.message}`);

      return NextResponse.json(
        {
          success: false,
          error: "The model responded but the job could not be saved. Try again.",
          details: updateError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true, status });
  } catch (error: unknown) {
    console.error("Marketing video job error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to create the video job",
        details: error instanceof Error ? error.message : undefined,
      },
      { status: 500 },
    );
  }
}
