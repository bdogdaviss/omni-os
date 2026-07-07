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

type ClientRecord = {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  website: string | null;
  created_at: string | null;
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

async function countByClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  userId: string,
) {
  const counts = new Map<string, number>();

  const { data, error } = await supabase
    .from(table)
    .select("client_id")
    .eq("user_id", userId);

  if (error) {
    // Degrade gracefully (e.g. build_tasks table not created yet).
    return counts;
  }

  for (const row of (data ?? []) as { client_id: string | null }[]) {
    if (!row.client_id) {
      continue;
    }

    counts.set(row.client_id, (counts.get(row.client_id) ?? 0) + 1);
  }

  return counts;
}

function StatBadge({ label, value }: { label: string; value: number }) {
  return (
    <Badge variant="outline" className="gap-1 font-normal">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </Badge>
  );
}

function LoginPrompt() {
  return (
    <Card className="rounded-lg border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle>Log in to view clients</CardTitle>
        <CardDescription>
          Omni OS keeps clients scoped to your account. Sign in to open each
          client workspace.
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
        <CardTitle>Could not load clients</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function ClientsFallback() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <StatCard label="Total clients" value={0} />
      <StatCard label="Clients with proposals" value={0} />
      <StatCard label="Clients with build tasks" value={0} />
    </div>
  );
}

async function ClientsContent() {
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
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (clientError) {
    return <ErrorCard message={clientError.message} />;
  }

  const clients = (clientData ?? []) as ClientRecord[];

  const [leadCounts, briefCounts, proposalCounts, taskCounts] =
    await Promise.all([
      countByClient(supabase, "leads", user.id),
      countByClient(supabase, "project_briefs", user.id),
      countByClient(supabase, "proposals", user.id),
      countByClient(supabase, "build_tasks", user.id),
    ]);

  const clientsWithProposals = clients.filter(
    (client) => (proposalCounts.get(client.id) ?? 0) > 0,
  ).length;
  const clientsWithTasks = clients.filter(
    (client) => (taskCounts.get(client.id) ?? 0) > 0,
  ).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total clients" value={clients.length} />
        <StatCard label="Clients with proposals" value={clientsWithProposals} />
        <StatCard label="Clients with build tasks" value={clientsWithTasks} />
      </div>

      {clients.length === 0 ? (
        <Card className="rounded-lg border-dashed shadow-sm">
          <CardHeader>
            <CardTitle>No clients yet</CardTitle>
            <CardDescription>
              No clients yet. Start with a new intake.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link href="/intake">New Intake</Link>
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {clients.map((client) => {
            const website = client.website?.trim() ?? "";
            const websiteHref = website
              ? /^https?:\/\//i.test(website)
                ? website
                : `https://${website}`
              : null;

            return (
              <Card
                key={client.id}
                className="flex flex-col rounded-lg border-border/70 shadow-sm transition-colors hover:border-primary/40"
              >
                <CardHeader className="gap-2 border-b">
                  <CardTitle className="text-lg">
                    <Link
                      href={`/clients/${client.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {asText(client.name, "Unnamed client")}
                    </Link>
                  </CardTitle>
                  <CardDescription>
                    {asText(client.company, "No company")}
                  </CardDescription>
                  <div className="flex flex-col gap-1 text-sm text-muted-foreground">
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

                <CardContent className="flex-1 pt-4">
                  <div className="flex flex-wrap gap-2">
                    <StatBadge label="Leads" value={leadCounts.get(client.id) ?? 0} />
                    <StatBadge label="Briefs" value={briefCounts.get(client.id) ?? 0} />
                    <StatBadge
                      label="Proposals"
                      value={proposalCounts.get(client.id) ?? 0}
                    />
                    <StatBadge label="Tasks" value={taskCounts.get(client.id) ?? 0} />
                  </div>
                </CardContent>

                <CardFooter className="border-t">
                  <Button asChild className="w-full" variant="outline">
                    <Link href={`/clients/${client.id}`}>Open workspace</Link>
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

export default function ClientsPage() {
  return (
    <main className="min-h-screen bg-muted/30 px-6 py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <DashboardNav />
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Omni OS</p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Omni OS Clients
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              View each client workspace and everything tied to them.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/intake">New Intake</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </div>
        </header>

        <Suspense fallback={<ClientsFallback />}>
          <ClientsContent />
        </Suspense>
      </div>
    </main>
  );
}
