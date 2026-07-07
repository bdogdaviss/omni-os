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

type ClientRecord = {
  id: string;
  name: string | null;
  company: string | null;
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
  title: string | null;
  category: string | null;
  priority: string | null;
  status: string | null;
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

  const [clientsRes, leadsRes, briefsRes, proposalsWithSentRes, tasksRes] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, name, company")
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
        .select("id, client_id, title, category, priority, status, created_at")
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
  const tasks = (tasksRes.data ?? []) as TaskRecord[];

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
          <Link href="/briefs">View Briefs</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/proposals">View Proposals</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/tasks">View Tasks</Link>
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
