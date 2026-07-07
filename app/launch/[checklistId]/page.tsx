import Link from "next/link";
import { Suspense } from "react";

import { DashboardNav } from "@/components/dashboard-nav";
import { LaunchChecklistItemStatusSelect } from "@/components/launch-checklist-item-status-select";
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

type ItemRecord = {
  id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  priority: string | null;
  status: string | null;
  verification_steps: unknown;
  notes: string | null;
  created_at: string | null;
};

type ClientRecord = {
  id: string;
  name: string | null;
  company: string | null;
};

const ITEM_STATUS_ORDER = [
  "not_started",
  "in_progress",
  "verified",
  "blocked",
  "not_applicable",
] as const;

type ItemStatus = (typeof ITEM_STATUS_ORDER)[number];

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

function normalizeItemStatus(value: string | null | undefined): ItemStatus {
  const candidate = (value ?? "not_started").toLowerCase();

  return (ITEM_STATUS_ORDER as readonly string[]).includes(candidate)
    ? (candidate as ItemStatus)
    : "not_started";
}

function formatItemStatusLabel(value: string | null | undefined) {
  switch (normalizeItemStatus(value)) {
    case "in_progress":
      return "In Progress";
    case "verified":
      return "Verified";
    case "blocked":
      return "Blocked";
    case "not_applicable":
      return "Not Applicable";
    case "not_started":
    default:
      return "Not Started";
  }
}

function getItemStatusBadgeClass(value: string | null | undefined) {
  switch (normalizeItemStatus(value)) {
    case "in_progress":
      return "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-50";
    case "verified":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50";
    case "blocked":
      return "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-50";
    case "not_applicable":
      return "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100";
    case "not_started":
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

function groupItemsByCategory(items: ItemRecord[]) {
  const groups = new Map<string, ItemRecord[]>();

  for (const item of items) {
    const category = asText(item.category, "uncategorized").toLowerCase();
    const existing = groups.get(category);

    if (existing) {
      existing.push(item);
    } else {
      groups.set(category, [item]);
    }
  }

  return groups;
}

function isMissingTableError(errorMessage: string) {
  const message = errorMessage.toLowerCase();

  return (
    message.includes("launch_checklist_items") ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

function LoginPrompt() {
  return (
    <Card className="rounded-lg border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle>Log in to view this checklist</CardTitle>
        <CardDescription>
          Omni OS keeps launch checklists scoped to your account. Sign in to
          continue.
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
        <CardTitle>Launch checklist not found</CardTitle>
        <CardDescription>
          This checklist does not exist or belongs to another account.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button asChild variant="outline">
          <Link href="/launch">Back to launch checklists</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <Card className="rounded-lg border-destructive/40 shadow-sm">
      <CardHeader>
        <CardTitle>Could not load this checklist</CardTitle>
        <CardDescription>{message}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function ItemsSchemaNotice() {
  return (
    <Card className="rounded-lg border-amber-200 bg-amber-50 shadow-sm">
      <CardHeader>
        <CardTitle className="text-amber-900">
          Checklist items are not enabled yet
        </CardTitle>
        <CardDescription className="text-amber-800">
          Run the launch_checklist_items SQL in Supabase to view items on this
          page.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

async function ChecklistDetail({
  params,
}: {
  params: Promise<{ checklistId: string }>;
}) {
  const { checklistId } = await params;
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
    .eq("id", checklistId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (checklistError) {
    if (isMissingTableError(checklistError.message)) {
      return <ItemsSchemaNotice />;
    }

    return <ErrorCard message={checklistError.message} />;
  }

  if (!checklistData) {
    return <NotFoundCard />;
  }

  const checklist = checklistData as ChecklistRecord;

  let client: ClientRecord | null = null;

  if (checklist.client_id) {
    const { data: clientData } = await supabase
      .from("clients")
      .select("id, name, company")
      .eq("id", checklist.client_id)
      .eq("user_id", user.id)
      .maybeSingle();

    client = (clientData as ClientRecord | null) ?? null;
  }

  const { data: itemData, error: itemError } = await supabase
    .from("launch_checklist_items")
    .select(
      "id, title, description, category, priority, status, verification_steps, notes, created_at",
    )
    .eq("checklist_id", checklistId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (itemError) {
    if (isMissingTableError(itemError.message)) {
      return <ItemsSchemaNotice />;
    }

    return <ErrorCard message={itemError.message} />;
  }

  const items = (itemData ?? []) as ItemRecord[];
  const statusCounts = ITEM_STATUS_ORDER.reduce<Record<ItemStatus, number>>(
    (counts, status) => {
      counts[status] = items.filter(
        (item) => normalizeItemStatus(item.status) === status,
      ).length;

      return counts;
    },
    {
      not_started: 0,
      in_progress: 0,
      verified: 0,
      blocked: 0,
      not_applicable: 0,
    },
  );
  const computedProgress =
    items.length > 0
      ? Math.round((statusCounts.verified / items.length) * 100)
      : 0;
  const groupedItems = groupItemsByCategory(items);

  return (
    <div className="space-y-8">
      <Card className="rounded-lg border-border/70 shadow-sm">
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-2xl">
                {asText(checklist.title, "Launch checklist")}
              </CardTitle>
              <CardDescription>
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
            <Button asChild size="sm" variant="outline">
              <Link href="/launch">Back to launch</Link>
            </Button>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {asText(checklist.summary, "No summary")}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              Draft readiness {checklist.readiness_score ?? 0}%
            </span>
            <span>Verified progress {computedProgress}%</span>
            <Badge variant="secondary">
              {asText(checklist.overall_status, "draft")}
            </Badge>
            <span>Created {formatDate(checklist.created_at)}</span>
          </div>
        </CardHeader>
      </Card>

      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Internal checklist only. Updating these items does not deploy anything.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total items" value={items.length} />
        <StatCard label="Not started" value={statusCounts.not_started} />
        <StatCard label="In progress" value={statusCounts.in_progress} />
        <StatCard label="Verified" value={statusCounts.verified} />
        <StatCard label="Blocked" value={statusCounts.blocked} />
        <StatCard label="Not applicable" value={statusCounts.not_applicable} />
      </div>

      {items.length === 0 ? (
        <Card className="rounded-lg border-dashed shadow-sm">
          <CardHeader>
            <CardDescription>
              This checklist has no items yet.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-8">
          {Array.from(groupedItems.entries()).map(
            ([category, categoryItems]) => (
              <section key={category} className="space-y-4">
                <div className="flex items-center gap-3 border-b pb-3">
                  <h2 className="text-lg font-semibold tracking-tight">
                    {category}
                  </h2>
                  <Badge variant="secondary">{categoryItems.length}</Badge>
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  {categoryItems.map((item) => {
                    const verificationSteps = toTextList(
                      item.verification_steps,
                    );

                    return (
                      <Card
                        key={item.id}
                        className="flex flex-col rounded-lg border-border/70 shadow-sm"
                      >
                        <CardHeader className="gap-3 border-b">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <CardTitle className="text-base">
                              {asText(item.title, "Untitled item")}
                            </CardTitle>
                            <Badge
                              variant="outline"
                              className={cn(
                                getItemStatusBadgeClass(item.status),
                              )}
                            >
                              {formatItemStatusLabel(item.status)}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="outline">
                              {asText(item.category, "uncategorized")}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn(
                                getPriorityBadgeClass(item.priority),
                              )}
                            >
                              {asText(item.priority, "medium")} priority
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="flex-1 space-y-4 pt-4 text-sm">
                          <p className="leading-6 text-muted-foreground">
                            {asText(item.description, "No description")}
                          </p>
                          <section className="space-y-2">
                            <h3 className="text-sm font-semibold text-foreground">
                              Verification steps
                            </h3>
                            {verificationSteps.length > 0 ? (
                              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                                {verificationSteps.map((step, index) => (
                                  <li
                                    key={`${item.id}-step-${index}`}
                                    className="leading-6"
                                  >
                                    {step}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-muted-foreground">
                                None listed
                              </p>
                            )}
                          </section>
                          {item.notes?.trim() ? (
                            <section className="space-y-1 rounded-md border bg-muted/30 p-3">
                              <h3 className="text-sm font-semibold text-foreground">
                                Notes
                              </h3>
                              <p className="leading-6 text-muted-foreground">
                                {item.notes}
                              </p>
                            </section>
                          ) : null}
                        </CardContent>
                        <CardFooter className="flex flex-col items-stretch gap-3 border-t">
                          <span className="text-xs text-muted-foreground">
                            Created {formatDate(item.created_at)}
                          </span>
                          <LaunchChecklistItemStatusSelect
                            currentStatus={normalizeItemStatus(item.status)}
                            itemId={item.id}
                          />
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              </section>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export default function LaunchChecklistDetailPage({
  params,
}: {
  params: Promise<{ checklistId: string }>;
}) {
  return (
    <main className="min-h-screen bg-muted/30 px-6 py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <Suspense
          fallback={
            <div className="h-11 rounded-lg border bg-background shadow-sm" />
          }
        >
          <DashboardNav />
        </Suspense>
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-6">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Omni OS · Launch readiness
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Launch Checklist
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Internal launch readiness checklist. Nothing is deployed
              automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/launch">All Checklists</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          </div>
        </header>

        <Suspense
          fallback={
            <p className="text-sm text-muted-foreground">Loading checklist…</p>
          }
        >
          <ChecklistDetail params={params} />
        </Suspense>
      </div>
    </main>
  );
}
