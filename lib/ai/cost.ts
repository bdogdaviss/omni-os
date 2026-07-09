// What Omni OS's model calls cost, in money.
//
// Callers store TOKENS (see lib/ai/usage.ts); this file turns tokens into
// dollars at read time. That split matters: prices change, and a stored dollar
// figure silently becomes a lie the day they do. Recomputing from tokens keeps
// history correct across a price change.
//
// Two kinds of number live here, and they are not the same kind of number:
//   - usdCents()             — arithmetic on tokens we actually observed. Exact.
//   - estimateAgentBuild()   — a guess about runs that have not happened yet.

import type { Usage } from "./generate";

/**
 * USD per million tokens. Checked against Anthropic's pricing on 2026-07-09.
 *
 * Claude Sonnet 5 is on INTRODUCTORY pricing ($2/$10) that ends 2026-08-31.
 * On 2026-09-01 it reverts to $3.00 input / $15.00 output — a 50% increase to
 * every coding-agent run. Update the two Sonnet numbers below on that date.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-5": { input: 2.0, output: 10.0 },
  "claude-opus-4-8": { input: 5.0, output: 25.0 },
  // The failover model (checked against OpenAI's pricing page 2026-07-09).
  // Its cache-read discount is 50%, not Anthropic's 10% — but the OpenAI path
  // in generate.ts always records cachedInputTokens: 0, so CACHE_READ_DISCOUNT
  // never applies to these rows; every OpenAI token is priced as fresh input.
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

export const SONNET_5_INTRO_PRICING_ENDS = "2026-08-31";

/** Cache reads bill at ~10% of the fresh input rate. */
const CACHE_READ_DISCOUNT = 0.1;

/** `claude-haiku-4-5-20251001` and `claude-haiku-4-5` are the same price. */
export function normalizeModel(model: string): string {
  return model.trim().replace(/-\d{8}$/, "");
}

/**
 * Cost of one call, in cents (fractional — a Haiku call is a third of a cent).
 *
 * Returns null for a model we have no price for, rather than guessing one. The
 * OpenAI failover path lands here; its tokens are still recorded, they just
 * aren't priced. Callers must surface "unpriced", not silently read it as free.
 */
export function usdCents(usage: Usage): number | null {
  const price = PRICES[normalizeModel(usage.model)];

  if (!price) {
    return null;
  }

  const dollars =
    (usage.inputTokens * price.input +
      usage.cachedInputTokens * price.input * CACHE_READ_DISCOUNT +
      usage.outputTokens * price.output) /
    1_000_000;

  return dollars * 100;
}

/** Total a batch of calls, keeping the unpriced ones visible. */
export function sumUsdCents(usages: Usage[]): {
  cents: number;
  unpricedCalls: number;
} {
  let cents = 0;
  let unpricedCalls = 0;

  for (const usage of usages) {
    const c = usdCents(usage);

    if (c === null) {
      unpricedCalls += 1;
    } else {
      cents += c;
    }
  }

  return { cents, unpricedCalls };
}

// --- Estimating a coding-agent build --------------------------------------

// ponytail: a flat per-task band, not a measurement. Each dispatched task runs
// claude-code-action on Sonnet 5 at --max-turns 70 inside a GitHub Action, and
// its token spend depends on repo size and how many files the agent reads —
// none of which is knowable before the run. Ceiling: ~3x error bars in either
// direction. Upgrade path: once agent runs report their tokens back (the
// GitHub Action would have to POST them; workflow_run webhooks carry timing,
// not tokens), replace these constants with the median of the last N runs.
export const AGENT_RUN_CENTS = {
  low: 100,
  high: 400,
  /** One task that burns all 70 turns on a large repo. */
  ceiling: 800,
};

export type AgentBuildEstimate = {
  taskCount: number;
  lowCents: number;
  highCents: number;
  ceilingCents: number;
  /** False until AGENT_RUN_CENTS is derived from recorded runs. */
  calibrated: boolean;
};

export function estimateAgentBuild(taskCount: number): AgentBuildEstimate {
  const tasks = Math.max(0, Math.trunc(taskCount));

  return {
    taskCount: tasks,
    lowCents: tasks * AGENT_RUN_CENTS.low,
    highCents: tasks * AGENT_RUN_CENTS.high,
    ceilingCents: tasks * AGENT_RUN_CENTS.ceiling,
    calibrated: false,
  };
}

// --- Display --------------------------------------------------------------

/** Cents to "$1.23". Sub-cent amounts keep enough digits to not read as $0.00. */
export function formatUsd(cents: number): string {
  const dollars = cents / 100;

  if (dollars > 0 && dollars < 0.01) {
    return `$${dollars.toFixed(4)}`;
  }

  return `$${dollars.toFixed(2)}`;
}

export function formatUsdRange(lowCents: number, highCents: number): string {
  return `${formatUsd(lowCents)}–${formatUsd(highCents)}`;
}
