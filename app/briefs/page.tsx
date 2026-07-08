import Link from "next/link";
import { Suspense } from "react";

import { ApprovalButton } from "@/components/approval-button";
import { DashboardNav } from "@/components/dashboard-nav";
import { GenerateProposalButton } from "@/components/generate-proposal-button";
import { StatusBadge } from "@/components/status-badge";
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

type ProjectBriefRecord = {
  id: string;
  client_id: string | null;
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

type ClientRecord = {
  id: string;
  name: string | null;
  company: string | null;
  website: string | null;
};

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

function asDisplayText(value: string | null | undefined, fallback = "Not set") {
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

function websiteHref(website: string | null | undefined) {
  if (!website?.trim()) {
    return null;
  }

  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

function ComplexityBadge({ value }: { value: string | null }) {
  const complexity = value?.toLowerCase() ?? "";
  const className =
    complexity === "high"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : complexity === "medium"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : complexity === "low"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "";

  return (
    <Badge className={className} variant={className ? "outline" : "outline"}>
      {asDisplayText(value, "Complexity")}
    </Badge>
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

function SectionList({
  title,
  value,
}: {
  title: string;
  value: unknown;
}) {
  const items = toTextList(value);

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {items.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {items.map((item, index) => (
            <li key={`${title}-${index}`} className="break-words leading-6">
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
        <CardTitle>Log in to view project briefs</CardTitle>
        <CardDescription>
          Omni OS keeps briefs scoped to your account. Sign in to review,
          approve, and generate proposals.
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
        <CardTitle>Could not load project briefs</CardTitle>
        <CardDescription className="break-words">{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function BriefsFallback() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
      <StatCard label="Total briefs" value={0} />
      <StatCard label="Draft briefs" value={0} />
      <StatCard label="Approved briefs" value={0} />
    </div>
  );
}

async function BriefsContent() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return <LoginPrompt />;
  }

  const { data: briefData, error: briefError } = await supabase
    .from("project_briefs")
    .select(
      "id, client_id, project_type, problem, mvp_features, future_features, questions_to_ask, estimated_complexity, next_step, approved, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (briefError) {
    return <ErrorCard message={briefError.message} />;
  }

  const briefs = (briefData ?? []) as ProjectBriefRecord[];
  const approvedCount = briefs.filter((brief) => brief.approved).length;
  const draftCount = briefs.length - approvedCount;
  const clientIds = Array.from(
    new Set(
      briefs
        .map((brief) => brief.client_id)
        .filter((clientId): clientId is string => Boolean(clientId)),
    ),
  );
  const clientsById = new Map<string, ClientRecord>();

  if (clientIds.length > 0) {
    const { data: clientData, error: clientError } = await supabase
      .from("clients")
      .select("id, name, company, website")
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Total briefs" value={briefs.length} />
        <StatCard label="Draft briefs" value={draftCount} />
        <StatCard label="Approved briefs" value={approvedCount} />
      </div>

      {briefs.length === 0 ? (
        <Card className="rounded-lg border-dashed shadow-sm">
          <CardHeader>
            <CardTitle>No project briefs yet</CardTitle>
            <CardDescription>
              Submit a client intake to create the first AI generated project
              brief.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link href="/intake">Open intake</Link>
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {briefs.map((brief) => {
            const client = brief.client_id
              ? clientsById.get(brief.client_id) ?? null
              : null;
            const href = websiteHref(client?.website);

            return (
              <Card
                key={brief.id}
                className="flex rounded-lg border-border/70 shadow-sm flex-col"
              >
                <CardHeader className="gap-4 border-b">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <CardTitle className="break-words text-xl">
                        {client?.id ? (
                          <Link
                            className="break-words underline-offset-4 hover:underline"
                            href={`/clients/${client.id}`}
                          >
                            {asDisplayText(client?.name, "Unnamed client")}
                          </Link>
                        ) : (
                          asDisplayText(client?.name, "Unnamed client")
                        )}
                      </CardTitle>
                      <CardDescription className="break-words">
                        {asDisplayText(client?.company, "No company")}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <StatusBadge status={brief.approved ? "approved" : "draft"} />
                      <ComplexityBadge value={brief.estimated_complexity} />
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-3 text-sm text-muted-foreground">
                    <span>Created {formatDate(brief.created_at)}</span>
                    {href ? (
                      <a
                        className="min-w-0 break-all text-primary underline-offset-4 hover:underline"
                        href={href}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {client?.website}
                      </a>
                    ) : (
                      <span>No website</span>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-5 pt-6">
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      Project type
                    </h3>
                    <p className="break-words text-sm text-muted-foreground">
                      {asDisplayText(brief.project_type)}
                    </p>
                  </section>

                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      Problem
                    </h3>
                    <p className="break-words text-sm leading-6 text-muted-foreground">
                      {asDisplayText(brief.problem)}
                    </p>
                  </section>

                  <div className="grid gap-5 md:grid-cols-2">
                    <SectionList title="MVP features" value={brief.mvp_features} />
                    <SectionList
                      title="Future features"
                      value={brief.future_features}
                    />
                  </div>

                  <SectionList
                    title="Questions to ask"
                    value={brief.questions_to_ask}
                  />

                  <section className="space-y-2 rounded-md border bg-muted/20 p-4">
                    <h3 className="text-sm font-semibold text-foreground">
                      Next step
                    </h3>
                    <p className="break-words text-sm leading-6 text-muted-foreground">
                      {asDisplayText(brief.next_step)}
                    </p>
                  </section>
                </CardContent>

                <CardFooter className="flex flex-col items-stretch gap-3 border-t md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-1">
                    {brief.approved ? (
                      <StatusBadge status={brief.approved ? "approved" : "draft"} />
                    ) : (
                      <ApprovalButton approvalType="brief" id={brief.id} />
                    )}
                    {!brief.approved ? (
                      <p className="text-xs text-muted-foreground">
                        Approve when the brief is ready, then generate the
                        proposal draft.
                      </p>
                    ) : null}
                  </div>
                  <GenerateProposalButton briefId={brief.id} />
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function BriefsPage() {
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
              Omni OS Project Briefs
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Review AI generated client briefs and approve the ones ready for
              proposal work.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/intake">New Intake</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/proposals">Proposals</Link>
            </Button>
          </div>
        </header>

        <Suspense fallback={<BriefsFallback />}>
          <BriefsContent />
        </Suspense>
      </div>
    </main>
  );
}
