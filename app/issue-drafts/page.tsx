import Link from "next/link";
import { Suspense } from "react";

import { CopyIssueDraftButton } from "@/components/copy-issue-draft-button";
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

type IssueDraftRecord = {
  id: string;
  task_id: string | null;
  client_id: string | null;
  proposal_id: string | null;
  title: string | null;
  body: string | null;
  labels: unknown;
  status: string | null;
  copied: boolean | null;
  copied_at: string | null;
  github_issue_url: string | null;
  published_to_github: boolean | null;
  publish_status: string | null;
  created_at: string | null;
};

type ClientRecord = {
  id: string;
  name: string | null;
  company: string | null;
};

type TaskRecord = {
  id: string;
  title: string | null;
};

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

function isMissingTableError(errorMessage: string) {
  const message = errorMessage.toLowerCase();

  return (
    message.includes("github_issue_drafts") ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const value = (status ?? "draft").toLowerCase();

  if (value === "draft") {
    return <Badge variant="secondary">Draft</Badge>;
  }

  return <Badge variant="outline">{asText(status, "Draft")}</Badge>;
}

function CopiedBadge({ copied }: { copied: boolean | null }) {
  return copied ? (
    <Badge className="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50">
      Copied
    </Badge>
  ) : (
    <Badge variant="outline">Not Copied</Badge>
  );
}

function LoginPrompt() {
  return (
    <Card className="rounded-lg border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle>Log in to view issue drafts</CardTitle>
        <CardDescription>
          Omni OS keeps issue drafts scoped to your account. Sign in to review
          and copy drafts manually.
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
        <CardTitle>Could not load issue drafts</CardTitle>
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
          GitHub issue drafts are not enabled yet
        </CardTitle>
        <CardDescription className="text-amber-800">
          Run the github_issue_drafts SQL in the Supabase SQL Editor, then
          generate a draft from a build task.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function IssueDraftsFallback() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
      <StatCard label="Total drafts" value={0} />
      <StatCard label="Draft status" value={0} />
      <StatCard label="Copied drafts" value={0} />
    </div>
  );
}

async function IssueDraftsContent() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return <LoginPrompt />;
  }

  // Full select includes Phase 10 publish columns; fall back if missing.
  const fullRes = await supabase
    .from("github_issue_drafts")
    .select(
      "id, task_id, client_id, proposal_id, title, body, labels, status, copied, copied_at, github_issue_url, published_to_github, publish_status, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  let draftRows: unknown[] | null = fullRes.data;
  let draftError = fullRes.error;

  if (
    fullRes.error &&
    !isMissingTableError(fullRes.error.message) &&
    fullRes.error.message.toLowerCase().includes("column")
  ) {
    const baseRes = await supabase
      .from("github_issue_drafts")
      .select(
        "id, task_id, client_id, proposal_id, title, body, labels, status, copied, copied_at, created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    draftRows = (baseRes.data ?? []).map((row) => ({
      ...row,
      github_issue_url: null,
      published_to_github: false,
      publish_status: "draft",
    }));
    draftError = baseRes.error;
  }

  if (draftError) {
    if (isMissingTableError(draftError.message)) {
      return <SchemaNotice />;
    }

    return <ErrorCard message={draftError.message} />;
  }

  const drafts = (draftRows ?? []) as IssueDraftRecord[];
  const draftStatusCount = drafts.filter(
    (draft) => (draft.status ?? "draft").toLowerCase() === "draft",
  ).length;
  const copiedCount = drafts.filter((draft) => draft.copied).length;
  const publishedCount = drafts.filter(
    (draft) => draft.published_to_github,
  ).length;

  const clientIds = Array.from(
    new Set(
      drafts
        .map((draft) => draft.client_id)
        .filter((clientId): clientId is string => Boolean(clientId)),
    ),
  );
  const taskIds = Array.from(
    new Set(
      drafts
        .map((draft) => draft.task_id)
        .filter((taskId): taskId is string => Boolean(taskId)),
    ),
  );
  const clientsById = new Map<string, ClientRecord>();
  const tasksById = new Map<string, TaskRecord>();

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

  if (taskIds.length > 0) {
    const { data: taskData, error: taskError } = await supabase
      .from("build_tasks")
      .select("id, title")
      .eq("user_id", user.id)
      .in("id", taskIds);

    if (taskError) {
      return <ErrorCard message={taskError.message} />;
    }

    for (const task of (taskData ?? []) as TaskRecord[]) {
      tasksById.set(task.id, task);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total drafts" value={drafts.length} />
        <StatCard label="Draft status" value={draftStatusCount} />
        <StatCard label="Copied drafts" value={copiedCount} />
        <StatCard label="Published" value={publishedCount} />
      </div>

      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Real GitHub publishing requires confirmation. Drafts are never
        published automatically.
      </p>

      {drafts.length === 0 ? (
        <Card className="rounded-lg border-dashed shadow-sm">
          <CardHeader>
            <CardTitle>No issue drafts yet</CardTitle>
            <CardDescription>
              No issue drafts yet. Generate one from a build task.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link href="/tasks">Open build tasks</Link>
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div className="grid gap-5">
          {drafts.map((draft) => {
            const client = draft.client_id
              ? clientsById.get(draft.client_id) ?? null
              : null;
            const task = draft.task_id
              ? tasksById.get(draft.task_id) ?? null
              : null;
            const labels = toTextList(draft.labels);

            return (
              <Card
                key={draft.id}
                className="rounded-lg border-border/70 shadow-sm"
              >
                <CardHeader className="gap-3 border-b">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <CardTitle className="break-words text-lg">
                        {asText(draft.title, "Untitled draft")}
                      </CardTitle>
                      <CardDescription className="break-words">
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
                        {" · Task: "}
                        {asText(task?.title, "Unknown task")}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {draft.published_to_github ? (
                        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                          Published
                        </Badge>
                      ) : (
                        <StatusBadge status={draft.publish_status ?? draft.status} />
                      )}
                      <CopiedBadge copied={draft.copied} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {labels.length > 0 ? (
                      labels.map((label, index) => (
                        <Badge key={`${draft.id}-label-${index}`} variant="outline">
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

                <CardContent className="space-y-4 pt-5">
                  <p className="break-words text-sm leading-6 text-muted-foreground">
                    {truncateText(draft.body)}
                  </p>
                  <div className="w-full overflow-x-auto rounded-md border bg-muted/20 p-4">
                    <p className="whitespace-pre-wrap break-words font-mono text-xs leading-6 text-foreground">
                      {asText(draft.body, "No body")}
                    </p>
                  </div>
                </CardContent>

                <CardFooter className="flex flex-col items-stretch gap-3 border-t">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <CopyIssueDraftButton
                        body={draft.body ?? ""}
                        title={draft.title ?? ""}
                      />
                      {draft.published_to_github ? null : (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/issue-drafts/${draft.id}/publish`}>
                            Preview Publish
                          </Link>
                        </Button>
                      )}
                    </div>
                    {draft.github_issue_url ? (
                      <a
                        className="text-sm text-primary underline underline-offset-4"
                        href={draft.github_issue_url}
                        rel="noreferrer"
                        target="_blank"
                      >
                        View GitHub issue
                      </a>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {draft.published_to_github
                      ? "Already published to GitHub."
                      : "Real GitHub publishing requires confirmation."}
                  </p>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function IssueDraftsPage() {
  return (
    <main className="min-h-screen bg-muted/30 pb-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <DashboardNav />
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Omni OS
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Omni OS GitHub Issue Drafts
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Internal issue drafts for manual review and copying. No GitHub
              issues are created automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/tasks">Build Tasks</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </div>
        </header>

        <Suspense fallback={<IssueDraftsFallback />}>
          <IssueDraftsContent />
        </Suspense>
      </div>
    </main>
  );
}
