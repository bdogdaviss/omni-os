import { NextResponse } from "next/server";

import { isAutomationPaused } from "@/lib/automation-pause";
import { verifyGitHubSignature } from "@/lib/github/webhook";
import {
  AGENT_BRANCH_PATTERN,
  advanceRunOnGreen,
  blockRun,
  findActiveRunForIssue,
  holdRunForPause,
} from "@/lib/pipeline/run";
import { createAdminClient } from "@/lib/supabase/admin";
import { taskStatusUpdatePayload } from "@/lib/task-status";

// GitHub -> Omni OS. The loop-closer: when an agent's PR merges on GitHub, the
// linked issue auto-closes ("Closes #N"), GitHub POSTs here, and the task the
// issue came from flips to done — no human walking back to the dashboard.
//
// Trust model: this route is unauthenticated (GitHub is the caller), so the
// HMAC signature over the raw body is the entire gate. Verified against
// GITHUB_WEBHOOK_SECRET — the same value configured on the GitHub App's
// webhook settings page.
//
// Handled events: issues.closed (task -> done), issues.reopened (task ->
// in_progress), and workflow_run.completed — the pipeline's drive signal:
// "Omni PR check" green on an agent/issue-N branch merges the PR to staging
// and dispatches the next task; a red check (or a failed agent run) blocks the
// run. Everything else is acknowledged and ignored — always 2xx so GitHub
// doesn't mark deliveries failed and eventually disable the hook.
// ponytail: the routing is a flat if-chain until there are enough events to
// earn a dispatch table.

type IssueEventPayload = {
  action?: string;
  issue?: { number?: number; html_url?: string };
  repository?: { full_name?: string };
  workflow_run?: {
    name?: string;
    conclusion?: string | null;
    head_branch?: string;
    pull_requests?: { number?: number }[];
  };
};

// Must match the `name:` fields in lib/github/agent-workflow-template.ts.
const PR_CHECK_WORKFLOW = "Omni PR check";
const AGENT_WORKFLOW = "Omni issue to PR";
const LEGACY_AGENT_WORKFLOW = "Claude issue to PR";

type DraftRow = {
  id: string;
  task_id: string | null;
  user_id: string | null;
  client_id: string | null;
  project_id: string | null;
};

export async function POST(req: Request) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();

  if (!secret) {
    // Misconfiguration, not an attack — but without the secret nothing can be
    // verified, so nothing may be processed.
    return NextResponse.json(
      { error: "GITHUB_WEBHOOK_SECRET is not configured." },
      { status: 503 },
    );
  }

  // Raw body first: the signature covers these exact bytes.
  const rawBody = await req.text();

  if (
    !verifyGitHubSignature(
      rawBody,
      req.headers.get("x-hub-signature-256"),
      secret,
    )
  ) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  const event = req.headers.get("x-github-event") ?? "";

  let payload: IssueEventPayload;
  try {
    payload = JSON.parse(rawBody) as IssueEventPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (event === "ping") {
    return NextResponse.json({ success: true, pong: true });
  }

  const action = payload.action ?? "";

  if (event === "workflow_run" && action === "completed") {
    return handleWorkflowRunCompleted(payload);
  }

  if (event !== "issues" || (action !== "closed" && action !== "reopened")) {
    return NextResponse.json({ success: true, ignored: `${event}.${action}` });
  }

  const repoFullName = payload.repository?.full_name;
  const issueNumber = payload.issue?.number;

  if (!repoFullName || typeof issueNumber !== "number") {
    return NextResponse.json({ success: true, ignored: "incomplete payload" });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (error) {
    // Signature was valid, so GitHub really did deliver this — a 5xx makes it
    // retry once the service-role key is configured.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Not configured." },
      { status: 503 },
    );
  }

  // The published draft is the bridge: (repo, issue number) -> task.
  const { data: draftRows, error: draftError } = await supabase
    .from("github_issue_drafts")
    .select("id, task_id, user_id, client_id, project_id")
    .eq("github_repo", repoFullName)
    .eq("github_issue_number", issueNumber)
    .eq("published_to_github", true)
    .limit(1);

  if (draftError) {
    return NextResponse.json(
      { error: `Draft lookup failed: ${draftError.message}` },
      { status: 500 },
    );
  }

  const draft = (draftRows?.[0] as DraftRow | undefined) ?? null;

  if (!draft) {
    // An issue we didn't publish (or a repo we don't track) — fine.
    return NextResponse.json({ success: true, handled: false });
  }

  const warnings: string[] = [];
  let taskUpdated = false;

  if (draft.task_id && draft.user_id) {
    const status = action === "closed" ? "done" : "in_progress";

    const { data: existing } = await supabase
      .from("build_tasks")
      .select("started_at")
      .eq("id", draft.task_id)
      .eq("user_id", draft.user_id)
      .maybeSingle();

    const { error: taskError } = await supabase
      .from("build_tasks")
      .update(
        taskStatusUpdatePayload(
          status,
          (existing as { started_at?: string | null } | null)?.started_at,
        ),
      )
      .eq("id", draft.task_id)
      .eq("user_id", draft.user_id);

    if (taskError) {
      warnings.push(`Task update failed: ${taskError.message}`);
    } else {
      taskUpdated = true;
    }
  }

  // Best-effort bookkeeping: the link row and the audit trail. Neither failure
  // should make GitHub retry a delivery whose task update already happened.
  const { error: linkError } = await supabase
    .from("github_issue_links")
    .update({ status: action })
    .eq("issue_draft_id", draft.id);

  if (linkError) {
    warnings.push(`Issue link update failed: ${linkError.message}`);
  }

  const { error: activityError } = await supabase.from("activity_events").insert({
    user_id: draft.user_id,
    client_id: draft.client_id,
    project_id: draft.project_id,
    event_type: `github_issue_${action}`,
    title: `GitHub issue ${action}`,
    description: `Issue #${issueNumber} in ${repoFullName} was ${action}${
      taskUpdated
        ? action === "closed"
          ? "; task marked done"
          : "; task reopened as in progress"
        : ""
    }.`,
    metadata: {
      source: "webhook",
      repositoryFullName: repoFullName,
      issueNumber,
      issueUrl: payload.issue?.html_url ?? null,
      issueDraftId: draft.id,
      taskId: draft.task_id,
    },
  });

  if (activityError) {
    warnings.push(`Activity event failed: ${activityError.message}`);
  }

  return NextResponse.json({
    success: true,
    handled: true,
    taskUpdated,
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}

// The pipeline's drive signal. Two workflows report here: the independent
// "Omni PR check" (its green is the merge trigger) and the agent's own
// "Claude issue to PR" (its failure blocks the run early instead of waiting
// on a PR that will never open).
async function handleWorkflowRunCompleted(payload: IssueEventPayload) {
  const name = payload.workflow_run?.name ?? "";
  const conclusion = payload.workflow_run?.conclusion ?? "";
  const headBranch = payload.workflow_run?.head_branch ?? "";
  const repoFullName = payload.repository?.full_name;

  const branchMatch = headBranch.match(AGENT_BRANCH_PATTERN);

  if (
    !repoFullName ||
    !branchMatch ||
    (name !== PR_CHECK_WORKFLOW && name !== AGENT_WORKFLOW && name !== LEGACY_AGENT_WORKFLOW)
  ) {
    // A human's branch, or some unrelated workflow — not ours to orchestrate.
    return NextResponse.json({ success: true, ignored: `workflow_run:${name}` });
  }

  const issueNumber = Number(branchMatch[1]);

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Not configured." },
      { status: 503 },
    );
  }

  const active = await findActiveRunForIssue(supabase, repoFullName, issueNumber);

  if (!active) {
    // A manually dispatched agent, or a finished/canceled run.
    return NextResponse.json({ success: true, handled: false });
  }

  if (name === AGENT_WORKFLOW || name === LEGACY_AGENT_WORKFLOW) {
    if (conclusion === "success") {
      // Agent finished and (should have) opened a PR; the PR check's own
      // workflow_run event is what advances the pipeline.
      return NextResponse.json({ success: true, handled: true, waiting: "pr check" });
    }

    await blockRun(
      supabase,
      active.run,
      `The coding agent run for issue #${issueNumber} ended with "${conclusion}" before opening a PR.`,
    );
    return NextResponse.json({ success: true, handled: true, blocked: true });
  }

  // Omni PR check.
  if (conclusion === "success") {
    const prNumber = payload.workflow_run?.pull_requests?.[0]?.number ?? null;

    // The global pause holds the merge instead of dropping the event: the
    // run blocks with the event stashed, and resuming automation replays it.
    if (await isAutomationPaused(supabase, active.run.user_id)) {
      await holdRunForPause(supabase, active.run, {
        issueNumber,
        headBranch,
        prNumber,
      });
      return NextResponse.json({ success: true, handled: true, held: true });
    }

    await advanceRunOnGreen(supabase, active.run, issueNumber, headBranch, prNumber);
    return NextResponse.json({ success: true, handled: true });
  }

  await blockRun(
    supabase,
    active.run,
    `The build check on ${headBranch} concluded "${conclusion}" — the PR was not merged.`,
  );
  return NextResponse.json({ success: true, handled: true, blocked: true });
}
