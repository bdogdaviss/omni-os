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

type ProjectRecord = {
  id: string;
  client_id: string | null;
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
};

const PROJECT_STATUS_ORDER = [
  "planning",
  "active",
  "blocked",
  "ready_for_launch",
  "launched",
  "archived",
] as const;

type ProjectStatus = (typeof PROJECT_STATUS_ORDER)[number];

function asText(value: string | null | undefined, fallback = "Not set") {
  return value?.trim() ? value : fallback;
}

function truncateText(value: string | null | undefined, max = 160) {
  if (!value?.trim()) {
    return "No description";
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

function normalizeProjectStatus(value: string | null | undefined): ProjectStatus {
  const candidate = (value ?? "planning").toLowerCase();

  return (PROJECT_STATUS_ORDER as readonly string[]).includes(candidate)
    ? (candidate as ProjectStatus)
    : "planning";
}

function formatProjectStatusLabel(value: string | null | undefined) {
  switch (normalizeProjectStatus(value)) {
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

function getProjectStatusBadgeClass(value: string | null | undefined) {
  switch (normalizeProjectStatus(value)) {
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

function isMissingTableError(errorMessage: string) {
  const message = errorMessage.toLowerCase();

  return (
    message.includes("projects") ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

function LoginPrompt() {
  return (
    <Card className="rounded-lg border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle>Log in to view projects</CardTitle>
        <CardDescription>
          Omni OS keeps projects scoped to your account. Sign in to open each
          project workspace.
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
        <CardTitle>Could not load projects</CardTitle>
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
          Projects are not enabled yet
        </CardTitle>
        <CardDescription className="text-amber-800">
          Projects are not enabled yet. Run the projects SQL in Supabase.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function ProjectsFallback() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
      {[
        "Total",
        "Planning",
        "Active",
        "Blocked",
        "Ready",
        "Launched",
        "Archived",
      ].map((label) => (
        <StatCard key={label} label={label} value={0} />
      ))}
    </div>
  );
}

async function ProjectsContent() {
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
      "id, client_id, name, description, status, priority, target_launch_date, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (projectError) {
    if (isMissingTableError(projectError.message)) {
      return <SchemaNotice />;
    }

    return <ErrorCard message={projectError.message} />;
  }

  const projects = (projectData ?? []) as ProjectRecord[];
  const statusCounts = PROJECT_STATUS_ORDER.reduce<Record<ProjectStatus, number>>(
    (counts, status) => {
      counts[status] = projects.filter(
        (project) => normalizeProjectStatus(project.status) === status,
      ).length;

      return counts;
    },
    {
      planning: 0,
      active: 0,
      blocked: 0,
      ready_for_launch: 0,
      launched: 0,
      archived: 0,
    },
  );

  const clientIds = Array.from(
    new Set(
      projects
        .map((project) => project.client_id)
        .filter((clientId): clientId is string => Boolean(clientId)),
    ),
  );
  const clientsById = new Map<string, ClientRecord>();

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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Total projects" value={projects.length} />
        <StatCard label="Planning" value={statusCounts.planning} />
        <StatCard label="Active" value={statusCounts.active} />
        <StatCard label="Blocked" value={statusCounts.blocked} />
        <StatCard label="Ready for launch" value={statusCounts.ready_for_launch} />
        <StatCard label="Launched" value={statusCounts.launched} />
        <StatCard label="Archived" value={statusCounts.archived} />
      </div>

      {projects.length === 0 ? (
        <Card className="rounded-lg border-dashed shadow-sm">
          <CardHeader>
            <CardTitle>No projects yet</CardTitle>
            <CardDescription>
              No projects yet. Create one from an approved proposal.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link href="/proposals">Open proposals</Link>
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const client = project.client_id
              ? clientsById.get(project.client_id) ?? null
              : null;

            return (
              <Card
                key={project.id}
                className="flex flex-col rounded-lg border-border/70 shadow-sm transition-colors hover:border-primary/40"
              >
                <CardHeader className="gap-2 border-b">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <CardTitle className="min-w-0 flex-1 break-words text-lg">
                      <Link
                        href={`/projects/${project.id}`}
                        className="break-words underline-offset-4 hover:underline"
                      >
                        {asText(project.name, "Untitled project")}
                      </Link>
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className={cn(getProjectStatusBadgeClass(project.status))}
                    >
                      {formatProjectStatusLabel(project.status)}
                    </Badge>
                  </div>
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
                  </CardDescription>
                </CardHeader>

                <CardContent className="flex-1 space-y-3 pt-4 text-sm">
                  <p className="break-words leading-6 text-muted-foreground">
                    {truncateText(project.description)}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(getPriorityBadgeClass(project.priority))}
                    >
                      {asText(project.priority, "medium")} priority
                    </Badge>
                    {project.target_launch_date ? (
                      <Badge variant="outline">
                        Target {formatDate(project.target_launch_date)}
                      </Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      Created {formatDate(project.created_at)}
                    </span>
                  </div>
                </CardContent>

                <CardFooter className="border-t">
                  <Button asChild className="w-full" variant="outline">
                    <Link href={`/projects/${project.id}`}>
                      Open workspace
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProjectsPage() {
  return (
    <main className="min-h-screen bg-muted/30 pb-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <DashboardNav />
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Omni OS</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Omni OS Projects
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Manage active client projects and delivery workspaces.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/proposals">Proposals</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </div>
        </header>

        <Suspense fallback={<ProjectsFallback />}>
          <ProjectsContent />
        </Suspense>
      </div>
    </main>
  );
}
