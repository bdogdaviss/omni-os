import Link from "next/link";
import { Suspense } from "react";

import { CopyIssueDraftButton } from "@/components/copy-issue-draft-button";
import { DashboardNav } from "@/components/dashboard-nav";
import { GitHubPublishPreviewCard } from "@/components/github-publish-preview-card";
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
import { isRealPublishingEnabled, toLabelList } from "@/lib/github/validation";

type DraftRecord = {
  id: string;
  task_id: string | null;
  client_id: string | null;
  project_id: string | null;
  title: string | null;
  body: string | null;
  labels: unknown;
  status: string | null;
  created_at: string | null;
  github_repo: string | null;
  github_issue_number: number | null;
  github_issue_url: string | null;
  published_to_github: boolean | null;
  published_at: string | null;
  publish_status: string | null;
  publish_error: string | null;
};

type RepositoryRecord = {
  id: string;
  full_name: string | null;
  synced_from_github: boolean | null;
  installation_id: string | null;
};

function asText(value: string | null | undefined, fallback = "Not set") {
  return value?.trim() ? value : fallback;
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
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

function isMissingColumnError(errorMessage: string) {
  return errorMessage.toLowerCase().includes("column");
}

function LoginPrompt() {
  return (
    <Card className="rounded-lg border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle>Log in to preview publishing</CardTitle>
        <CardDescription>
          Issue drafts are scoped to your account.
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
        <CardTitle>Issue draft not found</CardTitle>
        <CardDescription>
          This draft does not exist or belongs to another account.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button asChild variant="outline">
          <Link href="/issue-drafts">Back to Issue Drafts</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function SchemaNotice() {
  return (
    <Card className="rounded-lg border-amber-200 bg-amber-50 shadow-sm">
      <CardHeader>
        <CardTitle className="text-amber-900">
          GitHub publishing columns are not enabled yet
        </CardTitle>
        <CardDescription className="text-amber-800">
          Run the Phase 10 GitHub SQL in the Supabase SQL Editor, then reload
          this page.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="rounded-lg border-destructive/40 shadow-sm">
      <CardHeader>
        <CardTitle>Could not load this draft</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

async function PublishPreviewContent({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const { draftId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return <LoginPrompt />;
  }

  const { data: draftData, error: draftError } = await supabase
    .from("github_issue_drafts")
    .select(
      "id, task_id, client_id, project_id, title, body, labels, status, created_at, github_repo, github_issue_number, github_issue_url, published_to_github, published_at, publish_status, publish_error",
    )
    .eq("id", draftId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (draftError) {
    if (
      isMissingTableError(draftError.message) ||
      isMissingColumnError(draftError.message)
    ) {
      return <SchemaNotice />;
    }

    return <ErrorCard message={draftError.message} />;
  }

  if (!draftData) {
    return <NotFoundCard />;
  }

  const draft = draftData as DraftRecord;
  const labels = toLabelList(draft.labels);
  const realPublishingEnabled = isRealPublishingEnabled();

  // Related names, best-effort.
  let clientName: string | null = null;
  let projectName: string | null = null;
  let taskTitle: string | null = null;

  if (draft.client_id) {
    const { data } = await supabase
      .from("clients")
      .select("name")
      .eq("id", draft.client_id)
      .eq("user_id", user.id)
      .maybeSingle();
    clientName = (data as { name: string | null } | null)?.name ?? null;
  }

  if (draft.project_id) {
    const { data } = await supabase
      .from("projects")
      .select("name")
      .eq("id", draft.project_id)
      .eq("user_id", user.id)
      .maybeSingle();
    projectName = (data as { name: string | null } | null)?.name ?? null;
  }

  if (draft.task_id) {
    const { data } = await supabase
      .from("build_tasks")
      .select("title")
      .eq("id", draft.task_id)
      .eq("user_id", user.id)
      .maybeSingle();
    taskTitle = (data as { title: string | null } | null)?.title ?? null;
  }

  const { data: repoData } = await supabase
    .from("github_repositories")
    .select("id, full_name, synced_from_github, installation_id")
    .eq("user_id", user.id)
    .eq("selected", true)
    .order("full_name", { ascending: true });

  const repositories = ((repoData ?? []) as RepositoryRecord[]).map((repo) => ({
    id: repo.id,
    fullName: repo.full_name ?? "unknown/repo",
    syncedFromGithub: Boolean(repo.synced_from_github),
    hasInstallation: Boolean(repo.installation_id),
  }));

  const alreadyPublished = Boolean(draft.published_to_github);

  return (
    <div className="space-y-6">
      <Card className="rounded-lg border-border/70 shadow-sm">
        <CardHeader className="gap-3 border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <CardTitle className="text-xl">
                {asText(draft.title, "Untitled draft")}
              </CardTitle>
              <CardDescription>
                Client: {asText(clientName, "Unassigned")} · Project:{" "}
                {asText(projectName, "None")} · Task:{" "}
                {asText(taskTitle, "Unknown task")}
              </CardDescription>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {alreadyPublished ? (
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                  Published
                </Badge>
              ) : (
                <Badge variant="secondary">
                  {asText(draft.publish_status, "draft")}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {labels.length > 0 ? (
              labels.map((label, index) => (
                <Badge key={`label-${index}`} variant="outline">
                  {label}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">No labels</span>
            )}
            <span className="text-sm text-muted-foreground">
              Created {formatDate(draft.created_at)}
            </span>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-5">
          <div className="rounded-md border bg-muted/30 p-4">
            <p className="whitespace-pre-wrap font-mono text-xs leading-6 text-foreground">
              {asText(draft.body, "No body")}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CopyIssueDraftButton
              body={draft.body ?? ""}
              title={draft.title ?? ""}
            />
            <Button asChild size="sm" variant="ghost">
              <Link href="/issue-drafts">Back to Issue Drafts</Link>
            </Button>
          </div>
          {draft.publish_error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              Last publish attempt failed: {draft.publish_error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {alreadyPublished ? (
        <Card className="rounded-lg border-emerald-200 bg-emerald-50/50 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base text-emerald-900">
              Already published to GitHub
            </CardTitle>
            <CardDescription className="text-emerald-800">
              Published {formatDate(draft.published_at)}
              {draft.github_repo ? ` to ${draft.github_repo}` : ""}
              {draft.github_issue_number
                ? ` as issue #${draft.github_issue_number}`
                : ""}
              . Publishing controls are hidden to prevent duplicates.
            </CardDescription>
          </CardHeader>
          {draft.github_issue_url ? (
            <CardFooter>
              <a
                className="text-sm text-emerald-800 underline underline-offset-4"
                href={draft.github_issue_url}
                rel="noreferrer"
                target="_blank"
              >
                {draft.github_issue_url}
              </a>
            </CardFooter>
          ) : null}
        </Card>
      ) : (
        <Card className="rounded-lg border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Publish to GitHub</CardTitle>
            <CardDescription>
              Select a repository, validate it, then confirm to create one real
              GitHub issue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GitHubPublishPreviewCard
              issueDraftId={draft.id}
              realPublishingEnabled={realPublishingEnabled}
              repositories={repositories}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function PublishPreviewPage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  return (
    <main className="min-h-screen bg-muted/30 px-6 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <Suspense
          fallback={
            <div className="h-11 rounded-lg border bg-background shadow-sm" />
          }
        >
          <DashboardNav />
        </Suspense>
        <header className="space-y-2 border-b pb-6">
          <p className="text-sm font-medium text-muted-foreground">
            Omni OS · GitHub publishing
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Publish GitHub Issue Preview
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Review only. GitHub issue creation requires explicit confirmation.
          </p>
        </header>

        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground">Loading draft…</p>
          }
        >
          <PublishPreviewContent params={params} />
        </Suspense>
      </div>
    </main>
  );
}
