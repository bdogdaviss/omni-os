import Link from "next/link";
import { Suspense } from "react";

import { AddGitHubRepoForm } from "@/components/add-github-repo-form";
import { DashboardNav } from "@/components/dashboard-nav";
import { DeleteGitHubRepoButton } from "@/components/delete-github-repo-button";
import { StatCard } from "@/components/stat-card";
import { SyncGitHubReposButton } from "@/components/sync-github-repos-button";
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
import { githubEnvReadiness } from "@/lib/github/validation";

type IntegrationRecord = {
  id: string;
  installation_id: string | null;
  account_login: string | null;
  account_type: string | null;
  connected: boolean | null;
  created_at: string | null;
};

type RepositoryRecord = {
  id: string;
  owner: string | null;
  name: string | null;
  full_name: string | null;
  private: boolean | null;
  selected: boolean | null;
  default_for_projects: boolean | null;
  synced_from_github: boolean | null;
  has_issues: boolean | null;
  archived: boolean | null;
  created_at: string | null;
};

function isMissingTableError(errorMessage: string) {
  const message = errorMessage.toLowerCase();

  return (
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

function maskInstallationId(value: string | null) {
  if (!value) {
    return "Not set";
  }

  return value.length <= 4 ? "••••" : `••••${value.slice(-4)}`;
}

function ReadinessBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
      Configured
    </Badge>
  ) : (
    <Badge className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-50">
      Missing
    </Badge>
  );
}

function LoginPrompt() {
  return (
    <Card className="rounded-lg border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle>Log in to manage GitHub settings</CardTitle>
        <CardDescription>
          GitHub integration settings are scoped to your account.
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

function SchemaNotice() {
  return (
    <Card className="rounded-lg border-amber-200 bg-amber-50 shadow-sm">
      <CardHeader>
        <CardTitle className="text-amber-900">
          GitHub integration tables are not enabled yet
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
        <CardTitle>Could not load GitHub settings</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

type SettingsSearchParams = {
  connected?: string;
  error?: string;
  synced?: string;
};

async function GitHubSettingsContent({
  searchParams,
}: {
  searchParams: Promise<SettingsSearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return <LoginPrompt />;
  }

  const readiness = githubEnvReadiness();

  const [integrationsRes, repositoriesRes] = await Promise.all([
    supabase
      .from("github_integrations")
      .select(
        "id, installation_id, account_login, account_type, connected, created_at",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("github_repositories")
      .select(
        "id, owner, name, full_name, private, selected, default_for_projects, synced_from_github, has_issues, archived, created_at",
      )
      .eq("user_id", user.id)
      .order("full_name", { ascending: true }),
  ]);

  if (integrationsRes.error || repositoriesRes.error) {
    const message =
      integrationsRes.error?.message ?? repositoriesRes.error?.message ?? "";

    if (isMissingTableError(message)) {
      return <SchemaNotice />;
    }

    return <ErrorCard message={message} />;
  }

  const integrations = (integrationsRes.data ?? []) as IntegrationRecord[];
  const repositories = (repositoriesRes.data ?? []) as RepositoryRecord[];
  const connectedIntegrations = integrations.filter(
    (integration) => integration.connected,
  );
  const syncedRepos = repositories.filter((repo) => repo.synced_from_github);
  const manualRepos = repositories.filter((repo) => !repo.synced_from_github);

  return (
    <div className="space-y-8">
      {params.connected === "true" ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          GitHub App connected.
          {params.synced === "false"
            ? " Repository sync did not complete — use Sync Repositories below."
            : " Repositories were synced."}
        </p>
      ) : null}
      {params.error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          GitHub setup issue: {params.error}
        </p>
      ) : null}

      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        GitHub publishing is controlled by confirmation gates. Omni OS will
        never create issues automatically.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="GitHub App"
          value={connectedIntegrations.length > 0 ? "Connected" : "Not connected"}
        />
        <StatCard
          label="Real publishing"
          value={readiness.realPublishingEnabled ? "Enabled" : "Disabled"}
          description={
            readiness.realPublishingEnabled
              ? "GITHUB_REAL_PUBLISHING_ENABLED=true"
              : "Safe default"
          }
        />
        <StatCard label="Allowed repositories" value={repositories.length} />
        <StatCard label="Synced repositories" value={syncedRepos.length} />
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">
          Environment readiness
        </h2>
        <Card className="rounded-lg border-border/70 shadow-sm">
          <CardContent className="divide-y pt-2">
            {[
              { label: "GITHUB_APP_ID", ok: readiness.githubAppIdConfigured },
              {
                label: "GITHUB_APP_SLUG",
                ok: readiness.githubAppSlugConfigured,
              },
              {
                label: "GITHUB_APP_PRIVATE_KEY",
                ok: readiness.githubPrivateKeyConfigured,
              },
              {
                label: "GITHUB_WEBHOOK_SECRET",
                ok: readiness.githubWebhookSecretConfigured,
              },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between py-3 text-sm"
              >
                <span className="font-mono text-xs">{row.label}</span>
                <ReadinessBadge configured={row.ok} />
              </div>
            ))}
            <div className="flex items-center justify-between py-3 text-sm">
              <span className="font-mono text-xs">
                GITHUB_REAL_PUBLISHING_ENABLED
              </span>
              {readiness.realPublishingEnabled ? (
                <Badge className="border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-50">
                  true — real publishing possible
                </Badge>
              ) : (
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                  false — publishing disabled
                </Badge>
              )}
            </div>
            <p className="pt-3 text-xs text-muted-foreground">
              Values are never shown here. Only configured / missing status.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <h2 className="text-lg font-semibold tracking-tight">
            GitHub App connection
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/api/github/app/install">Connect GitHub App</Link>
            </Button>
            <SyncGitHubReposButton />
          </div>
        </div>
        {connectedIntegrations.length === 0 ? (
          <Card className="rounded-lg border-dashed shadow-sm">
            <CardHeader>
              <CardDescription>
                No GitHub App installation connected yet. Connecting only
                grants repository access for syncing — it never creates
                issues.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-3">
            {connectedIntegrations.map((integration) => (
              <Card
                key={integration.id}
                className="rounded-lg border-border/70 shadow-sm"
              >
                <CardHeader className="gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">
                      {integration.account_login ?? "GitHub installation"}
                    </CardTitle>
                    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                      Connected
                    </Badge>
                  </div>
                  <CardDescription>
                    {integration.account_type ?? "Account"} · Installation{" "}
                    {maskInstallationId(integration.installation_id)}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="border-b pb-3">
          <h2 className="text-lg font-semibold tracking-tight">
            Allowed repositories
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Only repositories listed here can be selected for issue publishing.
          </p>
        </div>

        {repositories.length === 0 ? (
          <Card className="rounded-lg border-dashed shadow-sm">
            <CardHeader>
              <CardDescription>
                No repositories added yet. Add one manually or connect the
                GitHub App in Phase 10B.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-3">
            {[...syncedRepos, ...manualRepos].map((repo) => (
              <Card
                key={repo.id}
                className="rounded-lg border-border/70 shadow-sm"
              >
                <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium">{repo.full_name}</span>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        {repo.synced_from_github ? "Synced" : "Manual"}
                      </Badge>
                      <Badge variant="secondary">
                        {repo.private ? "Private" : "Public"}
                      </Badge>
                      {repo.selected ? (
                        <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                          Selected
                        </Badge>
                      ) : (
                        <Badge variant="outline">Not selected</Badge>
                      )}
                      {repo.default_for_projects ? (
                        <Badge variant="secondary">Default</Badge>
                      ) : null}
                      {repo.has_issues === false ? (
                        <Badge className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-50">
                          Issues disabled
                        </Badge>
                      ) : null}
                      {repo.archived ? (
                        <Badge className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-50">
                          Archived
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <DeleteGitHubRepoButton repositoryId={repo.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card className="rounded-lg border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Add repository manually</CardTitle>
            <CardDescription>
              Adds an entry to the Omni OS allowlist only. Nothing is created
              on GitHub.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AddGitHubRepoForm />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export default function GitHubSettingsPage({
  searchParams,
}: {
  searchParams: Promise<SettingsSearchParams>;
}) {
  return (
    <main className="min-h-screen bg-muted/30 px-6 py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <DashboardNav />
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Omni OS</p>
            <h1 className="text-3xl font-semibold tracking-tight">
              GitHub Integration Settings
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Safe setup for GitHub issue publishing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/issue-drafts">Issue Drafts</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </div>
        </header>

        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground">Loading settings…</p>
          }
        >
          <GitHubSettingsContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
