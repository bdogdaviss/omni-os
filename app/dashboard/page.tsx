import Link from "next/link";
import { Suspense } from "react";

import { DashboardNav } from "@/components/dashboard-nav";
import { PauseAutomationButton } from "@/components/pause-automation-button";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatUsd, sumUsdCents } from "@/lib/ai/cost";
import { toUsage } from "@/lib/ai/usage";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatDueDate, getDueDateState } from "@/lib/task-dates";
import { isRealPublishingEnabled } from "@/lib/github/validation";

type ClientRecord = {
  id: string;
  name: string | null;
  company: string | null;
  created_at: string | null;
};

type BriefRecord = {
  id: string;
  client_id: string | null;
  project_type: string | null;
  approved: boolean | null;
  created_at: string | null;
};

type ProposalRecord = {
  id: string;
  client_id: string | null;
  proposal_summary: string | null;
  approved: boolean | null;
  sent: boolean | null;
  created_at: string | null;
};

type PipelineRunRecord = {
  id: string;
  proposal_id: string | null;
  status: string;
  task_queue: unknown;
  position: number | null;
};

type ActivityRecord = {
  id: string;
  client_id: string | null;
  project_id: string | null;
  title: string;
  description: string | null;
  created_at: string | null;
};

type TaskRecord = {
  id: string;
  client_id: string | null;
  project_id: string | null;
  title: string | null;
  category: string | null;
  priority: string | null;
  status: string | null;
  owner: string | null;
  due_date: string | null;
  created_at: string | null;
};

const TASK_STATUS_ORDER = [
  "draft",
  "to_do",
  "in_progress",
  "blocked",
  "done",
] as const;

type TaskStatus = (typeof TASK_STATUS_ORDER)[number];

function formatDate(value: string | null) {
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function truncateText(value: string | null | undefined, max = 120) {
  if (!value?.trim()) {
    return "No summary";
  }

  const trimmed = value.trim();

  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
}

function asText(value: string | null | undefined, fallback = "Not set") {
  return value?.trim() ? value : fallback;
}

function normalizeTaskStatus(value: string | null | undefined): TaskStatus {
  const candidate = (value ?? "draft").toLowerCase();

  return (TASK_STATUS_ORDER as readonly string[]).includes(candidate)
    ? (candidate as TaskStatus)
    : "draft";
}

function formatTaskStatusLabel(value: string | null | undefined) {
  switch (normalizeTaskStatus(value)) {
    case "to_do":
      return "To Do";
    case "in_progress":
      return "In Progress";
    case "blocked":
      return "Blocked";
    case "done":
      return "Done";
    case "draft":
    default:
      return "Draft";
  }
}

function isSentSchemaError(errorMessage: string) {
  const message = errorMessage.toLowerCase();

  return (
    message.includes("sent") ||
    message.includes("sent_at") ||
    message.includes("sent_method") ||
    message.includes("schema cache")
  );
}

function isMissingTableError(errorMessage: string) {
  const message = errorMessage.toLowerCase();

  return (
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

function LoginPrompt() {
  return (
    <Card className="rounded-lg border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle>Log in to open the command center</CardTitle>
        <CardDescription>
          Omni OS keeps everything scoped to your account. Sign in to see your
          clients, briefs, proposals, and build tasks.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button asChild>
          <Link href="/auth/login">Log in</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="rounded-lg border-destructive/40 shadow-sm">
      <CardHeader>
        <CardTitle>Could not load the dashboard</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function SentBadge({ sent }: { sent: boolean | null }) {
  return sent ? (
    <Badge className="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50">
      Sent
    </Badge>
  ) : (
    <Badge variant="outline">Not Sent</Badge>
  );
}

function EmptyRow({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground">{message}</p>;
}

function DashboardFallback() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {["Clients", "Briefs", "Proposals", "Projects"].map((label) => (
        <StatCard key={label} label={label} value={0} />
      ))}
    </div>
  );
}

async function DashboardContent() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return <LoginPrompt />;
  }

  // Spend resets on the 1st, server-local time — single operator, close enough.
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    clientsRes,
    leadsRes,
    briefsRes,
    proposalsWithSentRes,
    tasksRes,
    issueDraftsRes,
    launchChecklistsRes,
    projectsRes,
    githubReposRes,
    publishedIssuesRes,
    pipelineRunsRes,
    activityRes,
    automationSettingsRes,
    aiUsageRes,
  ] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, name, company, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase
        .from("project_briefs")
        .select("id, client_id, project_type, approved, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("proposals")
        .select("id, client_id, proposal_summary, approved, sent, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("build_tasks")
        .select(
          "id, client_id, project_id, title, category, priority, status, owner, due_date, created_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("github_issue_drafts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id),
      supabase
        .from("launch_checklists")
        .select(
          "id, client_id, title, overall_status, readiness_score, created_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("projects")
        .select("id, client_id, proposal_id, name, status, priority, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("github_repositories")
        .select("id, synced_from_github")
        .eq("user_id", user.id),
      supabase
        .from("github_issue_drafts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("published_to_github", true),
      supabase
        .from("pipeline_runs")
        .select("id, proposal_id, status, task_queue, position")
        .eq("user_id", user.id)
        .in("status", ["running", "blocked"])
        .order("updated_at", { ascending: false }),
      supabase
        .from("activity_events")
        .select(
          "id, client_id, project_id, title, description, created_at",
        )
        .eq("user_id", user.id)
        .neq("event_type", "ai_usage")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("automation_settings")
        .select("paused")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("activity_events")
        .select("metadata")
        .eq("user_id", user.id)
        .eq("event_type", "ai_usage")
        .gte("created_at", monthStart.toISOString()),
    ]);

  // Proposals: fall back to a query without sent-tracking columns if they are
  // not enabled yet, mirroring the /proposals page behavior.
  let proposals = (proposalsWithSentRes.data ?? []) as ProposalRecord[];
  let proposalsError = proposalsWithSentRes.error;

  if (proposalsError && isSentSchemaError(proposalsError.message)) {
    const proposalsWithoutSentRes = await supabase
      .from("proposals")
      .select("id, client_id, proposal_summary, approved, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    proposals = ((proposalsWithoutSentRes.data ?? []) as ProposalRecord[]).map(
      (proposal) => ({ ...proposal, sent: false }),
    );
    proposalsError = proposalsWithoutSentRes.error;
  }

  // Core tables (clients, briefs, proposals) always exist — surface a real
  // error clearly instead of rendering a misleading empty dashboard.
  const coreError = clientsRes.error || briefsRes.error || proposalsError;

  if (coreError) {
    return <ErrorCard message={coreError.message} />;
  }

  const clients = (clientsRes.data ?? []) as ClientRecord[];
  const clientsById = new Map<string, ClientRecord>();
  for (const client of clients) {
    clientsById.set(client.id, client);
  }

  const briefs = (briefsRes.data ?? []) as BriefRecord[];

  // build_tasks degrades gracefully if the table has not been created yet.
  const tasksTableMissing =
    Boolean(tasksRes.error) &&
    isMissingTableError(tasksRes.error?.message ?? "");
  let tasks = (tasksRes.data ?? []) as TaskRecord[];

  // Retry with the base column set if the Phase 4 columns are not present yet.
  if (
    tasksRes.error &&
    !tasksTableMissing &&
    tasksRes.error.message.toLowerCase().includes("column")
  ) {
    const { data: baseTaskData } = await supabase
      .from("build_tasks")
      .select("id, client_id, title, category, priority, status, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    tasks = (baseTaskData ?? []) as TaskRecord[];
  }

  // github_issue_drafts also degrades gracefully if not created yet.
  const issueDraftsMissing = Boolean(issueDraftsRes.error);
  const issueDraftCount = issueDraftsRes.count ?? 0;

  // launch_checklists also degrades gracefully if not created yet.
  const launchChecklistsMissing = Boolean(launchChecklistsRes.error);
  const launchChecklists = (launchChecklistsRes.data ?? []) as {
    id: string;
    client_id: string | null;
    title: string | null;
    overall_status: string | null;
    readiness_score: number | null;
    created_at: string | null;
  }[];
  const recentChecklists = launchChecklists.slice(0, 5);

  // projects also degrades gracefully if not created yet.
  const projectsMissing = Boolean(projectsRes.error);
  const projects = (projectsRes.data ?? []) as {
    id: string;
    client_id: string | null;
    proposal_id: string | null;
    name: string | null;
    status: string | null;
    priority: string | null;
    created_at: string | null;
  }[];
  const projectStatusCount = (status: string) =>
    projects.filter(
      (project) => (project.status ?? "planning").toLowerCase() === status,
    ).length;
  const recentProjects = projects.slice(0, 5);

  // GitHub integration (Phase 10) — degrades gracefully pre-migration.
  const githubReposMissing = Boolean(githubReposRes.error);
  const githubRepos = (githubReposRes.data ?? []) as {
    id: string;
    synced_from_github: boolean | null;
  }[];
  const syncedGithubRepos = githubRepos.filter(
    (repo) => repo.synced_from_github,
  ).length;
  const publishedIssuesMissing = Boolean(publishedIssuesRes.error);
  const publishedIssuesCount = publishedIssuesRes.count ?? 0;
  const githubPublishingEnabled = isRealPublishingEnabled();

  // Automation supervision is best-effort so older databases still get the
  // rest of the dashboard while their pipeline migration is pending.
  const pipelineRuns = (pipelineRunsRes.data ?? []) as PipelineRunRecord[];
  const runningRuns = pipelineRuns.filter((run) => run.status === "running");
  const blockedRuns = pipelineRuns.filter((run) => run.status === "blocked");
  const recentActivity = (activityRes.data ?? []) as ActivityRecord[];

  // Pause + spend are best-effort too: hidden until their migrations land.
  const pauseControlAvailable = !automationSettingsRes.error;
  const automationPaused = Boolean(
    (automationSettingsRes.data as { paused: boolean } | null)?.paused,
  );
  const monthAiUsages = ((aiUsageRes.data ?? []) as { metadata: unknown }[])
    .flatMap((row) => {
      const usage = toUsage(row.metadata);

      return usage ? [usage] : [];
    });
  const monthAiSpend = sumUsdCents(monthAiUsages);

  const clientName = (clientId: string | null) =>
    clientId ? clientsById.get(clientId)?.name ?? null : null;
  const clientCompany = (clientId: string | null) =>
    clientId ? clientsById.get(clientId)?.company ?? null : null;

  const approvedBriefs = briefs.filter((brief) => brief.approved).length;
  const draftBriefs = briefs.length - approvedBriefs;
  const approvedProposals = proposals.filter(
    (proposal) => proposal.approved,
  ).length;
  const sentProposals = proposals.filter((proposal) => proposal.sent).length;
  const briefsAwaitingApproval = briefs.filter((brief) => !brief.approved);
  const proposalsAwaitingApproval = proposals.filter(
    (proposal) => !proposal.approved,
  );
  const approvedProposalsAwaitingSend = proposals.filter(
    (proposal) => proposal.approved && !proposal.sent,
  );

  const taskStatusCounts = TASK_STATUS_ORDER.reduce<Record<TaskStatus, number>>(
    (counts, status) => {
      counts[status] = tasks.filter(
        (task) => normalizeTaskStatus(task.status) === status,
      ).length;

      return counts;
    },
    { draft: 0, to_do: 0, in_progress: 0, blocked: 0, done: 0 },
  );

  // Phase 4 task date + owner counts.
  const overdueTaskCount = tasks.filter(
    (task) => getDueDateState(task.due_date, task.status) === "overdue",
  ).length;
  const dueSoonTaskCount = tasks.filter((task) => {
    const state = getDueDateState(task.due_date, task.status);

    return state === "due_today" || state === "due_soon";
  }).length;
  const unassignedTaskCount = tasks.filter((task) => !task.owner?.trim()).length;

  // Task Attention: overdue first, then blocked, then due soon (deduped).
  const projectNameById = new Map<string, string>();
  const projectIdByProposalId = new Map<string, string>();
  for (const project of projects) {
    projectNameById.set(project.id, project.name ?? "Untitled project");
    if (project.proposal_id) {
      projectIdByProposalId.set(project.proposal_id, project.id);
    }
  }

  const attentionSeen = new Set<string>();
  const taskAttention: {
    task: TaskRecord;
    reason: "Overdue" | "Blocked" | "Due soon";
  }[] = [];

  const addAttention = (
    candidate: TaskRecord,
    reason: "Overdue" | "Blocked" | "Due soon",
  ) => {
    if (attentionSeen.has(candidate.id)) {
      return;
    }

    attentionSeen.add(candidate.id);
    taskAttention.push({ task: candidate, reason });
  };

  for (const task of tasks) {
    if (getDueDateState(task.due_date, task.status) === "overdue") {
      addAttention(task, "Overdue");
    }
  }
  for (const task of tasks) {
    if (normalizeTaskStatus(task.status) === "blocked") {
      addAttention(task, "Blocked");
    }
  }
  for (const task of tasks) {
    const state = getDueDateState(task.due_date, task.status);

    if (state === "due_today" || state === "due_soon") {
      addAttention(task, "Due soon");
    }
  }

  const topAttention = taskAttention.slice(0, 5);

  const recentClients = clients.slice(0, 5);
  const recentBriefs = briefs.slice(0, 3);
  const recentProposals = proposals.slice(0, 3);
  const recentTasks = tasks.slice(0, 5);
  // blockRun flips a run's current task to blocked too — count that incident
  // once (under the run), not again as a blocked task.
  const blockedRunTaskIds = new Set(
    blockedRuns
      .map((run) =>
        Array.isArray(run.task_queue) ? run.task_queue[run.position ?? 0] : null,
      )
      .filter((id): id is string => typeof id === "string"),
  );
  const exceptionalTaskCount = new Set(
    tasks
      .filter(
        (task) =>
          !blockedRunTaskIds.has(task.id) &&
          (normalizeTaskStatus(task.status) === "blocked" ||
            getDueDateState(task.due_date, task.status) === "overdue"),
      )
      .map((task) => task.id),
  ).size;
  const inboxCount =
    briefsAwaitingApproval.length +
    proposalsAwaitingApproval.length +
    approvedProposalsAwaitingSend.length +
    blockedRuns.length +
    exceptionalTaskCount;

  const runProgress = (run: PipelineRunRecord) => {
    const total = Array.isArray(run.task_queue) ? run.task_queue.length : 0;
    const current = total > 0 ? Math.min((run.position ?? 0) + 1, total) : 0;

    return total > 0 ? `Task ${current} of ${total}` : "Preparing task queue";
  };

  const runClientName = (run: PipelineRunRecord) => {
    const proposal = proposals.find(
      (candidate) => candidate.id === run.proposal_id,
    );

    return proposal
      ? asText(clientName(proposal.client_id), "Unassigned client")
      : "Build pipeline";
  };

  const runHref = (run: PipelineRunRecord) => {
    const projectId = run.proposal_id
      ? projectIdByProposalId.get(run.proposal_id)
      : null;

    return projectId ? `/projects/${projectId}#automation` : "/proposals";
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/intake">New Intake</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/tasks">View Tasks</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/proposals">View Proposals</Link>
        </Button>
      </div>

      <section className="space-y-3" id="automation-inbox">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight sm:text-lg">
              Automation Inbox
            </h2>
            <p className="text-sm text-muted-foreground">
              Approvals and exceptions that need you. Everything else keeps
              moving automatically.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {automationPaused ? (
              <StatusBadge label="Automation paused" status="blocked" />
            ) : null}
            <Badge variant={inboxCount > 0 ? "default" : "secondary"}>
              {inboxCount > 0 ? `${inboxCount} need attention` : "All clear"}
            </Badge>
            {pauseControlAvailable ? (
              <PauseAutomationButton paused={automationPaused} />
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-lg border-border/70 shadow-sm">
            <CardHeader className="border-b">
              <CardTitle className="text-base">Needs your decision</CardTitle>
              <CardDescription>
                Human checkpoints before automation continues
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y pt-0">
              {briefsAwaitingApproval.length === 0 &&
              proposalsAwaitingApproval.length === 0 &&
              approvedProposalsAwaitingSend.length === 0 ? (
                <div className="py-4">
                  <EmptyRow message="No approvals are waiting." />
                </div>
              ) : (
                <>
                  {briefsAwaitingApproval.length > 0 ? (
                    <Link
                      className="flex min-h-14 items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40"
                      href="/briefs"
                    >
                      <span className="text-sm font-medium">
                        Review project briefs
                      </span>
                      <Badge variant="secondary">
                        {briefsAwaitingApproval.length}
                      </Badge>
                    </Link>
                  ) : null}
                  {proposalsAwaitingApproval.length > 0 ? (
                    <Link
                      className="flex min-h-14 items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40"
                      href="/proposals"
                    >
                      <span className="text-sm font-medium">
                        Review proposals
                      </span>
                      <Badge variant="secondary">
                        {proposalsAwaitingApproval.length}
                      </Badge>
                    </Link>
                  ) : null}
                  {approvedProposalsAwaitingSend.length > 0 ? (
                    <Link
                      className="flex min-h-14 items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40"
                      href="/proposals"
                    >
                      <span className="text-sm font-medium">
                        Send approved proposals
                      </span>
                      <Badge variant="secondary">
                        {approvedProposalsAwaitingSend.length}
                      </Badge>
                    </Link>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg border-border/70 shadow-sm">
            <CardHeader className="border-b">
              <CardTitle className="text-base">Exceptions</CardTitle>
              <CardDescription>
                Work that stopped or needs intervention
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y pt-0">
              {blockedRuns.length === 0 &&
              taskStatusCounts.blocked === 0 &&
              overdueTaskCount === 0 ? (
                <div className="py-4">
                  <EmptyRow message="No blocked or overdue work." />
                </div>
              ) : (
                <>
                  {blockedRuns.length > 0 ? (
                    <Link
                      className="flex min-h-14 items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40"
                      href="/proposals"
                    >
                      <span className="text-sm font-medium">
                        Blocked build pipelines
                      </span>
                      <StatusBadge
                        label={`${blockedRuns.length}`}
                        status="blocked"
                      />
                    </Link>
                  ) : null}
                  {taskStatusCounts.blocked > 0 ? (
                    <Link
                      className="flex min-h-14 items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40"
                      href="/tasks?status=blocked"
                    >
                      <span className="text-sm font-medium">Blocked tasks</span>
                      <StatusBadge
                        label={`${taskStatusCounts.blocked}`}
                        status="blocked"
                      />
                    </Link>
                  ) : null}
                  {overdueTaskCount > 0 ? (
                    <Link
                      className="flex min-h-14 items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40"
                      href="/tasks?due=overdue"
                    >
                      <span className="text-sm font-medium">Overdue tasks</span>
                  <StatusBadge
                        label={`${overdueTaskCount}`}
                        status="overdue"
                        tone="danger"
                      />
                    </Link>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-3" id="automations">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight sm:text-lg">
              Active Automations
            </h2>
            <p className="text-sm text-muted-foreground">
              Durable runs that continue after you leave this screen
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {aiUsageRes.error ? null : (
              <Badge variant="outline">
                AI spend this month: {formatUsd(monthAiSpend.cents)}
                {monthAiSpend.unpricedCalls > 0
                  ? ` (+${monthAiSpend.unpricedCalls} unpriced)`
                  : ""}
              </Badge>
            )}
            <Badge variant="secondary">{runningRuns.length} running</Badge>
          </div>
        </div>
        <Card className="rounded-lg border-border/70 shadow-sm">
          <CardContent className="divide-y pt-0">
            {pipelineRunsRes.error ? (
              <div className="py-4">
                <EmptyRow message="Automation run tracking is not enabled yet." />
              </div>
            ) : runningRuns.length === 0 ? (
              <div className="py-4">
                <EmptyRow message="No automations are running right now." />
              </div>
            ) : (
              runningRuns.map((run) => (
                <Link
                  className="flex min-h-16 flex-wrap items-center justify-between gap-3 py-3 transition-colors hover:bg-muted/40"
                  href={runHref(run)}
                  key={run.id}
                >
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium">
                      {runClientName(run)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Automated build · {runProgress(run)}
                    </p>
                  </div>
                  <StatusBadge label="Running" status="in_progress" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3" id="activity">
        <div className="space-y-1">
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">
            Recent Automation Activity
          </h2>
          <p className="text-sm text-muted-foreground">
            A concise record of what Omni OS did
          </p>
        </div>
        <Card className="rounded-lg border-border/70 shadow-sm">
          <CardContent className="divide-y pt-0">
            {recentActivity.length === 0 ? (
              <div className="py-4">
                <EmptyRow message="No automation activity recorded yet." />
              </div>
            ) : (
              recentActivity.map((activity) => {
                const href = activity.project_id
                  ? `/projects/${activity.project_id}`
                  : activity.client_id
                    ? `/clients/${activity.client_id}`
                    : "/dashboard";

                return (
                  <Link
                    className="flex min-h-16 flex-col justify-center gap-1 py-3 transition-colors hover:bg-muted/40"
                    href={href}
                    key={activity.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="break-words text-sm font-medium">
                        {activity.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(activity.created_at)}
                      </span>
                    </div>
                    {activity.description ? (
                      <p className="break-words text-sm text-muted-foreground">
                        {truncateText(activity.description)}
                      </p>
                    ) : null}
                  </Link>
                );
              })
            )}
          </CardContent>
        </Card>
      </section>

      <details className="group rounded-lg border bg-background shadow-sm">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-medium marker:hidden">
          <span>Workspace overview</span>
          <span className="text-sm text-muted-foreground group-open:hidden">
            Show records and totals
          </span>
          <span className="hidden text-sm text-muted-foreground group-open:inline">
            Hide details
          </span>
        </summary>
        <div className="space-y-8 border-t p-4 sm:p-5">
      <section className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight sm:text-lg">
          Pipeline
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard
            label="Clients"
            value={clients.length}
            description={`${leadsRes.count ?? 0} leads`}
          />
          <StatCard
            label="Briefs"
            value={briefs.length}
            description={`${approvedBriefs} approved · ${draftBriefs} draft`}
          />
          <StatCard
            label="Proposals"
            value={proposals.length}
            description={`${approvedProposals} approved · ${sentProposals} sent`}
          />
          <StatCard
            label="Projects"
            value={projectsMissing ? "—" : projects.length}
            description={
              projectsMissing
                ? undefined
                : `${projectStatusCount("active")} active · ${projectStatusCount("launched")} launched`
            }
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">
            Tasks
          </h2>
          <Button asChild size="sm" variant="ghost">
            <Link href="/tasks">View all</Link>
          </Button>
        </div>
        {tasksTableMissing ? (
          <Card className="rounded-lg border-amber-200 bg-amber-50 shadow-sm">
            <CardHeader>
              <CardTitle className="text-amber-900">
                Build tasks table is not enabled yet
              </CardTitle>
              <CardDescription className="text-amber-800">
                Run the build_tasks SQL in Supabase, then generate tasks from an
                approved proposal.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard
              label="To Do"
              value={taskStatusCounts.to_do}
              description={
                taskStatusCounts.draft > 0
                  ? `+${taskStatusCounts.draft} draft`
                  : undefined
              }
            />
            <StatCard label="In Progress" value={taskStatusCounts.in_progress} />
            <StatCard label="Blocked" value={taskStatusCounts.blocked} />
            <StatCard label="Done" value={taskStatusCounts.done} />
            <StatCard label="Overdue" value={overdueTaskCount} />
            <StatCard
              label="Due Soon"
              value={dueSoonTaskCount}
              description={
                unassignedTaskCount > 0
                  ? `${unassignedTaskCount} unassigned`
                  : undefined
              }
            />
          </div>
        )}
      </section>

      <Card className="rounded-lg border-border/70 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">Task Attention</CardTitle>
            <CardDescription>
              Overdue, blocked, and due-soon tasks that need action
            </CardDescription>
          </div>
          <Button asChild size="sm" variant="ghost">
            <Link href="/tasks?due=overdue">View overdue</Link>
          </Button>
        </CardHeader>
        <CardContent className="divide-y pt-0">
          {tasksTableMissing ? (
            <div className="py-4">
              <EmptyRow message="Build tasks are not enabled yet." />
            </div>
          ) : topAttention.length === 0 ? (
            <div className="py-4">
              <EmptyRow message="No overdue, blocked, or due-soon tasks. Nice." />
            </div>
          ) : (
            topAttention.map(({ task, reason }) => (
              <Link
                key={task.id}
                href="/tasks"
                className="flex flex-col gap-1 py-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 break-words font-medium">
                    {asText(task.title, "Untitled task")}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        reason === "Overdue"
                          ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-50"
                          : reason === "Blocked"
                            ? "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-50"
                            : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
                      )}
                    >
                      {reason}
                    </Badge>
                    <StatusBadge
                      status={task.status ?? "draft"}
                      label={formatTaskStatusLabel(task.status)}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    {asText(clientName(task.client_id), "Unassigned client")}
                  </span>
                  {task.project_id &&
                  projectNameById.get(task.project_id) ? (
                    <>
                      <span>·</span>
                      <span>{projectNameById.get(task.project_id)}</span>
                    </>
                  ) : null}
                  <span>·</span>
                  <span>Owner: {asText(task.owner, "Unassigned")}</span>
                  <span>·</span>
                  <span>Due {formatDueDate(task.due_date)}</span>
                  <span>·</span>
                  <StatusBadge status={asText(task.priority, "medium")} />
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="rounded-lg border-border/70 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">GitHub Integration</CardTitle>
            <CardDescription>
              Issue publishing is confirmation-gated. Nothing is created
              automatically.
            </CardDescription>
          </div>
          <Button asChild size="sm" variant="ghost">
            <Link href="/settings/github">GitHub Settings</Link>
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatCard
              label="Issue drafts"
              value={issueDraftsMissing ? "—" : issueDraftCount}
            />
            <StatCard
              label="Allowed repos"
              value={githubReposMissing ? "—" : githubRepos.length}
            />
            <StatCard
              label="Synced repos"
              value={githubReposMissing ? "—" : syncedGithubRepos}
            />
            <StatCard
              label="Published issues"
              value={publishedIssuesMissing ? "—" : publishedIssuesCount}
            />
            <StatCard
              label="Publishing"
              value={githubPublishingEnabled ? "On" : "Off"}
              description={
                githubPublishingEnabled ? "Gate is open" : "Safe default"
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-2">
      <Card className="rounded-lg border-border/70 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">Recent Clients</CardTitle>
            <CardDescription>Latest 5 clients</CardDescription>
          </div>
          <Button asChild size="sm" variant="ghost">
            <Link href="/clients">View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="divide-y pt-0">
          {recentClients.length === 0 ? (
            <div className="py-4">
              <EmptyRow message="No clients yet. Start with a new intake." />
            </div>
          ) : (
            recentClients.map((client) => (
              <Link
                key={client.id}
                href={`/clients/${client.id}`}
                className="flex flex-wrap items-center justify-between gap-2 py-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="min-w-0 break-words font-medium">
                    {asText(client.name, "Unnamed client")}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {asText(client.company, "No company")}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {formatDate(client.created_at)}
                </span>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="rounded-lg border-border/70 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">Recent Projects</CardTitle>
            <CardDescription>Latest 5 projects</CardDescription>
          </div>
          <Button asChild size="sm" variant="ghost">
            <Link href="/projects">View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="divide-y pt-0">
          {projectsMissing ? (
            <div className="py-4">
              <EmptyRow message="Projects are not enabled yet." />
            </div>
          ) : recentProjects.length === 0 ? (
            <div className="py-4">
              <EmptyRow message="No projects yet. Create one from an approved proposal." />
            </div>
          ) : (
            recentProjects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="flex flex-wrap items-center justify-between gap-2 py-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="min-w-0 break-words font-medium">
                    {asText(project.name, "Untitled project")}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {asText(clientName(project.client_id), "Unassigned client")}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={asText(project.status, "planning")} />
                  <span className="text-xs text-muted-foreground">
                    {formatDate(project.created_at)}
                  </span>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="rounded-lg border-border/70 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">Recent Launch Checklists</CardTitle>
            <CardDescription>Latest 5 checklists</CardDescription>
          </div>
          <Button asChild size="sm" variant="ghost">
            <Link href="/launch">View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="divide-y pt-0">
          {launchChecklistsMissing ? (
            <div className="py-4">
              <EmptyRow message="Launch checklists are not enabled yet." />
            </div>
          ) : recentChecklists.length === 0 ? (
            <div className="py-4">
              <EmptyRow message="No launch checklists yet. Generate one from an approved proposal." />
            </div>
          ) : (
            recentChecklists.map((checklist) => (
              <Link
                key={checklist.id}
                href={`/launch/${checklist.id}`}
                className="flex flex-wrap items-center justify-between gap-2 py-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="min-w-0 break-words font-medium">
                    {asText(checklist.title, "Launch checklist")}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {asText(
                      clientName(checklist.client_id),
                      "Unassigned client",
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">
                    Readiness {checklist.readiness_score ?? 0}%
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(checklist.created_at)}
                  </span>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

        <Card className="rounded-lg border-border/70 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b">
            <div className="space-y-1">
              <CardTitle className="text-base">Recent Project Briefs</CardTitle>
              <CardDescription>Latest 3 briefs</CardDescription>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/briefs">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="divide-y pt-0">
            {recentBriefs.length === 0 ? (
              <div className="py-4">
                <EmptyRow message="No project briefs yet." />
              </div>
            ) : (
              recentBriefs.map((brief) => (
                <Link
                  key={brief.id}
                  href="/briefs"
                  className="flex flex-col gap-1 py-4 transition-colors hover:bg-muted/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words font-medium">
                      {asText(clientName(brief.client_id), "Unnamed client")}
                    </span>
                    <StatusBadge status={brief.approved ? "approved" : "draft"} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{asText(clientCompany(brief.client_id), "No company")}</span>
                    <span>·</span>
                    <span>{asText(brief.project_type, "No project type")}</span>
                    <span>·</span>
                    <span>{formatDate(brief.created_at)}</span>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-border/70 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b">
            <div className="space-y-1">
              <CardTitle className="text-base">Recent Proposals</CardTitle>
              <CardDescription>Latest 3 proposals</CardDescription>
            </div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/proposals">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="divide-y pt-0">
            {recentProposals.length === 0 ? (
              <div className="py-4">
                <EmptyRow message="No proposals yet." />
              </div>
            ) : (
              recentProposals.map((proposal) => (
                <Link
                  key={proposal.id}
                  href="/proposals"
                  className="flex flex-col gap-1 py-4 transition-colors hover:bg-muted/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words font-medium">
                      {asText(clientName(proposal.client_id), "Unnamed client")}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge
                        status={proposal.approved ? "approved" : "draft"}
                      />
                      <SentBadge sent={proposal.sent} />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {truncateText(proposal.proposal_summary)}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(proposal.created_at)}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

      <Card className="rounded-lg border-border/70 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">Recent Build Tasks</CardTitle>
            <CardDescription>Latest 5 internal tasks</CardDescription>
          </div>
          <Button asChild size="sm" variant="ghost">
            <Link href="/tasks">View all</Link>
          </Button>
        </CardHeader>
        <CardContent className="divide-y pt-0">
          {tasksTableMissing ? (
            <div className="py-4">
              <EmptyRow message="Build tasks table is not enabled yet." />
            </div>
          ) : recentTasks.length === 0 ? (
            <div className="py-4">
              <EmptyRow message="No build tasks yet. Generate tasks from an approved proposal." />
            </div>
          ) : (
            recentTasks.map((task) => (
              <Link
                key={task.id}
                href="/tasks"
                className="flex flex-col gap-2 py-4 transition-colors hover:bg-muted/40"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 break-words font-medium">
                    {asText(task.title, "Untitled task")}
                  </span>
                  <StatusBadge
                    status={task.status ?? "draft"}
                    label={formatTaskStatusLabel(task.status)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{asText(clientName(task.client_id), "Unassigned client")}</span>
                  <span>·</span>
                  <Badge variant="outline">
                    {asText(task.category, "uncategorized")}
                  </Badge>
                  <StatusBadge status={asText(task.priority, "medium")} />
                  <span>·</span>
                  <span>{formatDate(task.created_at)}</span>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
      </div>
        </div>
      </details>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-muted/30 pb-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <DashboardNav />
        <header className="space-y-1.5 border-b pb-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Omni OS
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Automation Command Center
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Supervise what is running, handle approvals, and step in only when
            Omni OS needs you.
          </p>
        </header>

        <Suspense fallback={<DashboardFallback />}>
          <DashboardContent />
        </Suspense>
      </div>
    </main>
  );
}
