import Link from "next/link";
import { Suspense } from "react";

import { DashboardNav } from "@/components/dashboard-nav";
import { StatCard } from "@/components/stat-card";
import { StatusBadge } from "@/components/status-badge";
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

type ChecklistRecord = {
  id: string;
  client_id: string | null;
  proposal_id: string | null;
  title: string | null;
  summary: string | null;
  overall_status: string | null;
  readiness_score: number | null;
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

function normalizeOverallStatus(value: string | null | undefined) {
  const candidate = (value ?? "draft").toLowerCase();

  if (["draft", "in_progress", "ready"].includes(candidate)) {
    return candidate;
  }

  return "draft";
}

function isMissingTableError(errorMessage: string) {
  const message = errorMessage.toLowerCase();

  return (
    message.includes("launch_checklists") ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

function LoginPrompt() {
  return (
    <Card className="rounded-lg border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle>Log in to view launch checklists</CardTitle>
        <CardDescription>
          Omni OS keeps launch checklists scoped to your account. Sign in to
          review launch readiness.
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
        <CardTitle>Could not load launch checklists</CardTitle>
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
          Launch checklists are not enabled yet
        </CardTitle>
        <CardDescription className="text-amber-800">
          Launch checklists are not enabled yet. Run the launch checklist SQL in
          Supabase.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function LaunchFallback() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
      {[
        "Total checklists",
        "Draft",
        "In progress",
        "Ready",
        "Avg readiness",
      ].map((label) => (
        <StatCard key={label} label={label} value={0} />
      ))}
    </div>
  );
}

async function LaunchContent() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return <LoginPrompt />;
  }

  const { data: checklistData, error: checklistError } = await supabase
    .from("launch_checklists")
    .select(
      "id, client_id, proposal_id, title, summary, overall_status, readiness_score, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (checklistError) {
    if (isMissingTableError(checklistError.message)) {
      return <SchemaNotice />;
    }

    return <ErrorCard message={checklistError.message} />;
  }

  const checklists = (checklistData ?? []) as ChecklistRecord[];
  const draftCount = checklists.filter(
    (checklist) => normalizeOverallStatus(checklist.overall_status) === "draft",
  ).length;
  const inProgressCount = checklists.filter(
    (checklist) =>
      normalizeOverallStatus(checklist.overall_status) === "in_progress",
  ).length;
  const readyCount = checklists.filter(
    (checklist) => normalizeOverallStatus(checklist.overall_status) === "ready",
  ).length;
  const averageReadiness =
    checklists.length > 0
      ? Math.round(
          checklists.reduce(
            (sum, checklist) => sum + (checklist.readiness_score ?? 0),
            0,
          ) / checklists.length,
        )
      : 0;

  const clientIds = Array.from(
    new Set(
      checklists
        .map((checklist) => checklist.client_id)
        .filter((clientId): clientId is string => Boolean(clientId)),
    ),
  );
  const proposalIds = Array.from(
    new Set(
      checklists
        .map((checklist) => checklist.proposal_id)
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Total checklists" value={checklists.length} />
        <StatCard label="Draft" value={draftCount} />
        <StatCard label="In progress" value={inProgressCount} />
        <StatCard label="Ready" value={readyCount} />
        <StatCard label="Avg readiness" value={`${averageReadiness}%`} />
      </div>

      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Internal only. Nothing has been deployed.
      </p>

      {checklists.length === 0 ? (
        <Card className="rounded-lg border-dashed shadow-sm">
          <CardHeader>
            <CardTitle>No launch checklists yet</CardTitle>
            <CardDescription>
              No launch checklists yet. Generate one from an approved proposal.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link href="/proposals">Open proposals</Link>
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {checklists.map((checklist) => {
            const client = checklist.client_id
              ? clientsById.get(checklist.client_id) ?? null
              : null;
            const proposal = checklist.proposal_id
              ? proposalsById.get(checklist.proposal_id) ?? null
              : null;

            return (
              <Card
                key={checklist.id}
                className="flex flex-col rounded-lg border-border/70 shadow-sm transition-colors hover:border-primary/40"
              >
                <CardHeader className="gap-3 border-b">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <CardTitle className="text-lg">
                        <Link
                          href={`/launch/${checklist.id}`}
                          className="break-words underline-offset-4 hover:underline"
                        >
                          {asText(checklist.title, "Launch checklist")}
                        </Link>
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
                      </CardDescription>
                    </div>
                    <StatusBadge status={checklist.overall_status ?? "draft"} />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Readiness {checklist.readiness_score ?? 0}%
                    </span>
                    <span>Created {formatDate(checklist.created_at)}</span>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 space-y-3 pt-4 text-sm">
                  {proposal?.proposal_summary ? (
                    <p className="break-words leading-6 text-muted-foreground">
                      {proposal.proposal_summary}
                    </p>
                  ) : null}
                  <p className="break-words leading-6 text-muted-foreground">
                    {asText(checklist.summary, "No summary")}
                  </p>
                </CardContent>

                <CardFooter className="border-t">
                  <Button asChild className="w-full" variant="outline">
                    <Link href={`/launch/${checklist.id}`}>
                      Open checklist
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

export default function LaunchPage() {
  return (
    <main className="min-h-screen bg-muted/30 pb-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <DashboardNav />
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Omni OS</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Omni OS Launch Checklists
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Internal launch readiness checklists. Nothing is deployed
              automatically.
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

        <Suspense fallback={<LaunchFallback />}>
          <LaunchContent />
        </Suspense>
      </div>
    </main>
  );
}
