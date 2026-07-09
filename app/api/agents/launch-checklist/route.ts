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
  proposalId: z.string().uuid("A valid proposal ID is required"),
});

const categorySchema = z
  .enum([
    "environment",
    "auth",
    "database",
    "api",
    "ai",
    "frontend",
    "payments",
    "analytics",
    "monitoring",
    "security",
    "performance",
    "content",
    "mobile",
    "handoff",
    "launch",
  ])
  .catch("launch");

const prioritySchema = z.enum(["low", "medium", "high"]).catch("medium");

const textListSchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === "string" ? item : JSON.stringify(item),
    );
  }

  if (typeof value === "string" && value.trim()) {
    return [value];
  }

  return [];
}, z.array(z.string()));

const checklistItemSchema = z.object({
  title: z.string().min(1, "Item title is required"),
  description: z.string().default(""),
  category: categorySchema,
  priority: prioritySchema,
  verification_steps: textListSchema,
});

const checklistSchema = z.object({
  title: z.string().min(1, "Checklist title is required"),
  summary: z.string().default(""),
  readiness_score: z.coerce.number().int().min(0).max(100).catch(0),
  items: z.array(checklistItemSchema).min(1, "At least one item is required"),
});

const launchChecklistAgentPrompt = `
You are Omni Strive's Launch Checklist Agent.

Omni Strive builds mobile apps, web platforms, AI integrations, dashboards, automations, and software products for clients.

Your job is to turn an approved proposal and its internal build tasks into a practical launch readiness checklist.

Rules:
1. Create an internal launch checklist only.
2. Do not deploy anything.
3. Do not send anything externally.
4. Do not create GitHub issues.
5. Do not contact the client.
6. Do not include pricing.
7. Do not include legal promises.
8. Focus on real launch readiness.
9. Include verification steps for each item.
10. Include priorities.
11. Include categories.
12. Be specific and practical.
13. Return only valid JSON.
14. Do not include markdown outside the JSON.
15. Do not wrap JSON in triple backticks.

Return this exact JSON shape:

{
  "title": "",
  "summary": "",
  "readiness_score": 0,
  "items": [
    {
      "title": "",
      "description": "",
      "category": "environment | auth | database | api | ai | frontend | payments | analytics | monitoring | security | performance | content | mobile | handoff | launch",
      "priority": "low | medium | high",
      "verification_steps": []
    }
  ]
}

Checklist categories:
environment
auth
database
api
ai
frontend
payments
analytics
monitoring
security
performance
content
mobile
handoff
launch

Checklist status options will be handled by the app:
not_started
in_progress
verified
blocked
not_applicable

Generate between 12 and 25 checklist items.
Only include payments if the proposal or tasks mention payments, Stripe, billing, checkout, subscriptions, or invoices.
Only include mobile/app store checks if the proposal or tasks mention mobile apps, iOS, Android, App Store, or Play Store.
Always include security, auth, database, monitoring, and handoff checks when relevant.
Make the checklist useful for a real software launch.
`;

type ProposalRecord = {
  id: string;
  project_brief_id: string | null;
  client_id: string | null;
  proposal_summary: string | null;
  lean_mvp: unknown;
  core_build: unknown;
  full_launch: unknown;
  approved: boolean | null;
};

type ClientRecord = {
  id: string;
  name: string | null;
  company: string | null;
  website: string | null;
};

type BriefRecord = {
  id: string;
  project_type: string | null;
  problem: string | null;
  mvp_features: unknown;
  future_features: unknown;
  estimated_complexity: string | null;
};

type TaskRecord = {
  id: string;
  title: string | null;
  category: string | null;
  priority: string | null;
  status: string | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Launch Checklist API route is working",
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
    const { proposalId } = requestSchema.parse(body);

    const { data: proposalData, error: proposalError } = await supabase
      .from("proposals")
      .select(
        "id, project_brief_id, client_id, proposal_summary, lean_mvp, core_build, full_launch, approved",
      )
      .eq("id", proposalId)
      .eq("user_id", user.id)
      .single();

    if (proposalError || !proposalData) {
      return NextResponse.json(
        {
          success: false,
          error: "Proposal not found",
          details: proposalError?.message,
        },
        { status: 404 },
      );
    }

    const proposal = proposalData as ProposalRecord;

    if (!proposal.approved) {
      return NextResponse.json(
        {
          success: false,
          error: "Proposal must be approved before generating a launch checklist.",
        },
        { status: 400 },
      );
    }

    // Duplicate checklist check — before calling Claude so no tokens are
    // wasted. One launch checklist per proposal.
    const { data: existingChecklists, error: existingChecklistError } =
      await supabase
        .from("launch_checklists")
        .select("id")
        .eq("user_id", user.id)
        .eq("proposal_id", proposal.id)
        .limit(1);

    if (existingChecklistError) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to check for existing launch checklist",
          details: existingChecklistError.message,
        },
        { status: 500 },
      );
    }

    if (existingChecklists && existingChecklists.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Duplicate launch checklist",
          details: "Launch checklist already exists for this proposal.",
          existingChecklistId: existingChecklists[0].id,
        },
        { status: 409 },
      );
    }

    let client: ClientRecord | null = null;

    if (proposal.client_id) {
      const { data: clientData } = await supabase
        .from("clients")
        .select("id, name, company, website")
        .eq("id", proposal.client_id)
        .eq("user_id", user.id)
        .maybeSingle();

      client = (clientData as ClientRecord | null) ?? null;
    }

    let brief: BriefRecord | null = null;

    if (proposal.project_brief_id) {
      const { data: briefData } = await supabase
        .from("project_briefs")
        .select(
          "id, project_type, problem, mvp_features, future_features, estimated_complexity",
        )
        .eq("id", proposal.project_brief_id)
        .eq("user_id", user.id)
        .maybeSingle();

      brief = (briefData as BriefRecord | null) ?? null;
    }

    const { data: taskData } = await supabase
      .from("build_tasks")
      .select("id, title, category, priority, status")
      .eq("proposal_id", proposal.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    const tasks = (taskData ?? []) as TaskRecord[];

    const { data: checklist, usage } = await generateStructured({
      system: launchChecklistAgentPrompt,
      maxTokens: 8000,
      schema: checklistSchema,
      toolName: "record_launch_checklist",
      user: `
Approved proposal:
${JSON.stringify(proposal, null, 2)}

Client:
${JSON.stringify(client, null, 2)}

Project brief:
${JSON.stringify(brief, null, 2)}

Build tasks:
${JSON.stringify(tasks, null, 2)}
          `,
    });

    await recordAiUsage(supabase, {
      userId: user.id,
      kind: "launch_checklist",
      usage,
      clientId: proposal.client_id,
      proposalId: proposal.id,
    });

    const { data: savedChecklist, error: checklistInsertError } = await supabase
      .from("launch_checklists")
      .insert({
        user_id: user.id,
        client_id: proposal.client_id,
        proposal_id: proposal.id,
        title: checklist.title,
        summary: checklist.summary || null,
        overall_status: "draft",
        readiness_score: checklist.readiness_score,
      })
      .select()
      .single();

    if (checklistInsertError || !savedChecklist) {
      console.error("Launch checklist insert error:", checklistInsertError);

      if (isDuplicateDatabaseError(checklistInsertError)) {
        return NextResponse.json(
          {
            success: false,
            error: "Duplicate launch checklist",
            details: "Launch checklist already exists for this proposal.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: "Failed to save launch checklist",
          details: checklistInsertError?.message,
        },
        { status: 500 },
      );
    }

    // Drop duplicate item titles from Claude's output before inserting.
    const seenItemTitles = new Set<string>();
    const uniqueItems = checklist.items.slice(0, 25).filter((item) => {
      const key = normalizeText(item.title);

      if (!key || seenItemTitles.has(key)) {
        return false;
      }

      seenItemTitles.add(key);
      return true;
    });

    const itemsToInsert = uniqueItems.map((item) => ({
      user_id: user.id,
      checklist_id: savedChecklist.id,
      client_id: proposal.client_id,
      proposal_id: proposal.id,
      title: item.title,
      description: item.description || null,
      category: item.category,
      priority: item.priority,
      status: "not_started",
      verification_steps: item.verification_steps,
    }));

    const { data: savedItems, error: itemsInsertError } = await supabase
      .from("launch_checklist_items")
      .insert(itemsToInsert)
      .select();

    if (itemsInsertError || !savedItems) {
      console.error("Launch checklist items insert error:", itemsInsertError);

      if (isDuplicateDatabaseError(itemsInsertError)) {
        return NextResponse.json(
          {
            success: false,
            error: "Duplicate checklist items",
            details:
              "One or more checklist items already exist with the same title.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: "Failed to save launch checklist items",
          details: itemsInsertError?.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      checklist: savedChecklist,
      items: savedItems,
    });
  } catch (error: unknown) {
    console.error("Launch checklist agent error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid launch checklist request or response",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate launch checklist",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
