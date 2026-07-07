import Link from "next/link";
import { Suspense } from "react";

import { AddProjectNoteForm } from "@/components/add-project-note-form";
import { CopyIssueDraftButton } from "@/components/copy-issue-draft-button";
import { DashboardNav } from "@/components/dashboard-nav";
import { ProjectStatusSelect } from "@/components/project-status-select";
import { StatCard } from "@/components/stat-card";
import { TaskCard } from "@/components/task-card";
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
import { getDueDateState } from "@/lib/task-dates";

type ProjectRecord = {
  id: string;
  client_id: string | null;
  proposal_id: string | null;
  project_brief_id: string | null;
  name: string | null;
  description: string | null;
  status: string | null;
  priority: string | null;
  target_launch_date: string | null;
  created_at: string | null;
};

type ClientRecord = {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
};

type ProposalRecord = {
  id: string;
  proposal_summary: string | null;
  approved: boolean | null;
  sent: boolean | null;
  created_at: string | null;
};

type BriefRecord = {
  id: string;
  project_type: string | null;
  problem: string | null;
  mvp_features: unknown;
  future_features: unknown;
  questions_to_ask: unknown;
  next_step: string | null;
  created_at: string | null;
};

type TaskRecord = {
  id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  priority: string | null;
  estimated_effort: string | null;
  acceptance_criteria: unknown;
  dependencies: unknown;
  status: string | null;
  owner?: string | null;
  due_date?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  created_at: string | null;
};

type IssueDraftRecord = {
  id: string;
  title: string | null;
  body: string | null;
  labels: unknown;
  status: string | null;
  copied: boolean | null;
  created_at: string | null;
};

type ChecklistRecord = {
  id: string;
  title: string | null;
  summary: string | null;
  overall_status: string | null;
  readiness_score: number | null;
  created_at: string | null;
};

type NoteRecord = {
  id: string;
  note: string | null;
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

function truncateText(value: string | null | undefined, max = 180) {
  if (!value?.trim()) {
    return "No body";
  }

  const trimmed = value.trim();

  return trimmed.length > max ? `${trimmed.slice(0, max).trimEnd()}…` : trimmed;
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

function getProjectStatusBadgeClass(value: string | null | undefined) {
  switch ((value ?? "planning").toLowerCase()) {
    case "active":
      return "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50";
    case "blocked":
      return "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-50";
    case "ready_for_launch":
      return "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-50";
    case "launched":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
    case "archived":
      return "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100";
    case "planning":
    default:
      return "border-border bg-muted text-muted-foreground hover:bg-muted";
  }
}

function formatProjectStatusLabel(value: string | null | undefined) {
  switch ((value ?? "planning").toLowerCase()) {
    case "active":
      return "Active";
    case "blocked":
      return "Blocked";
    case "ready_for_launch":
      return "Ready for Launch";
    case "launched":
      return "Launched";
    case "archived":
      return "Archived";
    case "planning":
    default:
      return "Planning";
  }
}

function groupTasksByStatus(tasks: TaskRecord[]) {
  const groups = new Map<TaskStatus, TaskRecord[]>();

  for (const status of TASK_STATUS_ORDER) {
    groups.set(status, []);
  }

  for (const task of tasks) {
    groups.get(normalizeTaskStatus(task.status))?.push(task);
  }

  return groups;
}

function isMissingTableError(errorMessage: string) {
  const message = errorMessage.toLowerCase();

  return (
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

function isMissingColumnError(errorMessage: string) {
  const message = errorMessage.toLowerCase();

  return message.includes("project_id") || message.includes("column");
}

// Fetch related records by project_id, falling back to proposal_id when the
// project_id column is missing or nothing is linked to the project yet.
async function fetchLinked<T>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  columns: string,
  userId: string,
  projectId: string,
  proposalId: string | null,
  fallbackColumns?: string,
) {
  const byProject = await supabase
    .from(table)
    .select(columns)
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (byProject.error) {
    const missingTable = isMissingTableError(byProject.error.message);
    const missingColumn = isMissingColumnError(byProject.error.message);

    if (missingTable) {
      return { rows: [] as T[], tableMissing: true };
    }

    // A missing column (e.g. project_id or a Phase 4 build_tasks column) means
    // this table predates the migration. Retry with the safe column set,
    // preferring proposal_id linkage when project_id is unavailable.
    if (missingColumn) {
      const safeColumns = fallbackColumns ?? columns;
      const linkColumn = proposalId ? "proposal_id" : "project_id";
      const linkValue = proposalId ?? projectId;

      const retry = await supabase
        .from(table)
        .select(safeColumns)
        .eq("user_id", userId)
        .eq(linkColumn, linkValue)
        .order("created_at", { ascending: false });

      return {
        rows: (retry.data ?? []) as T[],
        tableMissing: Boolean(
          retry.error && isMissingTableError(retry.error.message),
        ),
      };
    }

    return { rows: [] as T[], tableMissing: false };
  }

  // If nothing is linked by project_id yet, fall back to proposal_id.
  if ((byProject.data ?? []).length === 0 && proposalId) {
    const byProposal = await supabase
      .from(table)
      .select(columns)
      .eq("user_id", userId)
      .eq("proposal_id", proposalId)
      .order("created_at", { ascending: false });

    if (!byProposal.error) {
      return { rows: (byProposal.data ?? []) as T[], tableMissing: false };
    }
  }

  return { rows: (byProject.data ?? []) as T[], tableMissing: false };
}

function LoginPrompt() {
  return (
    <Card className="rounded-lg border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle>Log in to view this project</CardTitle>
        <CardDescription>
          Omni OS keeps project workspaces scoped to your account. Sign in to
          continue.
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

function NotFoundCard() {
  return (
    <Card className="rounded-lg border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle>Project not found</CardTitle>
        <CardDescription>
          This project does not exist or belongs to another account.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button asChild variant="outline">
          <Link href="/projects">Back to projects</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="rounded-lg border-destructive/40 shadow-sm">
      <CardHeader>
        <CardTitle>Could not load this project</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function SectionHeading({
  title,
  count,
  href,
}: {
  title: string;
  count?: number;
  href?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {typeof count === "number" ? (
          <Badge variant="secondary">{count}</Badge>
        ) : null}
      </div>
      {href ? (
        <Button asChild size="sm" variant="ghost">
          <Link href={href}>View all</Link>
        </Button>
      ) : null}
    </div>
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

function EmptyCard({ message }: { message: string }) {
  return (
    <Card className="rounded-lg border-dashed shadow-sm">
      <CardHeader>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

async function ProjectWorkspace({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return <LoginPrompt />;
  }

  const { data: projectData, error: projectError } = await supabase
    .from("projects")
    .select(
      "id, client_id, proposal_id, project_brief_id, name, description, status, priority, target_launch_date, created_at",
    )
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (projectError) {
    if (isMissingTableError(projectError.message)) {
      return (
        <ErrorCard message="Projects are not enabled yet. Run the projects SQL in Supabase." />
      );
    }

    return <ErrorCard message={projectError.message} />;
  }

  if (!projectData) {
    return <NotFoundCard />;
  }

  const project = projectData as ProjectRecord;

  let client: ClientRecord | null = null;

  if (project.client_id) {
    const { data: clientData } = await supabase
      .from("clients")
      .select("id, name, company, email")
      .eq("id", project.client_id)
      .eq("user_id", user.id)
      .maybeSingle();

    client = (clientData as ClientRecord | null) ?? null;
  }

  let proposal: ProposalRecord | null = null;

  if (project.proposal_id) {
    const { data: proposalData } = await supabase
      .from("proposals")
      .select("id, proposal_summary, approved, sent, created_at")
      .eq("id", project.proposal_id)
      .eq("user_id", user.id)
      .maybeSingle();

    proposal = (proposalData as ProposalRecord | null) ?? null;
  }

  let brief: BriefRecord | null = null;

  if (project.project_brief_id) {
    const { data: briefData } = await supabase
      .from("project_briefs")
      .select(
        "id, project_type, problem, mvp_features, future_features, questions_to_ask, next_step, created_at",
      )
      .eq("id", project.project_brief_id)
      .eq("user_id", user.id)
      .maybeSingle();

    brief = (briefData as BriefRecord | null) ?? null;
  }

  const [tasksResult, draftsResult, checklistsResult] = await Promise.all([
    fetchLinked<TaskRecord>(
      supabase,
      "build_tasks",
      "id, title, description, category, priority, estimated_effort, acceptance_criteria, dependencies, status, owner, due_date, started_at, completed_at, updated_at, created_at",
      user.id,
      project.id,
      project.proposal_id,
      "id, title, description, category, priority, estimated_effort, acceptance_criteria, dependencies, status, created_at",
    ),
    fetchLinked<IssueDraftRecord>(
      supabase,
      "github_issue_drafts",
      "id, title, body, labels, status, copied, created_at",
      user.id,
      project.id,
      project.proposal_id,
    ),
    fetchLinked<ChecklistRecord>(
      supabase,
      "launch_checklists",
      "id, title, summary, overall_status, readiness_score, created_at",
      user.id,
      project.id,
      project.proposal_id,
    ),
  ]);

  const tasks = tasksResult.rows;
  const drafts = draftsResult.rows;
  const checklists = checklistsResult.rows;

  // Project notes (fetched by project_id only).
  const { data: noteData, error: noteError } = await supabase
    .from("project_notes")
    .select("id, note, created_at")
    .eq("user_id", user.id)
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });

  const notesTableMissing =
    Boolean(noteError) && isMissingTableError(noteError?.message ?? "");
  const notes = (noteData ?? []) as NoteRecord[];

  // Verified / blocked launch items across this project's checklists.
  let verifiedLaunchItems = 0;
  let blockedLaunchItems = 0;

  if (checklists.length > 0) {
    const checklistIds = checklists.map((checklist) => checklist.id);
    const { data: itemData } = await supabase
      .from("launch_checklist_items")
      .select("id, status")
      .eq("user_id", user.id)
      .in("checklist_id", checklistIds);

    for (const item of (itemData ?? []) as { status: string | null }[]) {
      const status = (item.status ?? "").toLowerCase();

      if (status === "verified") {
        verifiedLaunchItems += 1;
      } else if (status === "blocked") {
        blockedLaunchItems += 1;
      }
    }
  }

  const groupedTasks = groupTasksByStatus(tasks);
  const tasksDone = groupedTasks.get("done")?.length ?? 0;
  const tasksBlocked = groupedTasks.get("blocked")?.length ?? 0;
  const tasksToDo = groupedTasks.get("to_do")?.length ?? 0;
  const tasksInProgress = groupedTasks.get("in_progress")?.length ?? 0;
  const tasksOverdue = tasks.filter(
    (task) => getDueDateState(task.due_date, task.status) === "overdue",
  ).length;
  const tasksDueSoon = tasks.filter((task) => {
    const state = getDueDateState(task.due_date, task.status);

    return state === "due_today" || state === "due_soon";
  }).length;
  const tasksUnassigned = tasks.filter((task) => !task.owner?.trim()).length;

  return (
    <div className="space-y-8">
      <Card className="rounded-lg border-border/70 shadow-sm">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-2xl">
                {asText(project.name, "Untitled project")}
              </CardTitle>
              <CardDescription>
                {client?.id ? (
                  <Link
                    className="underline-offset-4 hover:underline"
                    href={`/clients/${client.id}`}
                  >
                    {asText(client.name, "Unnamed client")}
                  </Link>
                ) : (
                  "Unassigned client"
                )}
                {client?.company ? ` · ${client.company}` : ""}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/projects">Back to projects</Link>
              </Button>
              {client?.id ? (
                <Button asChild size="sm" variant="outline">
                  <Link href={`/clients/${client.id}`}>Client workspace</Link>
                </Button>
              ) : null}
            </div>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {asText(project.description, "No description")}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <Badge
              variant="outline"
              className={cn(getProjectStatusBadgeClass(project.status))}
            >
              {formatProjectStatusLabel(project.status)}
            </Badge>
            <Badge
              variant="outline"
              className={cn(getPriorityBadgeClass(project.priority))}
            >
              {asText(project.priority, "medium")} priority
            </Badge>
            {project.target_launch_date ? (
              <span>Target launch {formatDate(project.target_launch_date)}</span>
            ) : null}
            <span>Created {formatDate(project.created_at)}</span>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <StatCard label="Build tasks" value={tasks.length} />
        <StatCard label="Tasks done" value={tasksDone} />
        <StatCard label="Tasks blocked" value={tasksBlocked} />
        <StatCard label="Issue drafts" value={drafts.length} />
        <StatCard label="Launch checklists" value={checklists.length} />
        <StatCard label="Verified items" value={verifiedLaunchItems} />
        <StatCard label="Blocked items" value={blockedLaunchItems} />
        <StatCard label="Notes" value={notesTableMissing ? "—" : notes.length} />
      </div>

      <section className="space-y-4">
        <SectionHeading title="Project Overview" />
        <Card className="rounded-lg border-border/70 shadow-sm">
          <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
            <div className="space-y-2 text-sm">
              <p className="font-medium text-foreground">Description</p>
              <p className="leading-6 text-muted-foreground">
                {asText(project.description, "No description")}
              </p>
              <p className="font-medium text-foreground">Client</p>
              <p className="text-muted-foreground">
                {asText(client?.name, "Unassigned client")}
                {client?.company ? ` · ${client.company}` : ""}
              </p>
            </div>
            <div className="space-y-2 text-sm">
              <p className="font-medium text-foreground">Proposal summary</p>
              <p className="leading-6 text-muted-foreground">
                {asText(proposal?.proposal_summary, "No proposal summary")}
              </p>
              <p className="font-medium text-foreground">Project brief problem</p>
              <p className="leading-6 text-muted-foreground">
                {asText(brief?.problem, "No brief problem recorded")}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeading title="Project Status" />
        <Card className="rounded-lg border-border/70 shadow-sm">
          <CardContent className="pt-6">
            <ProjectStatusSelect
              currentStatus={(project.status ?? "planning").toLowerCase()}
              projectId={project.id}
            />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeading href="/proposals" title="Related Proposal" />
        {proposal ? (
          <Card className="rounded-lg border-border/70 shadow-sm">
            <CardHeader className="gap-2 border-b">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Proposal draft</CardTitle>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant={proposal.approved ? "default" : "secondary"}
                    className={
                      proposal.approved
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                        : undefined
                    }
                  >
                    {proposal.approved ? "Approved" : "Draft"}
                  </Badge>
                  <Badge variant="outline">
                    {proposal.sent ? "Sent" : "Not Sent"}
                  </Badge>
                </div>
              </div>
              <span className="text-sm text-muted-foreground">
                Created {formatDate(proposal.created_at)}
              </span>
            </CardHeader>
            <CardContent className="pt-4 text-sm">
              <p className="leading-6 text-muted-foreground">
                {asText(proposal.proposal_summary)}
              </p>
            </CardContent>
          </Card>
        ) : (
          <EmptyCard message="No proposal linked to this project." />
        )}
      </section>

      <section className="space-y-4">
        <SectionHeading href="/briefs" title="Project Brief" />
        {brief ? (
          <Card className="rounded-lg border-border/70 shadow-sm">
            <CardHeader className="gap-2 border-b">
              <CardTitle className="text-base">
                {asText(brief.project_type, "Project brief")}
              </CardTitle>
              <span className="text-sm text-muted-foreground">
                Created {formatDate(brief.created_at)}
              </span>
            </CardHeader>
            <CardContent className="space-y-4 pt-4 text-sm">
              <section className="space-y-1">
                <h3 className="font-semibold text-foreground">Problem</h3>
                <p className="leading-6 text-muted-foreground">
                  {asText(brief.problem)}
                </p>
              </section>
              <div className="grid gap-4 md:grid-cols-2">
                <SectionList
                  items={toTextList(brief.mvp_features)}
                  title="MVP features"
                />
                <SectionList
                  items={toTextList(brief.future_features)}
                  title="Future features"
                />
              </div>
              <SectionList
                items={toTextList(brief.questions_to_ask)}
                title="Questions to ask"
              />
              <section className="space-y-1 rounded-md border bg-muted/30 p-3">
                <h3 className="font-semibold text-foreground">Next step</h3>
                <p className="leading-6 text-muted-foreground">
                  {asText(brief.next_step)}
                </p>
              </section>
            </CardContent>
          </Card>
        ) : (
          <EmptyCard message="No project brief linked to this project." />
        )}
      </section>

      <section className="space-y-4">
        <SectionHeading count={tasks.length} href="/tasks" title="Build Tasks" />
        {tasks.length === 0 ? (
          <EmptyCard message="No build tasks linked to this project yet." />
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              <StatCard label="Total" value={tasks.length} />
              <StatCard label="To do" value={tasksToDo} />
              <StatCard label="In progress" value={tasksInProgress} />
              <StatCard label="Blocked" value={tasksBlocked} />
              <StatCard label="Done" value={tasksDone} />
              <StatCard label="Overdue" value={tasksOverdue} />
              <StatCard label="Due soon" value={tasksDueSoon} />
              <StatCard label="Unassigned" value={tasksUnassigned} />
            </div>
            {TASK_STATUS_ORDER.map((status) => {
              const sectionTasks = groupedTasks.get(status) ?? [];

              if (sectionTasks.length === 0) {
                return null;
              }

              return (
                <div key={status} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(getTaskStatusBadgeClass(status))}
                    >
                      {formatTaskStatusLabel(status)}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {sectionTasks.length}
                    </span>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-2">
                    {sectionTasks.map((task) => (
                      <TaskCard key={task.id} task={task} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <SectionHeading
          count={drafts.length}
          href="/issue-drafts"
          title="GitHub Issue Drafts"
        />
        {drafts.length === 0 ? (
          <EmptyCard message="No issue drafts linked to this project yet." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {drafts.map((draft) => {
              const labels = toTextList(draft.labels);

              return (
                <Card
                  key={draft.id}
                  className="rounded-lg border-border/70 shadow-sm"
                >
                  <CardHeader className="gap-2 border-b">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-base">
                        {asText(draft.title, "Untitled draft")}
                      </CardTitle>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">
                          {asText(draft.status, "draft")}
                        </Badge>
                        <Badge variant="outline">
                          {draft.copied ? "Copied" : "Not Copied"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {labels.length > 0 ? (
                        labels.map((label, index) => (
                          <Badge
                            key={`${draft.id}-label-${index}`}
                            variant="outline"
                          >
                            {label}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          No labels
                        </span>
                      )}
                      <span className="text-sm text-muted-foreground">
                        Created {formatDate(draft.created_at)}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-4 text-sm">
                    <p className="leading-6 text-muted-foreground">
                      {truncateText(draft.body)}
                    </p>
                    <CopyIssueDraftButton
                      body={draft.body ?? ""}
                      title={draft.title ?? ""}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <SectionHeading
          count={checklists.length}
          href="/launch"
          title="Launch Checklists"
        />
        {checklists.length === 0 ? (
          <EmptyCard message="No launch checklists linked to this project yet." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {checklists.map((checklist) => (
              <Card
                key={checklist.id}
                className="rounded-lg border-border/70 shadow-sm"
              >
                <CardHeader className="gap-2 border-b">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      <Link
                        className="underline-offset-4 hover:underline"
                        href={`/launch/${checklist.id}`}
                      >
                        {asText(checklist.title, "Launch checklist")}
                      </Link>
                    </CardTitle>
                    <Badge variant="secondary">
                      {asText(checklist.overall_status, "draft")}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Readiness {checklist.readiness_score ?? 0}%
                    </span>
                    <span>Created {formatDate(checklist.created_at)}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-4 text-sm">
                  <p className="leading-6 text-muted-foreground">
                    {asText(checklist.summary, "No summary")}
                  </p>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/launch/${checklist.id}`}>Open checklist</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <SectionHeading
          count={notesTableMissing ? undefined : notes.length}
          title="Project Notes"
        />
        <Card className="rounded-lg border-border/70 shadow-sm">
          <CardContent className="space-y-5 pt-6">
            {notesTableMissing ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Project notes are not enabled yet. Run the project_notes SQL in
                Supabase.
              </div>
            ) : (
              <>
                <AddProjectNoteForm projectId={project.id} />
                <div className="space-y-3 border-t pt-4">
                  {notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No notes yet. Add the first internal note above.
                    </p>
                  ) : (
                    notes.map((note) => (
                      <div
                        key={note.id}
                        className="rounded-md border bg-background p-3"
                      >
                        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
                          {asText(note.note, "Empty note")}
                        </p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {formatDate(note.created_at)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export default function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  return (
    <main className="min-h-screen bg-muted/30 px-6 py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <Suspense
          fallback={
            <div className="h-11 rounded-lg border bg-background shadow-sm" />
          }
        >
          <DashboardNav />
        </Suspense>
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Omni OS · Project workspace
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Project Detail
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Everything tied to this project in one place. Internal only.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/projects">All Projects</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </div>
        </header>

        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground">Loading project…</p>
          }
        >
          <ProjectWorkspace params={params} />
        </Suspense>
      </div>
    </main>
  );
}
