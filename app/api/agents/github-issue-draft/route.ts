import { NextResponse } from "next/server";
import { z } from "zod";

import { generateStructured } from "@/lib/ai/generate";
import { recordAiUsage } from "@/lib/ai/usage";
import { isDuplicateDatabaseError } from "@/lib/duplicates/normalize";
import {
  buildIssueDraftUserPrompt,
  issueDraftAgentPrompt,
  issueDraftSchema,
} from "@/lib/pipeline/issue-draft";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  taskId: z.string().uuid("A valid task ID is required"),
});

type TaskRecord = {
  id: string;
  proposal_id: string | null;
  client_id: string | null;
  title: string | null;
  description: string | null;
  category: string | null;
  priority: string | null;
  estimated_effort: string | null;
  acceptance_criteria: unknown;
  dependencies: unknown;
  status: string | null;
};

type ClientRecord = {
  id: string;
  name: string | null;
  company: string | null;
  website: string | null;
};

type ProposalRecord = {
  id: string;
  project_brief_id: string | null;
  proposal_summary: string | null;
  approved: boolean | null;
};

type BriefRecord = {
  id: string;
  project_type: string | null;
  problem: string | null;
  mvp_features: unknown;
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
    message: "GitHub Issue Draft API route is working",
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
    const { taskId } = requestSchema.parse(body);

    const { data: taskData, error: taskError } = await supabase
      .from("build_tasks")
      .select(
        "id, proposal_id, client_id, title, description, category, priority, estimated_effort, acceptance_criteria, dependencies, status",
      )
      .eq("id", taskId)
      .eq("user_id", user.id)
      .single();

    if (taskError || !taskData) {
      return NextResponse.json(
        {
          success: false,
          error: "Build task not found",
          details: taskError?.message,
        },
        { status: 404 },
      );
    }

    const task = taskData as TaskRecord;

    // Duplicate draft check — before calling Claude so no tokens are wasted.
    // One issue draft per build task.
    const { data: existingDrafts, error: existingDraftError } = await supabase
      .from("github_issue_drafts")
      .select("id")
      .eq("user_id", user.id)
      .eq("task_id", task.id)
      .limit(1);

    if (existingDraftError) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to check for existing issue draft",
          details: existingDraftError.message,
        },
        { status: 500 },
      );
    }

    if (existingDrafts && existingDrafts.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Duplicate issue draft",
          details: "Issue draft already exists for this task.",
          existingDraftId: existingDrafts[0].id,
        },
        { status: 409 },
      );
    }

    let client: ClientRecord | null = null;

    if (task.client_id) {
      const { data: clientData } = await supabase
        .from("clients")
        .select("id, name, company, website")
        .eq("id", task.client_id)
        .eq("user_id", user.id)
        .maybeSingle();

      client = (clientData as ClientRecord | null) ?? null;
    }

    let proposal: ProposalRecord | null = null;

    if (task.proposal_id) {
      const { data: proposalData } = await supabase
        .from("proposals")
        .select("id, project_brief_id, proposal_summary, approved")
        .eq("id", task.proposal_id)
        .eq("user_id", user.id)
        .maybeSingle();

      proposal = (proposalData as ProposalRecord | null) ?? null;
    }

    let brief: BriefRecord | null = null;

    if (proposal?.project_brief_id) {
      const { data: briefData } = await supabase
        .from("project_briefs")
        .select("id, project_type, problem, mvp_features, estimated_complexity")
        .eq("id", proposal.project_brief_id)
        .eq("user_id", user.id)
        .maybeSingle();

      brief = (briefData as BriefRecord | null) ?? null;
    }

    const { data: issueDraft, usage } = await generateStructured({
      system: issueDraftAgentPrompt,
      maxTokens: 2500,
      schema: issueDraftSchema,
      toolName: "record_issue_draft",
      user: buildIssueDraftUserPrompt(task, client, proposal, brief),
    });

    await recordAiUsage(supabase, {
      userId: user.id,
      kind: "issue_draft",
      usage,
      clientId: task.client_id,
      proposalId: task.proposal_id,
    });

    const { data: savedDraft, error: insertError } = await supabase
      .from("github_issue_drafts")
      .insert({
        user_id: user.id,
        task_id: task.id,
        client_id: task.client_id,
        proposal_id: task.proposal_id,
        title: issueDraft.title,
        body: issueDraft.body,
        labels: issueDraft.labels.slice(0, 6),
        status: "draft",
        copied: false,
      })
      .select()
      .single();

    if (insertError || !savedDraft) {
      console.error("Issue draft insert error:", insertError);

      if (isDuplicateDatabaseError(insertError)) {
        return NextResponse.json(
          {
            success: false,
            error: "Duplicate issue draft",
            details: "Issue draft already exists for this task.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: "Failed to save issue draft",
          details: insertError?.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      issueDraft: savedDraft,
    });
  } catch (error: unknown) {
    console.error("GitHub issue draft agent error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid issue draft request or response",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate issue draft",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
