// Self-check for the pricing math in cost.ts.
// No network, no framework. Run: `node lib/ai/cost.check.ts`
//
// The thing worth guarding: an unpriced model must come back as null, never as
// zero. A silent $0.00 on the OpenAI failover path would read as "this run was
// free" — the exact wrong answer to show above an approve button.

import assert from "node:assert/strict";
import {
  estimateAgentBuild,
  formatUsd,
  normalizeModel,
  sumUsdCents,
  usdCents,
  VIDEO_AGENT_ESTIMATE_CENTS,
} from "./cost.ts";

const M = 1_000_000;

// Floats: 1e6 * 0.1 is not exactly 100000, so compare within a hundredth of a cent.
function close(actual: number | null, expected: number, what: string) {
  assert.notEqual(actual, null, `${what}: expected a price, got null`);
  assert.ok(
    Math.abs((actual as number) - expected) < 0.01,
    `${what}: expected ~${expected} cents, got ${actual}`,
  );
}

const usage = (
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0,
) => ({ model, inputTokens, outputTokens, cachedInputTokens });

// --- normalizeModel: the date suffix is the same model at the same price ---
assert.equal(normalizeModel("claude-haiku-4-5-20251001"), "claude-haiku-4-5");
assert.equal(normalizeModel("claude-haiku-4-5"), "claude-haiku-4-5");
assert.equal(normalizeModel("  claude-sonnet-5 "), "claude-sonnet-5");
// Not a date suffix — must survive intact, or it silently reprices as another model.
assert.equal(normalizeModel("gpt-4o-mini"), "gpt-4o-mini");

// --- usdCents: Haiku 4.5 is $1.00 in / $5.00 out per million ---
close(usdCents(usage("claude-haiku-4-5", M, 0)), 100, "1M haiku input");
close(usdCents(usage("claude-haiku-4-5", 0, M)), 500, "1M haiku output");
// ANTHROPIC_MODEL defaults to the date-suffixed ID; it must price identically.
close(
  usdCents(usage("claude-haiku-4-5-20251001", M, 0)),
  100,
  "date-suffixed haiku prices the same",
);

// Cache reads bill at a tenth of fresh input.
close(usdCents(usage("claude-haiku-4-5", 0, 0, M)), 10, "1M haiku cache reads");
assert.ok(
  (usdCents(usage("claude-haiku-4-5", M, 0)) as number) >
    (usdCents(usage("claude-haiku-4-5", 0, 0, M)) as number),
  "fresh input must cost more than a cache read",
);

// --- Sonnet 5 (the coding agent) at introductory $2.00 / $10.00 ---
close(usdCents(usage("claude-sonnet-5", M, 0)), 200, "1M sonnet input");
close(usdCents(usage("claude-sonnet-5", 0, M)), 1000, "1M sonnet output");

// A realistic mixed call.
close(
  usdCents(usage("claude-haiku-4-5", 500_000, 200_000, 100_000)),
  151,
  "mixed haiku call",
);

// --- The OpenAI failover model is priced: $0.15 in / $0.60 out per million ---
close(usdCents(usage("gpt-4o-mini", M, 0)), 15, "1M gpt-4o-mini input");
close(usdCents(usage("gpt-4o-mini", 0, M)), 60, "1M gpt-4o-mini output");

// --- The load-bearing edge case: unknown model is null, NOT zero ---
assert.equal(
  usdCents(usage("some-model-we-never-priced", M, M)),
  null,
  "an unknown model must be null, never zero",
);
assert.equal(usdCents(usage("", M, M)), null, "empty model name is null");

// --- sumUsdCents keeps unpriced calls visible rather than counting them free ---
const summed = sumUsdCents([
  usage("claude-haiku-4-5", M, 0),
  usage("some-model-we-never-priced", M, M),
  usage("claude-sonnet-5", M, 0),
]);
close(summed.cents, 300, "sum of the two priced calls");
assert.equal(summed.unpricedCalls, 1, "the unpriced call is reported, not hidden");
assert.deepEqual(sumUsdCents([]), { cents: 0, unpricedCalls: 0 }, "empty sum");

// --- estimateAgentBuild scales with task count and stays sane at the edges ---
const twentyFive = estimateAgentBuild(25);
assert.equal(twentyFive.taskCount, 25);
assert.equal(twentyFive.lowCents, 2500, "25 tasks x $1.00 floor");
assert.equal(twentyFive.highCents, 10_000, "25 tasks x $4.00");
assert.ok(
  twentyFive.ceilingCents > twentyFive.highCents,
  "ceiling must exceed the high estimate",
);
assert.equal(
  twentyFive.calibrated,
  false,
  "must not claim calibration before any run is recorded",
);
assert.equal(estimateAgentBuild(0).highCents, 0, "no tasks, no cost");
assert.equal(estimateAgentBuild(-3).taskCount, 0, "negative task count clamps to 0");
assert.equal(estimateAgentBuild(2.7).taskCount, 2, "fractional task count truncates");
assert.deepEqual(VIDEO_AGENT_ESTIMATE_CENTS.claude, { low: 100, high: 400 });
assert.deepEqual(VIDEO_AGENT_ESTIMATE_CENTS.openai, { low: 100, high: 600 });

// --- formatUsd: a third of a cent must not render as $0.00 ---
assert.equal(formatUsd(4531), "$45.31");
assert.equal(formatUsd(0), "$0.00");
assert.equal(formatUsd(0.31), "$0.0031", "sub-cent keeps digits");
assert.equal(formatUsd(1), "$0.01");

console.log("cost.check.ts: all checks passed");
