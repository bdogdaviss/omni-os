import { NextResponse } from "next/server";
import { z } from "zod";

import { generateStructured } from "@/lib/ai/generate";
import { recordAiUsage } from "@/lib/ai/usage";
import {
  isDuplicateDatabaseError,
  normalizeText,
} from "@/lib/duplicates/normalize";
import {
  selectedProposalScope,
  type ProposalTier,
} from "@/lib/proposal-tier";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  proposalId: z.string().uuid("A valid proposal ID is required"),
});

const taskCategorySchema = z
  .enum([
    "planning",
    "design",
    "frontend",
    "backend",
    "database",
    "ai",
    "auth",
    "integrations",
    "testing",
    "launch",
  ])
  .catch("planning");

const taskPrioritySchema = z.enum(["low", "medium", "high"]).catch("medium");

const taskEffortSchema = z
  .enum(["small", "medium", "large"])
  .catch("medium");

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

const buildTaskSchema = z.object({
  title: z.string().min(1, "Task title is required"),
  description: z.string().default(""),
  category: taskCategorySchema,
  priority: taskPrioritySchema,
  estimated_effort: taskEffortSchema,
  acceptance_criteria: textListSchema,
  dependencies: textListSchema,
});

const buildTasksSchema = z.object({
  tasks: z.array(buildTaskSchema).min(1, "At least one task is required"),
});

const buildTasksAgentPrompt = `
You are Omni Strive's Build Tasks Agent.

Omni Strive builds mobile apps, web platforms, AI integrations, dashboards, automations, and software products for clients.

Your job is to turn an approved proposal into practical internal build tasks for the Omni Strive team.

Rules:
1. Be practical.
2. Break the work into small buildable tasks.
3. Do not create vague tasks.
4. Do not create client facing communication.
5. Do not send anything externally.
6. Do not create GitHub issues yet.
7. Do not include pricing.
8. Do not include legal terms.
9. Include acceptance criteria for each task.
10. Include dependencies when relevant.
11. Return only valid JSON.
12. Do not include markdown.
13. Do not wrap JSON in triple backticks.

Task sizing rules (critical — an autonomous coding agent implements each task as one pull request, so every task MUST be small and single-layer):
14. Each task must be completable as a single focused PR touching roughly 1 to 5 files within ONE architectural layer (only the database, or only one API route/group, or only one UI screen/component, or only auth config, or only one integration). Anything larger must be split into separate tasks.
15. Never output a task with estimated_effort "large". If work is naturally large or spans layers (e.g. a "system", "flow", "dashboard", or "platform"), split it along architectural seams into separate tasks — for example one task for the database schema/migration, one for the API endpoint(s), one for the UI, one for tests/polish — and connect them via "dependencies". A "large" result means you failed to split; split it.
16. A task title must name ONE concrete artifact in ONE layer, never a feature or subsystem. Prefer "Add content_ideas table and migration" over "Create content idea organization system". Prefer "Build POST /api/content-ideas endpoint" over "Build content idea backend". If a title contains "system", "platform", "flow", "workflow", or joins two layers with "and" (e.g. "API and UI"), split it.
17. Each task maps to exactly ONE category. Work that needs its own database column AND its own UI screen AND its own API route is three tasks, not one.
18. Do not compress scope to hit a task count. Create as many small tasks as needed.

Return this exact JSON shape:

{
  "tasks": [
    {
      "title": "",
      "description": "",
      "category": "planning | design | frontend | backend | database | ai | auth | integrations | testing | launch",
      "priority": "low | medium | high",
      "estimated_effort": "small | medium | large",
      "acceptance_criteria": [],
      "dependencies": []
    }
  ]
}

Task categories:
planning
design
frontend
backend
database
ai
auth
integrations
testing
launch

Good task examples (small, single-layer, one artifact):
Add content_ideas table and migration.
Build POST /api/content-ideas endpoint.
Build content idea list UI with filters.
Create authenticated dashboard layout.
Build AI assistant API route.
Add form validation to the intake form.
Add error tracking.

Bad task examples (too big — split each into several tasks along the layers):
"Create content idea organization system" -> split into: content_ideas table + migration, the API endpoints, the list UI, and tests.
"Build the admin dashboard" -> split into: layout, each data section/API, and each widget.

There is no fixed task-count ceiling — split until every task satisfies the sizing rules above. Most proposals need 12 to 25 well-scoped tasks. More small tasks is strictly better than fewer large ones.
`;

type ProposalRecord = {
  id: string;
  project_brief_id: string | null;
  client_id: string | null;
  proposal_summary: string | null;
  lean_mvp: unknown;
  core_build: unknown;
  full_launch: unknown;
  selected_tier: ProposalTier | null;
  assumptions: unknown;
  out_of_scope: unknown;
  approved: boolean | null;
};

type ClientRecord = {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  website: string | null;
};

type ProjectBriefRecord = {
  id: string;
  project_type: string | null;
  problem: string | null;
  mvp_features: unknown;
  future_features: unknown;
  estimated_complexity: string | null;
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
    message: "Build Tasks API route is working",
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
        "id, project_brief_id, client_id, proposal_summary, lean_mvp, core_build, full_launch, selected_tier, assumptions, out_of_scope, approved",
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
          error: "Proposal must be approved before generating build tasks.",
        },
        { status: 400 },
      );
    }

    if (!proposal.selected_tier) {
      return NextResponse.json(
        {
          success: false,
          error: "Choose a build tier before generating build tasks.",
        },
        { status: 400 },
      );
    }

    const selectedScope = selectedProposalScope(proposal);

    // Duplicate build tasks check — before calling Claude so no tokens are
    // wasted. If any tasks exist for this proposal, deny full generation.
    const { count: existingTaskCount, error: existingTasksError } =
      await supabase
        .from("build_tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("proposal_id", proposal.id);

    if (existingTasksError) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to check for existing build tasks",
          details: existingTasksError.message,
        },
        { status: 500 },
      );
    }

    if ((existingTaskCount ?? 0) > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Duplicate build tasks",
          details: "Build tasks already exist for this proposal.",
          existingTaskCount: existingTaskCount ?? 0,
          proposalId: proposal.id,
        },
        { status: 409 },
      );
    }

    let client: ClientRecord | null = null;

    if (proposal.client_id) {
      const { data: clientData } = await supabase
        .from("clients")
        .select("id, name, company, email, website")
        .eq("id", proposal.client_id)
        .eq("user_id", user.id)
        .single();

      client = (clientData as ClientRecord | null) ?? null;
    }

    let brief: ProjectBriefRecord | null = null;

    if (proposal.project_brief_id) {
      const { data: briefData } = await supabase
        .from("project_briefs")
        .select(
          "id, project_type, problem, mvp_features, future_features, estimated_complexity",
        )
        .eq("id", proposal.project_brief_id)
        .eq("user_id", user.id)
        .single();

      brief = (briefData as ProjectBriefRecord | null) ?? null;
    }

    const {
      data: { tasks },
      usage,
    } = await generateStructured({
      system: buildTasksAgentPrompt,
      // Higher budget: right-sized tasks mean more (smaller) tasks per proposal.
      maxTokens: 8000,
      schema: buildTasksSchema,
      toolName: "record_build_tasks",
      user: `
Client:
${JSON.stringify(client, null, 2)}

Project brief:
${JSON.stringify(brief, null, 2)}

Approved build scope:
${JSON.stringify(
  {
    proposal_summary: proposal.proposal_summary,
    selected_tier: proposal.selected_tier,
    selected_scope: selectedScope,
    assumptions: proposal.assumptions,
    out_of_scope: proposal.out_of_scope,
  },
  null,
  2,
)}
          `,
    });

    // Recorded before the insert: the tokens are spent either way, so recording
    // on the success path only would undercount what the account was billed.
    await recordAiUsage(supabase, {
      userId: user.id,
      kind: "build_tasks",
      usage,
      clientId: proposal.client_id,
      proposalId: proposal.id,
    });

    // Drop duplicate task titles from Claude's output before inserting.
    const seenTitles = new Set<string>();
    const uniqueTasks = tasks.slice(0, 30).filter((task) => {
      const key = normalizeText(task.title);

      if (!key || seenTitles.has(key)) {
        return false;
      }

      seenTitles.add(key);
      return true;
    });

    const tasksToInsert = uniqueTasks.map((task) => ({
      user_id: user.id,
      proposal_id: proposal.id,
      client_id: proposal.client_id,
      title: task.title,
      description: task.description || null,
      category: task.category,
      priority: task.priority,
      estimated_effort: task.estimated_effort,
      acceptance_criteria: task.acceptance_criteria,
      dependencies: task.dependencies,
      status: "draft",
    }));

    const { data: savedTasks, error: insertError } = await supabase
      .from("build_tasks")
      .insert(tasksToInsert)
      .select();

    if (insertError || !savedTasks) {
      console.error("Build tasks insert error:", insertError);

      if (isDuplicateDatabaseError(insertError)) {
        return NextResponse.json(
          {
            success: false,
            error: "Duplicate build tasks",
            details: "Build tasks already exist for this proposal.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: "Failed to save build tasks",
          details: insertError?.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      tasks: savedTasks,
    });
  } catch (error: unknown) {
    console.error("Build tasks agent error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid build tasks request or response",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate build tasks",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
