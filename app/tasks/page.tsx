import Link from "next/link";
import { Suspense } from "react";

import { DashboardNav } from "@/components/dashboard-nav";
import { TaskCard, type TaskCardTask } from "@/components/task-card";
import { TaskFilterControls } from "@/components/task-filter-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { getDueDateState } from "@/lib/task-dates";

type BuildTaskRecord = TaskCardTask & {
  proposal_id: string | null;
  client_id: string | null;
  project_id: string | null;
};

type ClientRecord = {
  id: string;
  name: string | null;
  company: string | null;
};

type ProjectRecord = {
  id: string;
  name: string | null;
};

const buildTaskSelectFull =
  "id, proposal_id, client_id, project_id, title, description, category, priority, estimated_effort, acceptance_criteria, dependencies, status, owner, due_date, started_at, completed_at, updated_at, created_at";
const buildTaskSelectBase =
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

function isMissingTableError(errorMessage: string) {
  const message = errorMessage.toLowerCase();

  return (
    message.includes("build_tasks") ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find the table")
  );
}

function isMissingColumnError(errorMessage: string) {
  const message = errorMessage.toLowerCase();

  return (
    message.includes("owner") ||
    message.includes("due_date") ||
    message.includes("started_at") ||
    message.includes("completed_at") ||
    message.includes("updated_at") ||
    message.includes("project_id") ||
    message.includes("column")
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
        <CardDescription className="break-words">{message}</CardDescription>
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
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-8">
      {[
        "Total",
        "To Do",
        "In Progress",
        "Blocked",
        "Done",
        "Overdue",
        "Due Soon",
        "Unassigned",
      ].map((label) => (
        <StatCard key={label} label={label} value={0} />
      ))}
    </div>
  );
}

type TaskSearchParams = {
  status?: string;
  priority?: string;
  owner?: string;
  due?: string;
  project?: string;
  client?: string;
};

async function TasksContent({
  searchParams,
}: {
  searchParams: Promise<TaskSearchParams>;
}) {
  const filters = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return <LoginPrompt />;
  }

  // Fetch with the full Phase 4 column set, falling back if columns are missing.
  const fullRes = await supabase
    .from("build_tasks")
    .select(buildTaskSelectFull)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  let taskRows: unknown[] | null = fullRes.data;
  let taskError = fullRes.error;

  if (fullRes.error && isMissingColumnError(fullRes.error.message)) {
    const baseRes = await supabase
      .from("build_tasks")
      .select(buildTaskSelectBase)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    taskRows = baseRes.data;
    taskError = baseRes.error;
  }

  if (taskError) {
    if (isMissingTableError(taskError.message)) {
      return <SchemaNotice />;
    }

    return <ErrorCard message={taskError.message} />;
  }

  const allTasks = (taskRows ?? []) as BuildTaskRecord[];

  const clientIds = Array.from(
    new Set(
      allTasks
        .map((task) => task.client_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const projectIds = Array.from(
    new Set(
      allTasks
        .map((task) => task.project_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const clientsById = new Map<string, ClientRecord>();
  const projectsById = new Map<string, ProjectRecord>();

  if (clientIds.length > 0) {
    const { data: clientData } = await supabase
      .from("clients")
      .select("id, name, company")
      .eq("user_id", user.id)
      .in("id", clientIds);

    for (const client of (clientData ?? []) as ClientRecord[]) {
      clientsById.set(client.id, client);
    }
  }

  if (projectIds.length > 0) {
    const { data: projectData } = await supabase
      .from("projects")
      .select("id, name")
      .eq("user_id", user.id)
      .in("id", projectIds);

    for (const project of (projectData ?? []) as ProjectRecord[]) {
      projectsById.set(project.id, project);
    }
  }

  // Filter option lists derived from the current tasks.
  const ownerOptions = Array.from(
    new Set(
      allTasks
        .map((task) => task.owner?.trim())
        .filter((owner): owner is string => Boolean(owner)),
    ),
  )
    .sort((a, b) => a.localeCompare(b))
    .map((owner) => ({ value: owner, label: owner }));
  const projectOptions = Array.from(projectsById.values()).map((project) => ({
    value: project.id,
    label: project.name ?? "Untitled project",
  }));
  const clientOptions = Array.from(clientsById.values()).map((client) => ({
    value: client.id,
    label: client.name ?? "Unnamed client",
  }));

  // Apply filters.
  const statusFilter = filters.status;
  const priorityFilter = filters.priority;
  const ownerFilter = filters.owner;
  const dueFilter = filters.due;
  const projectFilter = filters.project;
  const clientFilter = filters.client;

  const filteredTasks = allTasks.filter((task) => {
    if (statusFilter && statusFilter !== "all") {
      if (normalizeStatus(task.status) !== statusFilter) {
        return false;
      }
    }

    if (priorityFilter && priorityFilter !== "all") {
      if ((task.priority ?? "medium").toLowerCase() !== priorityFilter) {
        return false;
      }
    }

    if (ownerFilter && ownerFilter !== "all") {
      const owner = task.owner?.trim() ?? "";

      if (ownerFilter === "unassigned") {
        if (owner) {
          return false;
        }
      } else if (owner !== ownerFilter) {
        return false;
      }
    }

    if (dueFilter && dueFilter !== "all") {
      if (getDueDateState(task.due_date, task.status) !== dueFilter) {
        return false;
      }
    }

    if (projectFilter && projectFilter !== "all") {
      if (task.project_id !== projectFilter) {
        return false;
      }
    }

    if (clientFilter && clientFilter !== "all") {
      if (task.client_id !== clientFilter) {
        return false;
      }
    }

    return true;
  });

  // Stats computed across all tasks (not just the filtered view).
  const statusCount = (status: TaskStatus) =>
    allTasks.filter((task) => normalizeStatus(task.status) === status).length;
  const overdueCount = allTasks.filter(
    (task) => getDueDateState(task.due_date, task.status) === "overdue",
  ).length;
  const dueSoonCount = allTasks.filter((task) => {
    const state = getDueDateState(task.due_date, task.status);

    return state === "due_today" || state === "due_soon";
  }).length;
  const unassignedCount = allTasks.filter(
    (task) => !task.owner?.trim(),
  ).length;

  const groupedFiltered = new Map<TaskStatus, BuildTaskRecord[]>();
  for (const status of STATUS_ORDER) {
    groupedFiltered.set(status, []);
  }
  for (const task of filteredTasks) {
    groupedFiltered.get(normalizeStatus(task.status))?.push(task);
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 lg:grid-cols-8">
        <StatCard label="Total tasks" value={allTasks.length} />
        <StatCard label="To do" value={statusCount("to_do")} />
        <StatCard label="In progress" value={statusCount("in_progress")} />
        <StatCard label="Blocked" value={statusCount("blocked")} />
        <StatCard label="Done" value={statusCount("done")} />
        <StatCard label="Overdue" value={overdueCount} />
        <StatCard label="Due soon" value={dueSoonCount} />
        <StatCard label="Unassigned" value={unassignedCount} />
      </div>

      <TaskFilterControls
        clients={clientOptions}
        owners={ownerOptions}
        projects={projectOptions}
      />

      {allTasks.length === 0 ? (
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
      ) : filteredTasks.length === 0 ? (
        <Card className="rounded-lg border-dashed shadow-sm">
          <CardHeader>
            <CardTitle>No tasks match these filters</CardTitle>
            <CardDescription>
              No tasks match these filters. Adjust or clear the filters above.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild variant="outline">
              <Link href="/tasks">Clear filters</Link>
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Showing {filteredTasks.length} of {allTasks.length} tasks
          </p>
          <div className="space-y-10">
            {STATUS_SECTIONS.map(({ status, description }) => {
              const sectionTasks = groupedFiltered.get(status) ?? [];

              if (sectionTasks.length === 0) {
                return null;
              }

              return (
                <section key={status} className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <h2 className="text-base font-semibold tracking-tight sm:text-lg">
                        {formatStatusLabel(status)}
                      </h2>
                      <Badge
                        variant="outline"
                        className={cn(getStatusBadgeClass(status))}
                      >
                        {sectionTasks.length}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {description}
                    </p>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {sectionTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        client={
                          task.client_id
                            ? clientsById.get(task.client_id) ?? null
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
        </div>
      )}
    </div>
  );
}

export default function TasksPage({
  searchParams,
}: {
  searchParams: Promise<TaskSearchParams>;
}) {
  return (
    <main className="min-h-screen bg-muted/30 pb-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <DashboardNav />
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Omni OS</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Omni OS Build Tasks
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Internal task drafts generated from approved proposals. Update
              status, owners, and due dates to track work inside Omni OS only.
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
          <TasksContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
