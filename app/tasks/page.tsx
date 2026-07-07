import Link from "next/link";
import { Suspense } from "react";

import { DashboardNav } from "@/components/dashboard-nav";
import { TaskStatusSelect } from "@/components/task-status-select";
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

type BuildTaskRecord = {
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
  created_at: string | null;
};

type ClientRecord = {
  id: string;
  name: string | null;
  company: string | null;
};

type ProposalRecord = {
  id: string;
  proposal_summary: string | null;
};

const buildTaskSelect =
  "id, proposal_id, client_id, title, description, category, priority, estimated_effort, acceptance_criteria, dependencies, status, created_at";

const STATUS_ORDER = [
  "draft",
  "to_do",
  "in_progress",
  "blocked",
  "done",
] as const;

type TaskStatus = (typeof STATUS_ORDER)[number];

const STATUS_SECTIONS: { status: TaskStatus; description: string }[] = [
  { status: "draft", description: "Generated but not yet planned." },
  { status: "to_do", description: "Planned and ready to start." },
  { status: "in_progress", description: "Actively being built." },
  { status: "blocked", description: "Waiting on something before it can move." },
  { status: "done", description: "Completed internal work." },
];

function normalizeStatus(value: string | null | undefined): TaskStatus {
  const candidate = (value ?? "draft").toLowerCase();

  return (STATUS_ORDER as readonly string[]).includes(candidate)
    ? (candidate as TaskStatus)
    : "draft";
}

function formatStatusLabel(value: string | null | undefined) {
  switch (normalizeStatus(value)) {
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

function getStatusBadgeClass(value: string | null | undefined) {
  switch (normalizeStatus(value)) {
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

function getCategoryBadgeClass() {
  return "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-50";
}

function formatPriorityLabel(value: string | null | undefined) {
  const priority = (value ?? "medium").toLowerCase();

  return `${priority.charAt(0).toUpperCase()}${priority.slice(1)} priority`;
}

function asText(value: string | null | undefined, fallback = "Not set") {
  return value?.trim() ? value : fallback;
}

function toTextList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === "string" ? item : JSON.stringify(item),
    );
  }

  if (typeof value === "string" && value.trim()) {
    return [value];
  }

  return [];
}

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

function groupTasksByStatus(tasks: BuildTaskRecord[]) {
  const groups = new Map<TaskStatus, BuildTaskRecord[]>();

  for (const status of STATUS_ORDER) {
    groups.set(status, []);
  }

  for (const task of tasks) {
    groups.get(normalizeStatus(task.status))?.push(task);
  }

  return groups;
}

function isMissingTableError(errorMessage: string) {
  const message = errorMessage.toLowerCase();

  return (
    message.includes("build_tasks") ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find the table")
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="rounded-lg border-border/70 shadow-sm">
      <CardHeader className="gap-1 p-4">
        <CardDescription className="text-xs">{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  return (
    <Badge variant="outline" className={cn(getStatusBadgeClass(status))}>
      {formatStatusLabel(status)}
    </Badge>
  );
}

function SectionList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {items.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="leading-6">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">None listed</p>
      )}
    </section>
  );
}

function LoginPrompt() {
  return (
    <Card className="rounded-lg border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle>Log in to view build tasks</CardTitle>
        <CardDescription>
          Omni OS keeps build tasks scoped to your account. Sign in to review
          internal task drafts.
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
        <CardTitle>Could not load build tasks</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function SchemaNotice() {
  return (
    <Card className="rounded-lg border-amber-200 bg-amber-50 shadow-sm">
      <CardHeader>
        <CardTitle className="text-amber-900">
          Build tasks table is not enabled yet
        </CardTitle>
        <CardDescription className="text-amber-800">
          Run the build_tasks SQL in the Supabase SQL Editor to enable this
          page, then generate tasks from an approved proposal.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function TasksFallback() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
      {[
        "Total tasks",
        "Draft",
        "To Do",
        "In Progress",
        "Blocked",
        "Done",
        "High priority",
      ].map((label) => (
        <StatCard key={label} label={label} value={0} />
      ))}
    </div>
  );
}

function TaskCard({
  task,
  client,
  proposal,
}: {
  task: BuildTaskRecord;
  client: ClientRecord | null;
  proposal: ProposalRecord | null;
}) {
  const acceptanceCriteria = toTextList(task.acceptance_criteria);
  const dependencies = toTextList(task.dependencies);

  return (
    <Card className="flex flex-col rounded-lg border-border/70 shadow-sm">
      <CardHeader className="gap-3 border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg">
              {asText(task.title, "Untitled task")}
            </CardTitle>
            <CardDescription>
              {client?.id ? (
                <Link
                  className="underline-offset-4 hover:underline"
                  href={`/clients/${client.id}`}
                >
                  {asText(client?.name, "Unassigned client")}
                </Link>
              ) : (
                asText(client?.name, "Unassigned client")
              )}
              {client?.company ? ` · ${client.company}` : ""}
            </CardDescription>
          </div>
          <StatusBadge status={task.status} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={cn(getCategoryBadgeClass())}>
            {asText(task.category, "uncategorized")}
          </Badge>
          <Badge variant="outline" className={cn(getPriorityBadgeClass(task.priority))}>
            {formatPriorityLabel(task.priority)}
          </Badge>
          <Badge variant="secondary">
            {asText(task.estimated_effort, "effort n/a")} effort
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-5 pt-6">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Description</h3>
          <p className="text-sm leading-6 text-muted-foreground">
            {asText(task.description, "No description provided")}
          </p>
        </section>

        <SectionList items={acceptanceCriteria} title="Acceptance criteria" />

        <SectionList items={dependencies} title="Dependencies" />

        {proposal?.proposal_summary ? (
          <section className="space-y-2 rounded-md border bg-muted/30 p-4">
            <h3 className="text-sm font-semibold text-foreground">
              From proposal
            </h3>
            <p className="text-sm leading-6 text-muted-foreground">
              {proposal.proposal_summary}
            </p>
          </section>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-col items-stretch gap-3 border-t">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Created {formatDate(task.created_at)}</span>
          <StatusBadge status={task.status} />
        </div>
        <TaskStatusSelect
          currentStatus={normalizeStatus(task.status)}
          taskId={task.id}
        />
      </CardFooter>
    </Card>
  );
}

async function TasksContent() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return <LoginPrompt />;
  }

  const { data: taskData, error: taskError } = await supabase
    .from("build_tasks")
    .select(buildTaskSelect)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (taskError) {
    if (isMissingTableError(taskError.message)) {
      return <SchemaNotice />;
    }

    return <ErrorCard message={taskError.message} />;
  }

  const tasks = (taskData ?? []) as BuildTaskRecord[];
  const groupedTasks = groupTasksByStatus(tasks);
  const highPriorityCount = tasks.filter(
    (task) => (task.priority ?? "").toLowerCase() === "high",
  ).length;

  const statusCounts = STATUS_ORDER.reduce<Record<TaskStatus, number>>(
    (counts, status) => {
      counts[status] = groupedTasks.get(status)?.length ?? 0;

      return counts;
    },
    { draft: 0, to_do: 0, in_progress: 0, blocked: 0, done: 0 },
  );

  const clientIds = Array.from(
    new Set(
      tasks
        .map((task) => task.client_id)
        .filter((clientId): clientId is string => Boolean(clientId)),
    ),
  );
  const proposalIds = Array.from(
    new Set(
      tasks
        .map((task) => task.proposal_id)
        .filter((proposalId): proposalId is string => Boolean(proposalId)),
    ),
  );
  const clientsById = new Map<string, ClientRecord>();
  const proposalsById = new Map<string, ProposalRecord>();

  if (clientIds.length > 0) {
    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .select("id, name, company")
      .eq("user_id", user.id)
      .in("id", clientIds);

    if (clientError) {
      return <ErrorCard message={clientError.message} />;
    }

    for (const client of (clientData ?? []) as ClientRecord[]) {
      clientsById.set(client.id, client);
    }
  }

  if (proposalIds.length > 0) {
    const { data: proposalData, error: proposalError } = await supabase
      .from("proposals")
      .select("id, proposal_summary")
      .eq("user_id", user.id)
      .in("id", proposalIds);

    if (proposalError) {
      return <ErrorCard message={proposalError.message} />;
    }

    for (const proposal of (proposalData ?? []) as ProposalRecord[]) {
      proposalsById.set(proposal.id, proposal);
    }
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
        <StatCard label="Total tasks" value={tasks.length} />
        <StatCard label="Draft" value={statusCounts.draft} />
        <StatCard label="To Do" value={statusCounts.to_do} />
        <StatCard label="In Progress" value={statusCounts.in_progress} />
        <StatCard label="Blocked" value={statusCounts.blocked} />
        <StatCard label="Done" value={statusCounts.done} />
        <StatCard label="High priority" value={highPriorityCount} />
      </div>

      {tasks.length === 0 ? (
        <Card className="rounded-lg border-dashed shadow-sm">
          <CardHeader>
            <CardTitle>No build tasks yet</CardTitle>
            <CardDescription>
              No build tasks yet. Generate tasks from an approved proposal.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link href="/proposals">Open proposals</Link>
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div className="space-y-10">
          {STATUS_SECTIONS.map(({ status, description }) => {
            const sectionTasks = groupedTasks.get(status) ?? [];

            if (sectionTasks.length === 0) {
              return null;
            }

            return (
              <section key={status} className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold tracking-tight">
                      {formatStatusLabel(status)}
                    </h2>
                    <Badge
                      variant="outline"
                      className={cn(getStatusBadgeClass(status))}
                    >
                      {sectionTasks.length}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{description}</p>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  {sectionTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      client={
                        task.client_id
                          ? clientsById.get(task.client_id) ?? null
                          : null
                      }
                      proposal={
                        task.proposal_id
                          ? proposalsById.get(task.proposal_id) ?? null
                          : null
                      }
                      task={task}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TasksPage() {
  return (
    <main className="min-h-screen bg-muted/30 px-6 py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <DashboardNav />
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Omni OS</p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Omni OS Build Tasks
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Internal task drafts generated from approved proposals. Update
              status to track work inside Omni OS only.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/intake">New Intake</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/briefs">Briefs</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/proposals">Proposals</Link>
            </Button>
          </div>
        </header>

        <Suspense fallback={<TasksFallback />}>
          <TasksContent />
        </Suspense>
      </div>
    </main>
  );
}
