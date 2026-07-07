import Link from "next/link";
import { Suspense } from "react";

import { ApprovalButton, CopyTextButton } from "@/components/approval-button";
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

type ProposalRecord = {
  id: string;
  project_brief_id: string | null;
  client_id: string | null;
  proposal_summary: string | null;
  lean_mvp: unknown;
  core_build: unknown;
  full_launch: unknown;
  assumptions: unknown;
  out_of_scope: unknown;
  follow_up_message: string | null;
  approved: boolean | null;
  created_at: string | null;
};

type ProjectBriefRecord = {
  id: string;
  project_type: string | null;
  problem: string | null;
};

type ClientRecord = {
  id: string;
  name: string | null;
  company: string | null;
};

type ProposalOption = {
  title: string;
  scope: string[];
  timeline: string;
  estimatedRange: string;
  bestFor: string;
};

function asRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

function asText(value: unknown, fallback = "Not set") {
  return typeof value === "string" && value.trim() ? value : fallback;
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

function optionFromJson(value: unknown, title: string): ProposalOption {
  const record = asRecord(value);

  return {
    title: asText(record?.title, title),
    scope: toTextList(record?.scope),
    timeline: asText(record?.timeline),
    estimatedRange: asText(record?.estimated_range),
    bestFor: asText(record?.best_for),
  };
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
  items,
}: {
  title: string;
  items: string[];
}) {
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

function ProposalOptionBlock({ option }: { option: ProposalOption }) {
  return (
    <section className="rounded-md border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{option.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {option.bestFor}
          </p>
        </div>
        <Badge variant="outline">{option.estimatedRange}</Badge>
      </div>
      <div className="mt-4 grid gap-3 border-y py-3 text-sm">
        <div>
          <p className="font-medium text-foreground">Timeline</p>
          <p className="mt-1 text-muted-foreground">{option.timeline}</p>
        </div>
      </div>
      <div className="mt-4">
        <SectionList items={option.scope} title="Included scope" />
      </div>
    </section>
  );
}

function LoginPrompt() {
  return (
    <Card className="rounded-lg border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle>Log in to view proposals</CardTitle>
        <CardDescription>
          Omni OS keeps proposals scoped to your account. Sign in to review and
          approve proposal drafts.
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
        <CardTitle>Could not load proposals</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function ProposalsFallback() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <StatCard label="Total proposals" value={0} />
      <StatCard label="Draft proposals" value={0} />
      <StatCard label="Approved proposals" value={0} />
    </div>
  );
}

async function ProposalsContent() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return <LoginPrompt />;
  }

  const { data: proposalData, error: proposalError } = await supabase
    .from("proposals")
    .select(
      "id, project_brief_id, client_id, proposal_summary, lean_mvp, core_build, full_launch, assumptions, out_of_scope, follow_up_message, approved, created_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (proposalError) {
    return <ErrorCard message={proposalError.message} />;
  }

  const proposals = (proposalData ?? []) as ProposalRecord[];
  const approvedCount = proposals.filter((proposal) => proposal.approved)
    .length;
  const draftCount = proposals.length - approvedCount;
  const clientIds = Array.from(
    new Set(
      proposals
        .map((proposal) => proposal.client_id)
        .filter((clientId): clientId is string => Boolean(clientId)),
    ),
  );
  const briefIds = Array.from(
    new Set(
      proposals
        .map((proposal) => proposal.project_brief_id)
        .filter((briefId): briefId is string => Boolean(briefId)),
    ),
  );
  const clientsById = new Map<string, ClientRecord>();
  const briefsById = new Map<string, ProjectBriefRecord>();

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

  if (briefIds.length > 0) {
    const { data: briefData, error: briefError } = await supabase
      .from("project_briefs")
      .select("id, project_type, problem")
      .eq("user_id", user.id)
      .in("id", briefIds);

    if (briefError) {
      return <ErrorCard message={briefError.message} />;
    }

    for (const brief of (briefData ?? []) as ProjectBriefRecord[]) {
      briefsById.set(brief.id, brief);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total proposals" value={proposals.length} />
        <StatCard label="Draft proposals" value={draftCount} />
        <StatCard label="Approved proposals" value={approvedCount} />
      </div>

      {proposals.length === 0 ? (
        <Card className="rounded-lg border-dashed shadow-sm">
          <CardHeader>
            <CardTitle>No proposals yet</CardTitle>
            <CardDescription>
              Generate a proposal from an approved or draft project brief.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link href="/briefs">Open briefs</Link>
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <div className="grid gap-5">
          {proposals.map((proposal) => {
            const client = proposal.client_id
              ? clientsById.get(proposal.client_id) ?? null
              : null;
            const brief = proposal.project_brief_id
              ? briefsById.get(proposal.project_brief_id) ?? null
              : null;
            const leanMvp = optionFromJson(proposal.lean_mvp, "Lean MVP");
            const coreBuild = optionFromJson(proposal.core_build, "Core Build");
            const fullLaunch = optionFromJson(
              proposal.full_launch,
              "Full Launch",
            );
            const assumptions = toTextList(proposal.assumptions);
            const outOfScope = toTextList(proposal.out_of_scope);
            const followUpMessage = proposal.follow_up_message ?? "";

            return (
              <Card
                key={proposal.id}
                className="rounded-lg border-border/70 shadow-sm"
              >
                <CardHeader className="gap-4 border-b">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-xl">
                        {asText(client?.name, "Unnamed client")}
                      </CardTitle>
                      <CardDescription>
                        {asText(client?.company, "No company")}
                      </CardDescription>
                    </div>
                    <StatusBadge approved={proposal.approved} />
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                    <span>
                      {asText(brief?.project_type, "Project type not set")}
                    </span>
                    <span>Created {formatDate(proposal.created_at)}</span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-6 pt-6">
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      Proposal summary
                    </h3>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {asText(proposal.proposal_summary)}
                    </p>
                  </section>

                  {brief?.problem ? (
                    <section className="space-y-2 rounded-md border bg-muted/30 p-4">
                      <h3 className="text-sm font-semibold text-foreground">
                        Project brief problem
                      </h3>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {brief.problem}
                      </p>
                    </section>
                  ) : null}

                  <div className="grid gap-4 xl:grid-cols-3">
                    <ProposalOptionBlock option={leanMvp} />
                    <ProposalOptionBlock option={coreBuild} />
                    <ProposalOptionBlock option={fullLaunch} />
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <SectionList items={assumptions} title="Assumptions" />
                    <SectionList items={outOfScope} title="Out of scope" />
                  </div>

                  <section className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        Follow up draft
                      </h3>
                      <CopyTextButton text={followUpMessage} />
                    </div>
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Draft only. Nothing has been sent to the client.
                    </p>
                    <div className="rounded-md border bg-background p-4">
                      <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                        {asText(followUpMessage)}
                      </p>
                    </div>
                  </section>
                </CardContent>

                <CardFooter className="border-t">
                  {proposal.approved ? (
                    <StatusBadge approved={proposal.approved} />
                  ) : (
                    <ApprovalButton
                      approvalType="proposal"
                      id={proposal.id}
                    />
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProposalsPage() {
  return (
    <main className="min-h-screen bg-muted/30 px-6 py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Omni OS</p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Omni OS Proposals
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Review AI generated proposal drafts before manually sharing
              anything with clients.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/intake">New Intake</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/briefs">Briefs</Link>
            </Button>
          </div>
        </header>

        <Suspense fallback={<ProposalsFallback />}>
          <ProposalsContent />
        </Suspense>
      </div>
    </main>
  );
}
