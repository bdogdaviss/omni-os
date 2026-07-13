import { NextResponse } from "next/server";
import { z } from "zod";

import { isAutomationPaused } from "@/lib/automation-pause";
import { isRealPublishingEnabled } from "@/lib/github/validation";
import { orderTasksByDependencies } from "@/lib/pipeline/order";
import {
  blockRun,
  dispatchCurrentTask,
  ensureStagingBranch,
  toPipelineRun,
} from "@/lib/pipeline/run";
import { createClient } from "@/lib/supabase/server";

// THE gate. This is the one human approval in the automated pipeline: the
// operator has read the task list and clicks once. Everything downstream —
// issue drafts, real GitHub issues, agent dispatches, merges to staging —
// runs without another confirmation, so this route re-checks every
// precondition rather than trusting the button was rendered correctly.

const startSchema = z.object({
  proposalId: z.string().uuid("A valid proposal ID is required"),
  repositoryId: z.string().uuid("A valid repository ID is required"),
  agentProvider: z.enum(["claude", "openai"]),
});

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

    if (!isRealPublishingEnabled()) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Real GitHub publishing is disabled (GITHUB_REAL_PUBLISHING_ENABLED). The pipeline creates real issues, so it cannot start.",
        },
        { status: 403 },
      );
    }

    if (await isAutomationPaused(supabase, user.id)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Automation is paused. Resume it from the dashboard before starting a build.",
        },
        { status: 409 },
      );
    }

    const body: unknown = await req.json();
    const { proposalId, repositoryId, agentProvider } = startSchema.parse(body);

    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select("id, approved, client_id")
      .eq("id", proposalId)
      .eq("user_id", user.id)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { success: false, error: "Proposal not found." },
        { status: 404 },
      );
    }

    if (!proposal.approved) {
      return NextResponse.json(
        { success: false, error: "Proposal must be approved before starting a build." },
        { status: 403 },
      );
    }

    const { data: repo, error: repoError } = await supabase
      .from("github_repositories")
      .select("id, owner, name, full_name, installation_id")
      .eq("id", repositoryId)
      .eq("user_id", user.id)
      .single();

    if (repoError || !repo) {
      return NextResponse.json(
        { success: false, error: "Repository not found." },
        { status: 404 },
      );
    }

    if (!repo.installation_id) {
      return NextResponse.json(
        {
          success: false,
          error: `${repo.full_name} has no GitHub App installation. Run "Setup coding agent" on it first.`,
        },
        { status: 400 },
      );
    }

    const { data: taskRows, error: tasksError } = await supabase
      .from("build_tasks")
      .select("id, title, dependencies, status")
      .eq("proposal_id", proposalId)
      .eq("user_id", user.id)
      .neq("status", "done")
      .order("created_at", { ascending: true });

    if (tasksError) {
      return NextResponse.json(
        { success: false, error: `Could not load tasks: ${tasksError.message}` },
        { status: 500 },
      );
    }

    const tasks = taskRows ?? [];

    if (tasks.length === 0) {
      return NextResponse.json(
        { success: false, error: "No open build tasks for this proposal." },
        { status: 400 },
      );
    }

    const { data: existingRuns } = await supabase
      .from("pipeline_runs")
      .select("id, status")
      .eq("proposal_id", proposalId)
      .in("status", ["running", "blocked"]);

    if ((existingRuns ?? []).length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "A pipeline run is already active for this proposal. Cancel it first.",
        },
        { status: 409 },
      );
    }

    // Dependencies decide dispatch order; staging must exist before the first
    // agent branches from it.
    const queue = orderTasksByDependencies(tasks);
    const stagingOutcome = await ensureStagingBranch(repo);

    const { data: runRow, error: runError } = await supabase
      .from("pipeline_runs")
      .insert({
        user_id: user.id,
        proposal_id: proposalId,
        repository_id: repo.id,
        status: "running",
        task_queue: queue,
        position: 0,
        agent_provider: agentProvider,
      })
      .select()
      .single();

    if (runError || !runRow) {
      return NextResponse.json(
        { success: false, error: `Could not create the run: ${runError?.message}` },
        { status: 500 },
      );
    }

    const run = toPipelineRun(runRow as Record<string, unknown>);

    try {
      const { issueNumber } = await dispatchCurrentTask(supabase, run);

      return NextResponse.json({
        success: true,
        runId: run.id,
        taskCount: queue.length,
        staging: stagingOutcome,
        firstIssue: issueNumber,
      });
    } catch (dispatchError) {
      const reason =
        dispatchError instanceof Error ? dispatchError.message : String(dispatchError);
      await blockRun(supabase, run, `First dispatch failed: ${reason}`);

      return NextResponse.json(
        {
          success: false,
          error: `The run was created but the first dispatch failed: ${reason}`,
          runId: run.id,
        },
        { status: 502 },
      );
    }
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    console.error("Pipeline start error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Could not start the pipeline.",
      },
      { status: 500 },
    );
  }
}
