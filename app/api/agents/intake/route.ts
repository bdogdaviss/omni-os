import { NextResponse } from "next/server";
import { z } from "zod";

import { generateStructured } from "@/lib/ai/generate";
import { recordAiUsage } from "@/lib/ai/usage";
import {
  isDuplicateDatabaseError,
  normalizeText,
} from "@/lib/duplicates/normalize";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  clientName: z.string().min(1, "Client name is required"),
  company: z.string().optional().default(""),
  email: z.string().optional().default(""),
  website: z.string().optional().default(""),
  rawMessage: z.string().min(10, "Client message is too short"),
  budgetRange: z.string().optional().default(""),
  timeline: z.string().optional().default(""),
});

const intakeAgentPrompt = `
You are Omni Strive's Client Intake Agent.

Omni Strive builds mobile apps, web platforms, AI integrations, dashboards, automations, and software products for clients.

Your job is to turn messy client information into a clean internal project brief.

Rules:
1. Be practical.
2. Do not overbuild.
3. Separate MVP features from future features.
4. Identify missing questions before a proposal is made.
5. Estimate complexity as low, medium, or high.
6. Do not promise final pricing.
`;

// The brief the intake agent must return. generateStructured forces the model
// to emit exactly this shape, so downstream inserts get trusted, typed fields.
const briefSchema = z.object({
  project_type: z.string(),
  problem: z.string(),
  mvp_features: z.array(z.string()),
  future_features: z.array(z.string()),
  questions_to_ask: z.array(z.string()),
  estimated_complexity: z.enum(["low", "medium", "high"]),
  next_step: z.string(),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Intake API route is working",
  });
}

export async function POST(req: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
        },
        { status: 500 }
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
        { status: 401 }
      );
    }

    const body = await req.json();
    const data = requestSchema.parse(body);

    // Duplicate client check — before creating anything and before calling
    // Claude, so duplicate submissions never waste tokens.
    const normalizedName = normalizeText(data.clientName);
    const normalizedEmail = normalizeText(data.email);

    const { data: existingClients, error: existingClientsError } =
      await supabase
        .from("clients")
        .select("id, name, email, company")
        .eq("user_id", user.id);

    if (existingClientsError) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to check for existing clients",
          details: existingClientsError.message,
        },
        { status: 500 }
      );
    }

    const duplicateByName = (existingClients ?? []).find(
      (existing) => normalizeText(existing.name) === normalizedName
    );

    if (duplicateByName) {
      return NextResponse.json(
        {
          success: false,
          error: "Duplicate client",
          details: "A client with this name already exists.",
          existingClientId: duplicateByName.id,
        },
        { status: 409 }
      );
    }

    if (normalizedEmail) {
      const duplicateByEmail = (existingClients ?? []).find(
        (existing) => normalizeText(existing.email) === normalizedEmail
      );

      if (duplicateByEmail) {
        return NextResponse.json(
          {
            success: false,
            error: "Duplicate client",
            details: "A client with this email already exists.",
            existingClientId: duplicateByEmail.id,
          },
          { status: 409 }
        );
      }
    }

    // Generate the brief BEFORE writing anything. If the model fails we bail
    // out here with nothing persisted, instead of leaving an orphaned client +
    // lead with no brief attached. The duplicate check already ran above, so
    // this never spends tokens on a repeat submission.
    const { data: brief, usage } = await generateStructured({
      system: intakeAgentPrompt,
      maxTokens: 1200,
      schema: briefSchema,
      toolName: "record_project_brief",
      user: `
Client name: ${data.clientName}
Company: ${data.company}
Email: ${data.email}
Website: ${data.website}
Budget range: ${data.budgetRange}
Timeline: ${data.timeline}

Raw client message:
${data.rawMessage}
          `,
    });

    // The client and proposal are both created downstream of this call, so this
    // usage row carries neither id — it is counted in account-wide totals only.
    await recordAiUsage(supabase, { userId: user.id, kind: "intake", usage });

    // One transactional RPC (see supabase/migrations/*_create_intake_rpc.sql):
    // client + lead + brief insert atomically, so a mid-flow failure rolls all
    // three back instead of leaving an orphaned client + lead with no brief.
    const { data: intake, error: intakeError } = await supabase.rpc(
      "create_intake",
      {
        p_client_name: data.clientName,
        p_company: data.company || null,
        p_email: data.email || null,
        p_website: data.website || null,
        p_raw_message: data.rawMessage,
        p_budget_range: data.budgetRange || null,
        p_timeline: data.timeline || null,
        p_project_type: brief.project_type,
        p_problem: brief.problem,
        p_mvp_features: brief.mvp_features,
        p_future_features: brief.future_features,
        p_questions_to_ask: brief.questions_to_ask,
        p_estimated_complexity: brief.estimated_complexity,
        p_next_step: brief.next_step,
      }
    );

    if (intakeError || !intake) {
      console.error("Intake insert error:", intakeError);

      if (isDuplicateDatabaseError(intakeError)) {
        return NextResponse.json(
          {
            success: false,
            error: "Duplicate client",
            details: "A client with this name or email already exists.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: "Failed to save intake",
          details: intakeError?.message,
        },
        { status: 500 }
      );
    }

    const result = intake as {
      client: Record<string, unknown>;
      lead: Record<string, unknown>;
      brief: Record<string, unknown>;
    };

    return NextResponse.json({
      success: true,
      client: result.client,
      lead: result.lead,
      brief: result.brief,
    });
  } catch (error: unknown) {
    console.error("Intake agent error:", error);

    // Bad request body, or model output that failed schema validation.
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid intake request or response",
          details: error.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate project brief",
        details: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
