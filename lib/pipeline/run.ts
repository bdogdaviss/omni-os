// The automated build pipeline's state machine.
//
// A run walks its task queue strictly serially: dispatch task N (generate the
// issue draft if missing, publish the GitHub issue, add the agent:build
// label), wait for GitHub to report the PR check green, squash-merge the PR
// into staging, mark the task done, dispatch N+1. Serial because each task
// branches from staging and must see its dependencies' merged code.
//
// Everything here runs on the service-role client: the caller is either the
// start route (which authenticated the user and passes their id) or the
// webhook (authenticated by HMAC, no session). All queries scope by the run's
// user_id explicitly.
//
// ponytail: no stall detection. If GitHub never delivers the check event (a
// wedged Action, a dropped webhook), the run sits in `running` forever with no
// timeout. The GitHub UI shows exactly where it stopped; cancel + restart
// re-dispatches the current task. Upgrade path: a cron that blocks runs whose
// updated_at is older than ~90 minutes.

import type { SupabaseClient } from "@supabase/supabase-js";

import { generateStructured } from "@/lib/ai/generate";
import { recordAiUsage } from "@/lib/ai/usage";
import { getGitHubInstallationToken } from "@/lib/github/app-auth";
import { AGENT_BUILD_LABEL, AGENT_BUILD_OPENAI_LABEL, agentBuildLabel } from "@/lib/github/agent-workflow-template";
import {
  addIssueLabels,
  closeIssue,
  createIssueComment,
  ensureBranch,
  ensureRepoLabel,
  findOpenPullRequestByHead,
  githubJson,
  mergePullRequest,
  removeIssueLabel,
} from "@/lib/github/github-api";
import { toLabelList } from "@/lib/github/validation";
import { taskStatusUpdatePayload } from "@/lib/task-status";
import {
  buildIssueDraftUserPrompt,
  issueDraftAgentPrompt,
  issueDraftSchema,
} from "./issue-draft";

export const STAGING_BRANCH = "staging";
export const AGENT_BRANCH_PATTERN = /^agent\/issue-(\d+)$/;

export type PipelineRun = {
  id: string;
  user_id: string;
  proposal_id: string;
  repository_id: string | null;
  status: string;
  task_queue: string[];
  position: number;
  agent_provider: "claude" | "openai";
};

type RepoRecord = {
  id: string;
  owner: string;
  name: string;
  full_name: string;
  installation_id: string | null;
};

function asQueue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function toPipelineRun(row: Record<string, unknown>): PipelineRun {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    proposal_id: row.proposal_id as string,
    repository_id: (row.repository_id as string | null) ?? null,
    status: (row.status as string) ?? "running",
    task_queue: asQueue(row.task_queue),
    position: (row.position as number) ?? 0,
    agent_provider: row.agent_provider === "openai" ? "openai" : "claude",
  };
}

async function loadRepo(
  admin: SupabaseClient,
  run: PipelineRun,
): Promise<RepoRecord> {
  const { data, error } = await admin
    .from("github_repositories")
    .select("id, owner, name, full_name, installation_id")
    .eq("id", run.repository_id)
    .eq("user_id", run.user_id)
    .single();

  if (error || !data) {
    throw new Error(`Pipeline repository not found: ${error?.message}`);
  }

  return data as RepoRecord;
}

async function logActivity(
  admin: SupabaseClient,
  run: PipelineRun,
  eventType: string,
  title: string,
  description: string,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await admin.from("activity_events").insert({
    user_id: run.user_id,
    event_type: eventType,
    title,
    description,
    metadata: { source: "pipeline", runId: run.id, ...metadata },
  });

  if (error) {
    console.warn(`Pipeline activity event failed: ${error.message}`);
  }
}

/** Mark the current task blocked and freeze the run. Nothing advances after. */
export async function blockRun(
  admin: SupabaseClient,
  run: PipelineRun,
  reason: string,
) {
  const taskId = run.task_queue[run.position];

  if (taskId) {
    // existingStartedAt only matters for in_progress; null is fine here.
    await admin
      .from("build_tasks")
      .update(taskStatusUpdatePayload("blocked", null))
      .eq("id", taskId)
      .eq("user_id", run.user_id);
  }

  await admin
    .from("pipeline_runs")
    .update({
      status: "blocked",
      last_error: reason.slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", run.id);

  await logActivity(
    admin,
    run,
    "pipeline_blocked",
    "Build pipeline blocked",
    reason.slice(0, 300),
    { taskId },
  );
}

/**
 * Dispatch the task at run.position: draft (AI, if missing) -> real GitHub
 * issue (if not yet published) -> agent:build label. Throws on failure; the
 * caller decides whether that blocks the run.
 */
export async function dispatchCurrentTask(
  admin: SupabaseClient,
  run: PipelineRun,
): Promise<{ issueNumber: number }> {
  const taskId = run.task_queue[run.position];

  if (!taskId) {
    throw new Error(`No task at queue position ${run.position}`);
  }

  const { data: task, error: taskError } = await admin
    .from("build_tasks")
    .select(
      "id, proposal_id, client_id, project_id, title, description, category, priority, estimated_effort, acceptance_criteria, dependencies, status",
    )
    .eq("id", taskId)
    .eq("user_id", run.user_id)
    .single();

  if (taskError || !task) {
    throw new Error(`Task ${taskId} not found: ${taskError?.message}`);
  }

  const repo = await loadRepo(admin, run);

  if (!repo.installation_id) {
    throw new Error(`Repository ${repo.full_name} has no GitHub App installation.`);
  }

  const token = await getGitHubInstallationToken(repo.installation_id);

  // 1. Draft: reuse an existing one, otherwise generate.
  let { data: draft } = await admin
    .from("github_issue_drafts")
    .select(
      "id, title, body, labels, github_issue_number, published_to_github, client_id, project_id",
    )
    .eq("task_id", task.id)
    .eq("user_id", run.user_id)
    .limit(1)
    .maybeSingle();

  if (!draft) {
    const [{ data: client }, { data: proposal }] = await Promise.all([
      admin
        .from("clients")
        .select("id, name, company, website")
        .eq("id", task.client_id)
        .maybeSingle(),
      admin
        .from("proposals")
        .select("id, project_brief_id, proposal_summary, approved")
        .eq("id", run.proposal_id)
        .maybeSingle(),
    ]);

    const { data: brief } = proposal?.project_brief_id
      ? await admin
          .from("project_briefs")
          .select("id, project_type, problem, mvp_features, estimated_complexity")
          .eq("id", proposal.project_brief_id)
          .maybeSingle()
      : { data: null };

    const { data: generated, usage } = await generateStructured({
      system: issueDraftAgentPrompt,
      maxTokens: 2500,
      schema: issueDraftSchema,
      toolName: "record_issue_draft",
      user: buildIssueDraftUserPrompt(task, client, proposal, brief),
    });

    await recordAiUsage(admin, {
      userId: run.user_id,
      kind: "issue_draft",
      usage,
      clientId: task.client_id,
      proposalId: run.proposal_id,
    });

    const { data: savedDraft, error: draftInsertError } = await admin
      .from("github_issue_drafts")
      .insert({
        user_id: run.user_id,
        task_id: task.id,
        client_id: task.client_id,
        proposal_id: run.proposal_id,
        project_id: task.project_id ?? null,
        title: generated.title,
        body: generated.body,
        labels: generated.labels.slice(0, 6),
        status: "draft",
        copied: false,
      })
      .select(
        "id, title, body, labels, github_issue_number, published_to_github, client_id, project_id",
      )
      .single();

    if (draftInsertError || !savedDraft) {
      throw new Error(`Draft insert failed: ${draftInsertError?.message}`);
    }

    draft = savedDraft;
  }

  // 2. Publish the issue if this draft never reached GitHub.
  let issueNumber = draft.github_issue_number as number | null;

  if (!draft.published_to_github || !issueNumber) {
    const labels = toLabelList(draft.labels);
    const issueRes = await githubJson<{ number: number; html_url: string }>(
      `/repos/${repo.owner}/${repo.name}/issues`,
      {
        method: "POST",
        body: JSON.stringify({
          title: draft.title,
          body: draft.body,
          ...(labels.length > 0 ? { labels } : {}),
        }),
      },
      token,
    ).catch(async (labelError: unknown) => {
      // Retry without labels ONLY on a 422 (GitHub rejected the labels, issue
      // was not created). Any other failure re-throws — a blind retry after
      // e.g. a timeout could create the same issue twice.
      const message = labelError instanceof Error ? labelError.message : "";

      if (!message.includes("(422)")) {
        throw labelError;
      }

      console.warn("Issue create rejected the labels (422); retrying without.");
      return githubJson<{ number: number; html_url: string }>(
        `/repos/${repo.owner}/${repo.name}/issues`,
        {
          method: "POST",
          body: JSON.stringify({ title: draft.title, body: draft.body }),
        },
        token,
      );
    });

    issueNumber = issueRes.number;

    await admin
      .from("github_issue_drafts")
      .update({
        published_to_github: true,
        published_at: new Date().toISOString(),
        publish_status: "published",
        publish_error: null,
        github_repo: repo.full_name,
        github_issue_number: issueNumber,
        github_issue_url: issueRes.html_url,
        selected_repository_id: repo.id,
      })
      .eq("id", draft.id);

    const { error: linkError } = await admin.from("github_issue_links").insert({
      user_id: run.user_id,
      issue_draft_id: draft.id,
      task_id: task.id,
      project_id: draft.project_id ?? null,
      client_id: draft.client_id ?? null,
      repository_id: repo.id,
      repository_full_name: repo.full_name,
      issue_number: issueNumber,
      issue_url: issueRes.html_url,
      status: "created",
    });

    if (linkError) {
      console.warn(`Issue link insert failed (continuing): ${linkError.message}`);
    }
  }

  // 3. Dispatch the agent: ensure + re-add the trigger label (remove first so
  // the absent -> present transition always fires the workflow).
  const agentLabel = agentBuildLabel(run.agent_provider);
  await ensureRepoLabel(
    token,
    repo.owner,
    repo.name,
    agentLabel,
    "5319e7",
    "Omni OS: run the coding agent on this issue",
  ).catch(() => null);
  await Promise.all([
    removeIssueLabel(token, repo.owner, repo.name, issueNumber, AGENT_BUILD_LABEL).catch(() => null),
    removeIssueLabel(token, repo.owner, repo.name, issueNumber, AGENT_BUILD_OPENAI_LABEL).catch(() => null),
  ]);

  const labelRes = await addIssueLabels(token, repo.owner, repo.name, issueNumber, [
    agentLabel,
  ]);

  if (!labelRes.ok) {
    const detail = await labelRes.text().catch(() => "");
    throw new Error(`Dispatch label failed (${labelRes.status}): ${detail.slice(0, 200)}`);
  }

  await createIssueComment(
    token,
    repo.owner,
    repo.name,
    issueNumber,
    `🤖 **Dispatched by the Omni OS build pipeline** (task ${run.position + 1} of ${run.task_queue.length}) using ${run.agent_provider === "openai" ? "OpenAI Codex" : "Claude Code"}.\n\nThe coding agent will implement this issue and open a pull request against \`${STAGING_BRANCH}\`. Omni OS merges it automatically once the independent build check passes.`,
  ).catch(() => null);

  await admin
    .from("build_tasks")
    .update(taskStatusUpdatePayload("in_progress", null))
    .eq("id", task.id)
    .eq("user_id", run.user_id);

  await admin
    .from("pipeline_runs")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", run.id);

  await logActivity(
    admin,
    run,
    "pipeline_dispatched",
    "Coding agent dispatched",
    `Task ${run.position + 1}/${run.task_queue.length} ("${task.title}") dispatched as issue #${issueNumber} in ${repo.full_name}.`,
    { taskId: task.id, issueNumber, agentProvider: run.agent_provider },
  );

  return { issueNumber };
}

/**
 * The PR check finished green for an agent branch: merge to staging, close the
 * issue, mark the task done, and dispatch the next task (or complete the run).
 */
export async function advanceRunOnGreen(
  admin: SupabaseClient,
  run: PipelineRun,
  issueNumber: number,
  headBranch: string,
  prNumberFromEvent: number | null,
) {
  const repo = await loadRepo(admin, run);
  const token = await getGitHubInstallationToken(repo.installation_id!);
  const taskId = run.task_queue[run.position];

  const prNumber =
    prNumberFromEvent ??
    (await findOpenPullRequestByHead(token, repo.owner, repo.name, headBranch))?.number ??
    null;

  if (!prNumber) {
    await blockRun(admin, run, `PR check passed for ${headBranch} but no open PR was found.`);
    return;
  }

  const mergeRes = await mergePullRequest(
    token,
    repo.owner,
    repo.name,
    prNumber,
    `Task ${run.position + 1}/${run.task_queue.length}: close #${issueNumber} (pipeline auto-merge)`,
  );

  if (!mergeRes.ok) {
    const detail = await mergeRes.text().catch(() => "");
    await blockRun(
      admin,
      run,
      `Merge of PR #${prNumber} failed (${mergeRes.status}): ${detail.slice(0, 200)}`,
    );
    await createIssueComment(
      token,
      repo.owner,
      repo.name,
      issueNumber,
      `⚠️ The pipeline could not merge PR #${prNumber} (status ${mergeRes.status} — likely a conflict with ${STAGING_BRANCH}). The run is blocked until this is resolved manually.`,
    ).catch(() => null);
    return;
  }

  // Merged. Close the issue ourselves — staging merges never auto-close.
  await closeIssue(token, repo.owner, repo.name, issueNumber).catch(() => null);

  await admin
    .from("build_tasks")
    .update(taskStatusUpdatePayload("done", null))
    .eq("id", taskId)
    .eq("user_id", run.user_id);

  await logActivity(
    admin,
    run,
    "pipeline_merged",
    "Agent PR merged to staging",
    `PR #${prNumber} (issue #${issueNumber}) merged into ${STAGING_BRANCH} in ${repo.full_name}.`,
    { taskId, issueNumber, prNumber },
  );

  const nextPosition = run.position + 1;

  if (nextPosition >= run.task_queue.length) {
    await admin
      .from("pipeline_runs")
      .update({ status: "completed", position: nextPosition, updated_at: new Date().toISOString() })
      .eq("id", run.id);

    await logActivity(
      admin,
      run,
      "pipeline_completed",
      "Build pipeline completed",
      `All ${run.task_queue.length} tasks merged into ${STAGING_BRANCH} in ${repo.full_name}.`,
    );
    return;
  }

  await admin
    .from("pipeline_runs")
    .update({ position: nextPosition, updated_at: new Date().toISOString() })
    .eq("id", run.id);

  const advanced: PipelineRun = { ...run, position: nextPosition };

  try {
    await dispatchCurrentTask(admin, advanced);
  } catch (error) {
    await blockRun(
      admin,
      advanced,
      `Dispatch of task ${nextPosition + 1} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/**
 * Find the active run that is currently waiting on this repo + issue. Returns
 * null when the event belongs to nothing we're orchestrating (a human's PR, a
 * manually dispatched agent, an old run).
 */
export async function findActiveRunForIssue(
  admin: SupabaseClient,
  repoFullName: string,
  issueNumber: number,
): Promise<{ run: PipelineRun; issueNumber: number } | null> {
  const { data: draftRows } = await admin
    .from("github_issue_drafts")
    .select("task_id, user_id")
    .eq("github_repo", repoFullName)
    .eq("github_issue_number", issueNumber)
    .eq("published_to_github", true)
    .limit(1);

  const draft = draftRows?.[0] as { task_id: string | null; user_id: string } | undefined;

  if (!draft?.task_id) {
    return null;
  }

  const { data: runRows } = await admin
    .from("pipeline_runs")
    .select("*")
    .eq("user_id", draft.user_id)
    .eq("status", "running");

  for (const row of runRows ?? []) {
    const run = toPipelineRun(row as Record<string, unknown>);

    if (run.task_queue[run.position] === draft.task_id) {
      return { run, issueNumber };
    }
  }

  return null;
}

/** Make sure the staging branch exists before the first dispatch. */
export async function ensureStagingBranch(repo: RepoRecord): Promise<"exists" | "created"> {
  const token = await getGitHubInstallationToken(repo.installation_id!);
  return ensureBranch(token, repo.owner, repo.name, STAGING_BRANCH);
}
