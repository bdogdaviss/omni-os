import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
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

Task examples:
Set up project database schema.
Create authenticated dashboard layout.
Build AI assistant API route.
Create admin review page.
Add form validation.
Add error tracking.
Prepare launch checklist.

Do not create more than 15 tasks.
Prefer 8 to 12 strong tasks.
`;

type ProposalRecord = {
  id: string;
  project_brief_id: string | null;
  client_id: string | null;
  proposal_summary: string | null;
  lean_mvp: unknown;
  core_build: unknown;
  full_launch: unknown;
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
    message: "Build Tasks API route is working",
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
    const { proposalId } = requestSchema.parse(body);

    const { data: proposalData, error: proposalError } = await supabase
      .from("proposals")
      .select(
        "id, project_brief_id, client_id, proposal_summary, lean_mvp, core_build, full_launch, assumptions, out_of_scope, approved",
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

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system: buildTasksAgentPrompt,
      messages: [
        {
          role: "user",
          content: `
Client:
${JSON.stringify(client, null, 2)}

Project brief:
${JSON.stringify(brief, null, 2)}

Approved proposal:
${JSON.stringify(proposal, null, 2)}
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
    const { tasks } = buildTasksSchema.parse(JSON.parse(cleanedText));

    const tasksToInsert = tasks.slice(0, 15).map((task) => ({
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
