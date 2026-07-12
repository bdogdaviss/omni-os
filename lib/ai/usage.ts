// Recording what each model call actually cost, so the estimate can calibrate.
//
// Rows land in activity_events (event_type: "ai_usage") rather than a new
// table — it already has the jsonb metadata column and the RLS policy we need.
// activity_events has no proposal_id column, so the proposal lives in metadata.
//
// Only tokens and the model are stored. Cost is derived by lib/ai/cost.ts at
// read time, so a price change (Sonnet 5's introductory rate ends 2026-08-31)
// reprices history correctly instead of leaving stale dollar figures behind.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Usage } from "./generate";

export type AiUsageKind =
  | "intake"
  | "proposal"
  | "build_tasks"
  | "issue_draft"
  | "launch_checklist"
  | "marketing_kit"
  | "marketing_video";

type RecordArgs = {
  userId: string;
  kind: AiUsageKind;
  usage: Usage;
  clientId?: string | null;
  proposalId?: string | null;
  projectId?: string | null;
};

/**
 * Write one usage row. Never throws and never fails the caller's request: a
 * generated proposal the operator can see is worth more than a cost row, so a
 * telemetry failure is logged and swallowed rather than rolled back over.
 */
export async function recordAiUsage(
  supabase: SupabaseClient,
  { userId, kind, usage, clientId, proposalId, projectId }: RecordArgs,
): Promise<void> {
  const { error } = await supabase.from("activity_events").insert({
    user_id: userId,
    client_id: clientId ?? null,
    project_id: projectId ?? null,
    event_type: "ai_usage",
    title: `AI usage: ${kind}`,
    description: `${usage.model} — ${usage.inputTokens} in / ${usage.outputTokens} out`,
    metadata: {
      kind,
      proposalId: proposalId ?? null,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedInputTokens: usage.cachedInputTokens,
    },
  });

  if (error) {
    console.warn(`Failed to record AI usage for ${kind}:`, error.message);
  }
}

/** Exported for the self-check in usage.check.ts. */
export function toUsage(metadata: unknown): Usage | null {
  if (typeof metadata !== "object" || metadata === null) {
    return null;
  }

  const m = metadata as Record<string, unknown>;

  if (typeof m.model !== "string") {
    return null;
  }

  const num = (v: unknown) => (typeof v === "number" && v >= 0 ? v : 0);

  return {
    model: m.model,
    inputTokens: num(m.inputTokens),
    outputTokens: num(m.outputTokens),
    cachedInputTokens: num(m.cachedInputTokens),
  };
}

/**
 * Every recorded model call, grouped by the proposal it was spent on. This is
 * the "known" half of a cost estimate — actual tokens, actually billed — as
 * opposed to the guessed coding-agent half in cost.ts.
 *
 * Rows with no proposalId (intake, and the proposal call itself) are omitted:
 * they belong to a client, not to a proposal.
 *
 * ponytail: reads every ai_usage row for the user in one query and groups in
 * memory, rather than filtering on `metadata->>proposalId` per proposal.
 * Ceiling: one row per model call, forever — fine at single-operator scale,
 * slow once activity_events is large. Upgrade path: add a proposal_id column
 * to activity_events with an index, and filter in Postgres.
 */
export async function usageByProposal(
  supabase: SupabaseClient,
  userId: string,
): Promise<Map<string, Usage[]>> {
  const { data, error } = await supabase
    .from("activity_events")
    .select("metadata")
    .eq("user_id", userId)
    .eq("event_type", "ai_usage");

  if (error) {
    console.warn("Failed to read AI usage:", error.message);
    return new Map();
  }

  return groupUsageRows((data ?? []) as { metadata: unknown }[]);
}

/**
 * Bucket raw activity_events rows by proposal. Split out from the query above
 * so the arithmetic behind a dollar figure is reachable without a database.
 * Exported for the self-check in usage.check.ts.
 */
export function groupUsageRows(
  rows: { metadata: unknown }[],
): Map<string, Usage[]> {
  const grouped = new Map<string, Usage[]>();

  for (const row of rows) {
    const usage = toUsage(row.metadata);
    const proposalId = (row.metadata as Record<string, unknown> | null)
      ?.proposalId;

    // A null proposalId is intake or the proposal call itself — those belong to
    // a client, not a proposal. Skip, never bucket them under a "null" key.
    if (!usage || typeof proposalId !== "string") {
      continue;
    }

    const existing = grouped.get(proposalId);

    if (existing) {
      existing.push(usage);
    } else {
      grouped.set(proposalId, [usage]);
    }
  }

  return grouped;
}
