import Link from "next/link";
import { Suspense } from "react";

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
      <CardHeader className="p-4">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function PriorityBadge({ priority }: { priority: string | null }) {
  const value = (priority ?? "medium").toLowerCase();

  if (value === "high") {
    return (
      <Badge className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50">
        High priority
      </Badge>
    );
  }

  if (value === "low") {
    return <Badge variant="secondary">Low priority</Badge>;
  }

  return (
    <Badge className="border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-50">
      Medium priority
    </Badge>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const value = (status ?? "draft").toLowerCase();

  if (value === "draft") {
    return <Badge variant="secondary">Draft</Badge>;
  }

  return <Badge variant="outline">{asText(status, "Draft")}</Badge>;
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
    <div className="grid gap-4 md:grid-cols-3">
      <StatCard label="Total tasks" value={0} />
      <StatCard label="Draft tasks" value={0} />
      <StatCard label="High priority tasks" value={0} />
    </div>
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
  const draftCount = tasks.filter(
    (task) => (task.status ?? "draft").toLowerCase() === "draft",
  ).length;
  const highPriorityCount = tasks.filter(
    (task) => (task.priority ?? "").toLowerCase() === "high",
  ).length;

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
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total tasks" value={tasks.length} />
        <StatCard label="Draft tasks" value={draftCount} />
        <StatCard label="High priority tasks" value={highPriorityCount} />
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
        <div className="grid gap-5 lg:grid-cols-2">
          {tasks.map((task) => {
            const client = task.client_id
              ? clientsById.get(task.client_id) ?? null
              : null;
            const proposal = task.proposal_id
              ? proposalsById.get(task.proposal_id) ?? null
              : null;
            const acceptanceCriteria = toTextList(task.acceptance_criteria);
            const dependencies = toTextList(task.dependencies);

            return (
              <Card
                key={task.id}
                className="flex flex-col rounded-lg border-border/70 shadow-sm"
              >
                <CardHeader className="gap-3 border-b">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">
                        {asText(task.title, "Untitled task")}
                      </CardTitle>
                      <CardDescription>
                        {asText(client?.name, "Unassigned client")}
                        {client?.company ? ` · ${client.company}` : ""}
                      </CardDescription>
                    </div>
                    <PriorityBadge priority={task.priority} />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {asText(task.category, "uncategorized")}
                    </Badge>
                    <Badge variant="secondary">
                      {asText(task.estimated_effort, "effort n/a")} effort
                    </Badge>
                    <StatusBadge status={task.status} />
                  </div>
                </CardHeader>

                <CardContent className="flex-1 space-y-5 pt-6">
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      Description
                    </h3>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {asText(task.description, "No description provided")}
                    </p>
                  </section>

                  <SectionList
                    items={acceptanceCriteria}
                    title="Acceptance criteria"
                  />

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

                <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t text-xs text-muted-foreground">
                  <span>Created {formatDate(task.created_at)}</span>
                  <StatusBadge status={task.status} />
                </CardFooter>
              </Card>
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
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Omni OS</p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Omni OS Build Tasks
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Internal task drafts generated from approved proposals.
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
