import Link from "next/link";
import { Suspense } from "react";
import { ChevronDown } from "lucide-react";

import { ApprovalButton } from "@/components/approval-button";
import { CopyFollowUpButton } from "@/components/copy-follow-up-button";
import { CreateProjectButton } from "@/components/create-project-button";
import { DashboardNav } from "@/components/dashboard-nav";
import { GenerateBuildTasksButton } from "@/components/generate-build-tasks-button";
import { GenerateLaunchChecklistButton } from "@/components/generate-launch-checklist-button";
import { MarkProposalSentButton } from "@/components/mark-proposal-sent-button";
import { ProposalCost } from "@/components/proposal-cost";
import { StartPipelineButton } from "@/components/start-pipeline-button";
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
import { usageByProposal } from "@/lib/ai/usage";
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
  selected_tier: "lean_mvp" | "core_build" | "full_launch" | null;
  sent: boolean | null;
  sent_at: string | null;
  sent_method: string | null;
  project_id: string | null;
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

const proposalSelectBase =
  "id, project_brief_id, client_id, proposal_summary, lean_mvp, core_build, full_launch, assumptions, out_of_scope, follow_up_message, approved, created_at";

const proposalSelectWithSent = `${proposalSelectBase}, selected_tier, sent, sent_at, sent_method, project_id`;

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

function SentBadge({ sent }: { sent: boolean | null }) {
  return sent ? (
    <Badge className="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-50">
      Sent Manually
    </Badge>
  ) : (
    <Badge variant="outline">Not Sent</Badge>
  );
}

function isSentTrackingSchemaError(errorMessage: string) {
  const message = errorMessage.toLowerCase();

  return (
    message.includes("sent") ||
    message.includes("sent_at") ||
    message.includes("sent_method") ||
    message.includes("project_id") ||
    message.includes("schema cache")
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

function ProposalOptionBlock({ option }: { option: ProposalOption }) {
  return (
    <section className="rounded-md border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="break-words font-semibold">{option.title}</h3>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {option.bestFor}
          </p>
        </div>
        <Badge className="max-w-full whitespace-normal break-words" variant="outline">
          {option.estimatedRange}
        </Badge>
      </div>
      <div className="mt-4 grid gap-3 border-y py-3 text-sm">
        <div>
          <p className="font-medium text-foreground">Timeline</p>
          <p className="mt-1 break-words text-muted-foreground">{option.timeline}</p>
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
        <CardDescription className="break-words">{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function SchemaNotice() {
  return (
    <Card className="rounded-lg border-amber-200 bg-amber-50 shadow-sm">
      <CardHeader>
        <CardTitle className="text-amber-900">Sent tracking is not enabled yet</CardTitle>
        <CardDescription className="text-amber-800">
          Proposals are loaded. Run the sent tracking SQL in Supabase to enable
          Mark as Sent and Sent Manually status.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function ProposalsFallback() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
      <StatCard label="Total proposals" value={0} />
      <StatCard label="Draft proposals" value={0} />
      <StatCard label="Approved proposals" value={0} />
    </div>
  );
}

async function ProposalsContent({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string | string[] }>;
}) {
  const { focus } = await searchParams;
  const focusId = typeof focus === "string" ? focus : null;

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return <LoginPrompt />;
  }

  const {
    data: proposalDataWithSent,
    error: proposalWithSentError,
  } = await supabase
    .from("proposals")
    .select(proposalSelectWithSent)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  let proposalData: unknown[] | null = proposalDataWithSent ?? null;
  let sentTrackingAvailable = true;
  let proposalError = proposalWithSentError;

  // Degrade newest-migration-first: a database without selected_tier
  // (migration 20260713020000) keeps sent tracking; one also missing the
  // sent columns falls all the way back to the base select.
  if (proposalError?.message.includes("selected_tier")) {
    const { data: tierlessData, error: tierlessError } = await supabase
      .from("proposals")
      .select(`${proposalSelectBase}, sent, sent_at, sent_method, project_id`)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    proposalData = (tierlessData ?? []).map((proposal) => ({
      ...proposal,
      selected_tier: null,
    }));
    proposalError = tierlessError;
  }

  if (proposalError && isSentTrackingSchemaError(proposalError.message)) {
    const {
      data: proposalDataWithoutSent,
      error: proposalWithoutSentError,
    } = await supabase
      .from("proposals")
      .select(proposalSelectBase)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    proposalData = (proposalDataWithoutSent ?? []).map((proposal) => ({
      ...proposal,
      selected_tier: null,
      sent: false,
      sent_at: null,
      sent_method: null,
      project_id: null,
    }));
    proposalError = proposalWithoutSentError;
    sentTrackingAvailable = false;
  }

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

  // Pipeline gate inputs: repos to target and any active run per proposal.
  // Both tolerate absence (no repos synced / migration not applied) so the
  // page renders regardless.
  const { data: repoRows } = await supabase
    .from("github_repositories")
    .select("id, full_name")
    .eq("user_id", user.id)
    .eq("selected", true)
    .eq("archived", false)
    .order("full_name");
  const pipelineRepos = ((repoRows ?? []) as { id: string; full_name: string }[]).map(
    (repo) => ({ id: repo.id, fullName: repo.full_name }),
  );

  const runByProposalId = new Map<
    string,
    {
      id: string;
      status: string;
      position: number;
      total: number;
      updatedAt: string | null;
    }
  >();
  const { data: runRows, error: runsError } = await supabase
    .from("pipeline_runs")
    .select("id, proposal_id, status, position, task_queue, updated_at")
    .eq("user_id", user.id)
    .in("status", ["running", "blocked"]);

  if (!runsError) {
    for (const row of (runRows ?? []) as {
      id: string;
      proposal_id: string | null;
      status: string;
      position: number;
      task_queue: unknown;
      updated_at: string | null;
    }[]) {
      if (row.proposal_id) {
        runByProposalId.set(row.proposal_id, {
          id: row.id,
          status: row.status,
          position: row.position,
          total: Array.isArray(row.task_queue) ? row.task_queue.length : 0,
          updatedAt: row.updated_at,
        });
      }
    }
  }

  // Cost readout: two batched queries for the whole page, not two per card.
  const usageByProposalId = await usageByProposal(supabase, user.id);
  const taskCountByProposalId = new Map<string, number>();

  if (proposals.length > 0) {
    const { data: taskRows } = await supabase
      .from("build_tasks")
      .select("proposal_id")
      .eq("user_id", user.id)
      .in(
        "proposal_id",
        proposals.map((proposal) => proposal.id),
      );

    for (const row of (taskRows ?? []) as { proposal_id: string | null }[]) {
      if (row.proposal_id) {
        taskCountByProposalId.set(
          row.proposal_id,
          (taskCountByProposalId.get(row.proposal_id) ?? 0) + 1,
        );
      }
    }
  }

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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatCard label="Total proposals" value={proposals.length} />
        <StatCard label="Draft proposals" value={draftCount} />
        <StatCard label="Approved proposals" value={approvedCount} />
      </div>

      {sentTrackingAvailable ? null : <SchemaNotice />}

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
              <details
                className="group scroll-mt-20 rounded-lg border border-border/70 bg-card text-card-foreground shadow-sm"
                id={`proposal-${proposal.id}`}
                key={proposal.id}
                open={proposal.id === focusId}
              >
                <summary className="flex cursor-pointer list-none flex-col gap-4 p-6 transition-colors hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <span className="block break-words text-xl font-semibold leading-none tracking-tight">
                        {client?.id ? (
                          <Link
                            className="break-words underline-offset-4 hover:underline"
                            href={`/clients/${client.id}`}
                          >
                            {asText(client?.name, "Unnamed client")}
                          </Link>
                        ) : (
                          asText(client?.name, "Unnamed client")
                        )}
                      </span>
                      <span className="block break-words text-sm text-muted-foreground">
                        {asText(client?.company, "No company")}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <StatusBadge
                        status={proposal.approved ? "approved" : "draft"}
                      />
                      {proposal.selected_tier ? (
                        <Badge variant="outline">
                          {proposal.selected_tier === "lean_mvp"
                            ? "Lean MVP"
                            : proposal.selected_tier === "core_build"
                              ? "Core Build"
                              : "Full Launch"}
                        </Badge>
                      ) : null}
                      <SentBadge sent={proposal.sent} />
                      <ChevronDown
                        aria-hidden="true"
                        className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                      />
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-wrap gap-3 text-sm text-muted-foreground">
                    <span className="break-words">
                      {asText(brief?.project_type, "Project type not set")}
                    </span>
                    <span>Created {formatDate(proposal.created_at)}</span>
                    {proposal.sent ? (
                      <span className="break-words">
                        Sent manually {formatDate(proposal.sent_at)}
                        {proposal.sent_method ? ` via ${proposal.sent_method}` : ""}
                      </span>
                    ) : (
                      <span>Not sent</span>
                    )}
                  </div>
                </summary>

                <CardContent className="space-y-6 border-t pt-6">
                  <section className="space-y-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      Proposal summary
                    </h3>
                    <p className="break-words text-sm leading-6 text-muted-foreground">
                      {asText(proposal.proposal_summary)}
                    </p>
                  </section>

                  {brief?.problem ? (
                    <section className="space-y-2 rounded-md border bg-muted/20 p-4">
                      <h3 className="text-sm font-semibold text-foreground">
                        Project brief problem
                      </h3>
                      <p className="break-words text-sm leading-6 text-muted-foreground">
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
                      <h3 className="min-w-0 text-sm font-semibold text-foreground">
                        Follow up draft
                      </h3>
                      <CopyFollowUpButton text={followUpMessage} />
                    </div>
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                      Draft only. Nothing has been sent to the client.
                    </p>
                    <div className="rounded-md border bg-background p-4">
                      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                        {asText(followUpMessage)}
                      </p>
                    </div>
                  </section>
                </CardContent>

                <CardFooter className="flex flex-col items-stretch gap-4 border-t">
                  <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 flex-col gap-2 md:flex-row md:flex-wrap">
                      {proposal.approved && proposal.selected_tier ? null : (
                        <ApprovalButton
                          approvalType="proposal"
                          id={proposal.id}
                          label={
                            proposal.approved
                              ? "Confirm Build Tier"
                              : undefined
                          }
                        />
                      )}
                      {!sentTrackingAvailable || proposal.sent ? null : (
                        <MarkProposalSentButton proposalId={proposal.id} />
                      )}
                      <GenerateBuildTasksButton
                        approved={Boolean(proposal.approved)}
                        proposalId={proposal.id}
                      />
                      <GenerateLaunchChecklistButton
                        approved={Boolean(proposal.approved)}
                        proposalId={proposal.id}
                      />
                      <CreateProjectButton
                        approved={Boolean(proposal.approved)}
                        existingProjectId={proposal.project_id}
                        proposalId={proposal.id}
                      />
                      <StartPipelineButton
                        approved={Boolean(proposal.approved)}
                        proposalId={proposal.id}
                        repositories={pipelineRepos}
                        run={runByProposalId.get(proposal.id) ?? null}
                        taskCount={taskCountByProposalId.get(proposal.id) ?? 0}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge
                        status={proposal.approved ? "approved" : "draft"}
                      />
                      {proposal.selected_tier ? (
                        <Badge variant="outline">
                          {proposal.selected_tier === "lean_mvp"
                            ? "Lean MVP"
                            : proposal.selected_tier === "core_build"
                              ? "Core Build"
                              : "Full Launch"}
                        </Badge>
                      ) : null}
                      <SentBadge sent={proposal.sent} />
                    </div>
                  </div>
                  <ProposalCost
                    usage={usageByProposalId.get(proposal.id) ?? []}
                    taskCount={taskCountByProposalId.get(proposal.id) ?? 0}
                  />

                  <p className="text-xs text-muted-foreground">
                    Build tasks are internal only. No GitHub issues are created
                    yet. Launch checklist is internal only. Nothing will be
                    deployed.
                  </p>
                </CardFooter>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string | string[] }>;
}) {
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
            <Button asChild variant="secondary">
              <Link href="/tasks">Tasks</Link>
            </Button>
          </div>
        </header>

        <Suspense fallback={<ProposalsFallback />}>
          <ProposalsContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
