import Link from "next/link";
import { Suspense } from "react";

import { AddClientNoteForm } from "@/components/add-client-note-form";
import { CopyFollowUpButton } from "@/components/copy-follow-up-button";
import { DashboardNav } from "@/components/dashboard-nav";
import { EditTaskButton } from "@/components/edit-task-button";
import { GenerateIssueDraftButton } from "@/components/generate-issue-draft-button";
import { StatCard } from "@/components/stat-card";
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

type ClientRecord = {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  website: string | null;
  created_at: string | null;
};

type LeadRecord = {
  id: string;
  source: string | null;
  raw_message: string | null;
  budget_range: string | null;
  timeline: string | null;
  status: string | null;
  created_at: string | null;
};

type BriefRecord = {
  id: string;
  project_type: string | null;
  problem: string | null;
  mvp_features: unknown;
  future_features: unknown;
  questions_to_ask: unknown;
  estimated_complexity: string | null;
  next_step: string | null;
  approved: boolean | null;
  created_at: string | null;
};

type ProposalRecord = {
  id: string;
  proposal_summary: string | null;
  follow_up_message: string | null;
  approved: boolean | null;
  sent: boolean | null;
  sent_at: string | null;
  sent_method: string | null;
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

const proposalSelectWithSent =
  "id, proposal_summary, follow_up_message, approved, sent, sent_at, sent_method, created_at";
const proposalSelectBase =
  "id, proposal_summary, follow_up_message, approved, created_at";

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

function normalizeTaskStatus(value: string | null | undefined): TaskStatus {
  const candidate = (value ?? "draft").toLowerCase();

  return (TASK_STATUS_ORDER as readonly string[]).includes(candidate)
    ? (candidate as TaskStatus)
    : "draft";
}

function formatStatusLabel(value: string | null | undefined) {
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

function getStatusBadgeClass(value: string | null | undefined) {
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

function getCategoryBadgeClass() {
  return "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-50";
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
        <CardTitle>Log in to view this client</CardTitle>
        <CardDescription>
          Omni OS keeps client workspaces scoped to your account. Sign in to
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
        <CardTitle>Client not found</CardTitle>
        <CardDescription>
          This client does not exist or belongs to another account.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button asChild variant="outline">
          <Link href="/clients">Back to clients</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="rounded-lg border-destructive/40 shadow-sm">
      <CardHeader>
        <CardTitle>Could not load this client</CardTitle>
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
      Sent Manually
    </Badge>
  ) : (
    <Badge variant="outline">Not Sent</Badge>
  );
}

function TaskCard({ task }: { task: TaskRecord }) {
  const acceptanceCriteria = toTextList(task.acceptance_criteria);
  const dependencies = toTextList(task.dependencies);

  return (
    <Card className="flex flex-col rounded-lg border-border/70 shadow-sm">
      <CardHeader className="gap-3 border-b">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base">
            {asText(task.title, "Untitled task")}
          </CardTitle>
          <Badge variant="outline" className={cn(getStatusBadgeClass(task.status))}>
            {formatStatusLabel(task.status)}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className={cn(getCategoryBadgeClass())}>
            {asText(task.category, "uncategorized")}
          </Badge>
          <Badge
            variant="outline"
            className={cn(getPriorityBadgeClass(task.priority))}
          >
            {asText(task.priority, "medium")} priority
          </Badge>
          <Badge variant="secondary">
            {asText(task.estimated_effort, "effort n/a")} effort
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 space-y-4 pt-5 text-sm">
        <p className="leading-6 text-muted-foreground">
          {asText(task.description, "No description provided")}
        </p>
        <SectionList items={acceptanceCriteria} title="Acceptance criteria" />
        <SectionList items={dependencies} title="Dependencies" />
      </CardContent>
      <CardFooter className="flex flex-col items-stretch gap-3 border-t">
        <span className="text-xs text-muted-foreground">
          Created {formatDate(task.created_at)}
        </span>
        <TaskStatusSelect
          currentStatus={normalizeTaskStatus(task.status)}
          taskId={task.id}
        />
        <EditTaskButton
          task={{
            id: task.id,
            title: task.title ?? "",
            description: task.description,
            category: task.category,
            priority: task.priority,
            estimated_effort: task.estimated_effort,
            acceptance_criteria: acceptanceCriteria,
            dependencies: dependencies,
          }}
        />
        <GenerateIssueDraftButton taskId={task.id} />
      </CardFooter>
    </Card>
  );
}

async function ClientWorkspace({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return <LoginPrompt />;
  }

  const { data: clientData, error: clientError } = await supabase
    .from("clients")
    .select("id, name, company, email, website, created_at")
    .eq("id", clientId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (clientError) {
    return <ErrorCard message={clientError.message} />;
  }

  if (!clientData) {
    return <NotFoundCard />;
  }

  const client = clientData as ClientRecord;

  const [leadsRes, briefsRes, proposalsWithSentRes, tasksRes, notesRes] =
    await Promise.all([
      supabase
        .from("leads")
        .select("id, source, raw_message, budget_range, timeline, status, created_at")
        .eq("user_id", user.id)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("project_briefs")
        .select(
          "id, project_type, problem, mvp_features, future_features, questions_to_ask, estimated_complexity, next_step, approved, created_at",
        )
        .eq("user_id", user.id)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("proposals")
        .select(proposalSelectWithSent)
        .eq("user_id", user.id)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("build_tasks")
        .select(
          "id, title, description, category, priority, estimated_effort, acceptance_criteria, dependencies, status, created_at",
        )
        .eq("user_id", user.id)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
      supabase
        .from("client_notes")
        .select("id, note, created_at")
        .eq("user_id", user.id)
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
    ]);

  // Proposals: fall back if sent-tracking columns are not enabled.
  let proposals = (proposalsWithSentRes.data ?? []) as ProposalRecord[];
  let proposalsError = proposalsWithSentRes.error;

  if (proposalsError && isSentSchemaError(proposalsError.message)) {
    const proposalsBaseRes = await supabase
      .from("proposals")
      .select(proposalSelectBase)
      .eq("user_id", user.id)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    proposals = ((proposalsBaseRes.data ?? []) as ProposalRecord[]).map(
      (proposal) => ({
        ...proposal,
        sent: false,
        sent_at: null,
        sent_method: null,
      }),
    );
    proposalsError = proposalsBaseRes.error;
  }

  // Core tables should exist — surface a real error clearly.
  const coreError = leadsRes.error || briefsRes.error || proposalsError;

  if (coreError) {
    return <ErrorCard message={coreError.message} />;
  }

  const leads = (leadsRes.data ?? []) as LeadRecord[];
  const briefs = (briefsRes.data ?? []) as BriefRecord[];

  const tasksTableMissing =
    Boolean(tasksRes.error) &&
    isMissingTableError(tasksRes.error?.message ?? "");
  const tasks = (tasksRes.data ?? []) as TaskRecord[];

  const notesTableMissing =
    Boolean(notesRes.error) &&
    isMissingTableError(notesRes.error?.message ?? "");
  const notes = (notesRes.data ?? []) as NoteRecord[];

  const approvedBriefs = briefs.filter((brief) => brief.approved).length;
  const approvedProposals = proposals.filter(
    (proposal) => proposal.approved,
  ).length;
  const sentProposals = proposals.filter((proposal) => proposal.sent).length;
  const groupedTasks = groupTasksByStatus(tasks);
  const tasksDone = groupedTasks.get("done")?.length ?? 0;
  const tasksBlocked = groupedTasks.get("blocked")?.length ?? 0;

  const website = client.website?.trim() ?? "";
  const websiteHref = website
    ? /^https?:\/\//i.test(website)
      ? website
      : `https://${website}`
    : null;

  return (
    <div className="space-y-8">
      <Card className="rounded-lg border-border/70 shadow-sm">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-2xl">
                {asText(client.name, "Unnamed client")}
              </CardTitle>
              <CardDescription>
                {asText(client.company, "No company")}
              </CardDescription>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/clients">Back to clients</Link>
            </Button>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{asText(client.email, "No email")}</span>
            {websiteHref ? (
              <a
                className="text-primary underline-offset-4 hover:underline"
                href={websiteHref}
                rel="noreferrer"
                target="_blank"
              >
                {website}
              </a>
            ) : (
              <span>No website</span>
            )}
            <span>Created {formatDate(client.created_at)}</span>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Leads" value={leads.length} />
        <StatCard label="Briefs" value={briefs.length} />
        <StatCard label="Approved briefs" value={approvedBriefs} />
        <StatCard label="Proposals" value={proposals.length} />
        <StatCard label="Approved proposals" value={approvedProposals} />
        <StatCard label="Sent proposals" value={sentProposals} />
        <StatCard
          label="Build tasks"
          value={tasksTableMissing ? "—" : tasks.length}
        />
        <StatCard label="Tasks done" value={tasksDone} />
        <StatCard label="Tasks blocked" value={tasksBlocked} />
        <StatCard
          label="Notes"
          value={notesTableMissing ? "—" : notes.length}
        />
      </div>

      <section className="space-y-4">
        <SectionHeading title="Client Overview" />
        <Card className="rounded-lg border-border/70 shadow-sm">
          <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
            <div className="space-y-1 text-sm">
              <p className="font-medium text-foreground">Contact</p>
              <p className="text-muted-foreground">
                {asText(client.name, "Unnamed client")}
              </p>
              <p className="text-muted-foreground">
                {asText(client.company, "No company")}
              </p>
              <p className="text-muted-foreground">
                {asText(client.email, "No email")}
              </p>
            </div>
            <div className="space-y-1 text-sm">
              <p className="font-medium text-foreground">Latest activity</p>
              <p className="text-muted-foreground">
                Newest brief: {formatDate(briefs[0]?.created_at ?? null)}
              </p>
              <p className="text-muted-foreground">
                Newest proposal: {formatDate(proposals[0]?.created_at ?? null)}
              </p>
              <p className="text-muted-foreground">
                Newest task:{" "}
                {tasksTableMissing
                  ? "Not enabled"
                  : formatDate(tasks[0]?.created_at ?? null)}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <SectionHeading count={leads.length} title="Leads" />
        {leads.length === 0 ? (
          <EmptyCard message="No leads recorded for this client yet." />
        ) : (
          <div className="grid gap-4">
            {leads.map((lead) => (
              <Card key={lead.id} className="rounded-lg border-border/70 shadow-sm">
                <CardHeader className="gap-2 border-b">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      {asText(lead.source, "Lead")}
                    </CardTitle>
                    <Badge variant="outline">{asText(lead.status, "new")}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    <span>Budget: {asText(lead.budget_range, "n/a")}</span>
                    <span>Timeline: {asText(lead.timeline, "n/a")}</span>
                    <span>Created {formatDate(lead.created_at)}</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                    {asText(lead.raw_message, "No message")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <SectionHeading count={briefs.length} href="/briefs" title="Project Briefs" />
        {briefs.length === 0 ? (
          <EmptyCard message="No project briefs for this client yet." />
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {briefs.map((brief) => (
              <Card
                key={brief.id}
                className="flex flex-col rounded-lg border-border/70 shadow-sm"
              >
                <CardHeader className="gap-2 border-b">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      {asText(brief.project_type, "Project brief")}
                    </CardTitle>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge approved={brief.approved} />
                      <Badge variant="outline">
                        {asText(brief.estimated_complexity, "complexity n/a")}
                      </Badge>
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Created {formatDate(brief.created_at)}
                  </span>
                </CardHeader>
                <CardContent className="flex-1 space-y-4 pt-4 text-sm">
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
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <SectionHeading
          count={proposals.length}
          href="/proposals"
          title="Proposals"
        />
        {proposals.length === 0 ? (
          <EmptyCard message="No proposals for this client yet." />
        ) : (
          <div className="grid gap-4">
            {proposals.map((proposal) => (
              <Card
                key={proposal.id}
                className="rounded-lg border-border/70 shadow-sm"
              >
                <CardHeader className="gap-2 border-b">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">Proposal draft</CardTitle>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge approved={proposal.approved} />
                      <SentBadge sent={proposal.sent} />
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    Created {formatDate(proposal.created_at)}
                  </span>
                </CardHeader>
                <CardContent className="space-y-4 pt-4 text-sm">
                  <p className="leading-6 text-muted-foreground">
                    {asText(proposal.proposal_summary)}
                  </p>
                  <section className="space-y-2 rounded-md border bg-muted/20 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold text-foreground">
                        Follow up draft
                      </h3>
                      <CopyFollowUpButton
                        text={proposal.follow_up_message ?? ""}
                      />
                    </div>
                    <p className="text-xs text-amber-700">
                      Draft only. Nothing has been sent to the client.
                    </p>
                    <p className="whitespace-pre-wrap leading-6 text-muted-foreground">
                      {asText(proposal.follow_up_message, "No follow up draft")}
                    </p>
                  </section>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <SectionHeading
          count={tasksTableMissing ? undefined : tasks.length}
          href="/tasks"
          title="Build Tasks"
        />
        {tasksTableMissing ? (
          <EmptyCard message="Build tasks are not enabled yet. Run the build_tasks SQL in Supabase." />
        ) : tasks.length === 0 ? (
          <EmptyCard message="No build tasks for this client yet. Generate them from an approved proposal." />
        ) : (
          <div className="space-y-6">
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
                      className={cn(getStatusBadgeClass(status))}
                    >
                      {formatStatusLabel(status)}
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
          count={notesTableMissing ? undefined : notes.length}
          title="Internal Notes"
        />
        <Card className="rounded-lg border-border/70 shadow-sm">
          <CardContent className="space-y-5 pt-6">
            {notesTableMissing ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Client notes are not enabled yet. Run the client_notes SQL in
                Supabase.
              </div>
            ) : (
              <>
                <AddClientNoteForm clientId={client.id} />
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

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
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
              Omni OS · Client workspace
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Client Detail
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Everything tied to this client in one place. Internal only.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/clients">All Clients</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </div>
        </header>

        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground">Loading client…</p>
          }
        >
          <ClientWorkspace params={params} />
        </Suspense>
      </div>
    </main>
  );
}
