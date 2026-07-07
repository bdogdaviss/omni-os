import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  briefId: z.string().uuid("A valid project brief ID is required"),
});

const proposalOptionSchema = z.object({
  title: z.string(),
  scope: z.array(z.string()),
  timeline: z.string(),
  estimated_range: z.string(),
  best_for: z.string(),
});

const proposalSchema = z.object({
  proposal_summary: z.string(),
  lean_mvp: proposalOptionSchema,
  core_build: proposalOptionSchema,
  full_launch: proposalOptionSchema,
  assumptions: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  follow_up_message: z.string(),
});

const proposalAgentPrompt = `
You are Omni Strive's Proposal Agent.

Omni Strive builds mobile apps, web platforms, AI integrations, dashboards, automations, and software products for clients.

Your job is to turn an approved or draft project brief into a practical proposal draft.

Rules:
1. Be practical.
2. Do not overpromise.
3. Do not make legal promises.
4. Do not guarantee final pricing.
5. Create three proposal options: Lean MVP, Core Build, and Full Launch.
6. Separate what is included from what is out of scope.
7. Include assumptions.
8. Include a human sounding follow up message.
9. Return only valid JSON.
10. Do not include markdown.
11. Do not wrap JSON in triple backticks.

Return this exact JSON shape:

{
  "proposal_summary": "",
  "lean_mvp": {
    "title": "Lean MVP",
    "scope": [],
    "timeline": "",
    "estimated_range": "",
    "best_for": ""
  },
  "core_build": {
    "title": "Core Build",
    "scope": [],
    "timeline": "",
    "estimated_range": "",
    "best_for": ""
  },
  "full_launch": {
    "title": "Full Launch",
    "scope": [],
    "timeline": "",
    "estimated_range": "",
    "best_for": ""
  },
  "assumptions": [],
  "out_of_scope": [],
  "follow_up_message": ""
}

Use price ranges like:
Lean MVP: $3,500 to $7,500
Core Build: $8,000 to $15,000
Full Launch: $15,000 to $30,000+

Make it clear these are draft ranges and final pricing depends on confirmed requirements.
`;

type ProjectBriefRecord = {
  id: string;
  client_id: string | null;
  project_type: string | null;
  problem: string | null;
  mvp_features: unknown;
  future_features: unknown;
  questions_to_ask: unknown;
  estimated_complexity: string | null;
  next_step: string | null;
  approved: boolean | null;
};

type ClientRecord = {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  website: string | null;
};

function cleanJsonText(text: string) {
  return text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Proposal API route is working",
  });
}

export async function POST(req: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing ANTHROPIC_API_KEY",
        },
        { status: 500 },
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Not authenticated. Please log in first.",
        },
        { status: 401 },
      );
    }

    const body: unknown = await req.json();
    const { briefId } = requestSchema.parse(body);

    const { data: briefData, error: briefError } = await supabase
      .from("project_briefs")
      .select(
        "id, client_id, project_type, problem, mvp_features, future_features, questions_to_ask, estimated_complexity, next_step, approved",
      )
      .eq("id", briefId)
      .eq("user_id", user.id)
      .single();

    if (briefError || !briefData) {
      return NextResponse.json(
        {
          success: false,
          error: "Project brief not found",
          details: briefError?.message,
        },
        { status: 404 },
      );
    }

    const brief = briefData as ProjectBriefRecord;
    let client: ClientRecord | null = null;

    if (brief.client_id) {
      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("id, name, company, email, website")
        .eq("id", brief.client_id)
        .eq("user_id", user.id)
        .single();

      if (clientError || !clientData) {
        return NextResponse.json(
          {
            success: false,
            error: "Related client not found",
            details: clientError?.message,
          },
          { status: 404 },
        );
      }

      client = clientData as ClientRecord;
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 1800,
      system: proposalAgentPrompt,
      messages: [
        {
          role: "user",
          content: `
Client:
${JSON.stringify(client, null, 2)}

Project brief:
${JSON.stringify(brief, null, 2)}
          `,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");

    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        {
          success: false,
          error: "Claude did not return text",
        },
        { status: 500 },
      );
    }

    const cleanedText = cleanJsonText(textBlock.text);
    const proposal = proposalSchema.parse(JSON.parse(cleanedText));

    const { data: savedProposal, error: proposalError } = await supabase
      .from("proposals")
      .insert({
        user_id: user.id,
        project_brief_id: brief.id,
        client_id: brief.client_id,
        proposal_summary: proposal.proposal_summary,
        lean_mvp: proposal.lean_mvp,
        core_build: proposal.core_build,
        full_launch: proposal.full_launch,
        assumptions: proposal.assumptions,
        out_of_scope: proposal.out_of_scope,
        follow_up_message: proposal.follow_up_message,
        approved: false,
      })
      .select()
      .single();

    if (proposalError || !savedProposal) {
      console.error("Proposal insert error:", proposalError);

      return NextResponse.json(
        {
          success: false,
          error: "Failed to save proposal",
          details: proposalError?.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      proposal: savedProposal,
    });
  } catch (error: unknown) {
    console.error("Proposal agent error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid proposal request or response",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate proposal",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
