import Link from "next/link";
import { Suspense } from "react";

import { DashboardNav } from "@/components/dashboard-nav";
import { StatCard } from "@/components/stat-card";
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
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { formatDueDate, getDueDateState } from "@/lib/task-dates";

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

function getTaskStatusBadgeClass(value: string | null | undefined) {
  switch (normalizeTaskStatus(value)) {
    case "to_do":
      return "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-100";
    case "in_progress":
      return "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50";
    case "blocked":
      return "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-50";
    case "done":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
    case "draft":
    default:
      return "border-border bg-muted text-muted-foreground hover:bg-muted";
  }
}

function getPriorityBadgeClass(value: string | null | undefined) {
  switch ((value ?? "medium").toLowerCase()) {
    case "high":
      return "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50";
    case "low":
      return "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100";
    case "medium":
    default:
      return "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50";
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

function StatusBadge({ approved }: { approved: boolean | null }) {
  return approved ? (
    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
      Approved
    </Badge>
  ) : (
    <Badge variant="secondary">Draft</Badge>
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {["Clients", "Leads", "Briefs", "Proposals"].map((label) => (
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

  const [
    clientsRes,
    leadsRes,
    briefsRes,
    proposalsWithSentRes,
    tasksRes,
    issueDraftsRes,
    launchChecklistsRes,
    projectsRes,
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
        .select("id, client_id, name, status, priority, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
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
  for (const project of projects) {
    projectNameById.set(project.id, project.name ?? "Untitled project");
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/intake">New Intake</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/clients">View Clients</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/projects">View Projects</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/briefs">View Briefs</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/proposals">View Proposals</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/tasks">View Tasks</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/issue-drafts">View Issue Drafts</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/launch">View Launch</Link>
        </Button>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Overview</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Clients" value={clients.length} />
          <StatCard label="Leads" value={leadsRes.count ?? 0} />
          <StatCard
            label="Briefs"
            value={briefs.length}
            description={`${draftBriefs} draft`}
          />
          <StatCard label="Approved Briefs" value={approvedBriefs} />
          <StatCard label="Proposals" value={proposals.length} />
          <StatCard label="Approved Proposals" value={approvedProposals} />
          <StatCard label="Sent Proposals" value={sentProposals} />
          <StatCard
            label="Build Tasks"
            value={tasksTableMissing ? "—" : tasks.length}
          />
          <StatCard label="In Progress" value={taskStatusCounts.in_progress} />
          <StatCard label="Blocked" value={taskStatusCounts.blocked} />
          <StatCard label="Done" value={taskStatusCounts.done} />
          <StatCard
            label="Overdue Tasks"
            value={tasksTableMissing ? "—" : overdueTaskCount}
          />
          <StatCard
            label="Due Soon"
            value={tasksTableMissing ? "—" : dueSoonTaskCount}
          />
          <StatCard
            label="Unassigned Tasks"
            value={tasksTableMissing ? "—" : unassignedTaskCount}
          />
          <StatCard
            label="Issue Drafts"
            value={issueDraftsMissing ? "—" : issueDraftCount}
          />
          <StatCard
            label="Launch Checklists"
            value={launchChecklistsMissing ? "—" : launchChecklists.length}
          />
          <StatCard
            label="Projects"
            value={projectsMissing ? "—" : projects.length}
          />
          <StatCard
            label="Active Projects"
            value={projectsMissing ? "—" : projectStatusCount("active")}
          />
          <StatCard
            label="Blocked Projects"
            value={projectsMissing ? "—" : projectStatusCount("blocked")}
          />
          <StatCard
            label="Ready for Launch"
            value={projectsMissing ? "—" : projectStatusCount("ready_for_launch")}
          />
          <StatCard
            label="Launched"
            value={projectsMissing ? "—" : projectStatusCount("launched")}
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Task status overview
        </h2>
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {TASK_STATUS_ORDER.map((status) => (
              <Card
                key={status}
                className="rounded-lg border-border/70 shadow-sm"
              >
                <CardHeader className="gap-2 p-4">
                  <Badge
                    variant="outline"
                    className={cn("w-fit", getTaskStatusBadgeClass(status))}
                  >
                    {formatTaskStatusLabel(status)}
                  </Badge>
                  <CardTitle className="text-2xl">
                    {taskStatusCounts[status]}
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Card className="rounded-lg border-border/70 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b">
          <div className="space-y-1">
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
                  <span className="font-medium">
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
                    <Badge variant="secondary">
                      {formatTaskStatusLabel(task.status)}
                    </Badge>
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
                  <Badge
                    variant="outline"
                    className={cn(
                      (task.priority ?? "").toLowerCase() === "high"
                        ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50"
                        : undefined,
                    )}
                  >
                    {asText(task.priority, "medium")}
                  </Badge>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="rounded-lg border-border/70 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b">
          <div className="space-y-1">
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
                <div className="flex flex-col">
                  <span className="font-medium">
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
          <div className="space-y-1">
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
                <div className="flex flex-col">
                  <span className="font-medium">
                    {asText(project.name, "Untitled project")}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {asText(clientName(project.client_id), "Unassigned client")}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary">
                    {asText(project.status, "planning")}
                  </Badge>
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
          <div className="space-y-1">
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
                <div className="flex flex-col">
                  <span className="font-medium">
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

      <div className="grid gap-5 lg:grid-cols-2">
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
                    <span className="font-medium">
                      {asText(clientName(brief.client_id), "Unnamed client")}
                    </span>
                    <StatusBadge approved={brief.approved} />
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
                    <span className="font-medium">
                      {asText(clientName(proposal.client_id), "Unnamed client")}
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge approved={proposal.approved} />
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
      </div>

      <Card className="rounded-lg border-border/70 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 border-b">
          <div className="space-y-1">
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
                  <span className="font-medium">
                    {asText(task.title, "Untitled task")}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(getTaskStatusBadgeClass(task.status))}
                  >
                    {formatTaskStatusLabel(task.status)}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{asText(clientName(task.client_id), "Unassigned client")}</span>
                  <span>·</span>
                  <Badge variant="outline">
                    {asText(task.category, "uncategorized")}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(getPriorityBadgeClass(task.priority))}
                  >
                    {asText(task.priority, "medium")}
                  </Badge>
                  <span>·</span>
                  <span>{formatDate(task.created_at)}</span>
                </div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-muted/30 px-6 py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <DashboardNav />
        <header className="space-y-2 border-b pb-6">
          <p className="text-sm font-medium text-muted-foreground">Omni OS</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Omni OS Command Center
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Manage client intake, proposals, and internal build tasks from one
            place.
          </p>
        </header>

        <Suspense fallback={<DashboardFallback />}>
          <DashboardContent />
        </Suspense>
      </div>
    </main>
  );
}
