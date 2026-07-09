// Self-check for the row-parsing and grouping in usage.ts.
// No network, no database, no framework. Run: `node lib/ai/usage.check.ts`
//
// These two functions decide the dollar figure rendered above a button that
// spends money, so the things worth pinning are the ways they could quietly
// produce a wrong number: a malformed row crashing the page, a row with no
// proposalId being bucketed under a bogus key, or a garbage token count being
// read as a real one.

import assert from "node:assert/strict";
import { groupUsageRows, toUsage } from "./usage.ts";

const row = (metadata: unknown) => ({ metadata });

const good = {
  kind: "build_tasks",
  proposalId: "prop-1",
  model: "claude-haiku-4-5",
  inputTokens: 1000,
  outputTokens: 500,
  cachedInputTokens: 0,
};

// --- toUsage: a well-formed row round-trips ---
assert.deepEqual(toUsage(good), {
  model: "claude-haiku-4-5",
  inputTokens: 1000,
  outputTokens: 500,
  cachedInputTokens: 0,
});

// --- toUsage: junk must be null, not a partly-filled object ---
assert.equal(toUsage(null), null, "null metadata");
assert.equal(toUsage(undefined), null, "undefined metadata");
assert.equal(toUsage("not an object"), null, "string metadata");
assert.equal(toUsage(42), null, "number metadata");
assert.equal(toUsage({}), null, "no model field");
assert.equal(toUsage({ model: 7 }), null, "non-string model");

// --- toUsage: token counts coerce to a safe 0 rather than NaN/negative ---
assert.deepEqual(
  toUsage({ model: "m", inputTokens: "1000", outputTokens: -5 }),
  { model: "m", inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
  "a string token count and a negative one both floor to 0",
);
assert.deepEqual(
  toUsage({ model: "m" }),
  { model: "m", inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
  "missing token fields default to 0",
);

// --- groupUsageRows: buckets by proposal ---
const grouped = groupUsageRows([
  row({ ...good, proposalId: "prop-1", inputTokens: 100 }),
  row({ ...good, proposalId: "prop-1", inputTokens: 200 }),
  row({ ...good, proposalId: "prop-2", inputTokens: 300 }),
]);
assert.equal(grouped.size, 2, "two proposals");
assert.equal(grouped.get("prop-1")?.length, 2, "prop-1 has both calls");
assert.equal(grouped.get("prop-2")?.length, 1, "prop-2 has one call");
assert.deepEqual(
  grouped.get("prop-1")?.map((u) => u.inputTokens),
  [100, 200],
  "calls are kept, not merged",
);

// --- groupUsageRows: rows with no proposal are dropped, not keyed as "null" ---
const withNulls = groupUsageRows([
  row({ ...good, proposalId: null }), // intake
  row({ ...good, proposalId: undefined }), // the proposal call itself
  row({ ...good, proposalId: "prop-1" }),
]);
assert.equal(withNulls.size, 1, "only the row with a real proposalId survives");
assert.equal(withNulls.has("null"), false, "no bogus 'null' bucket");
assert.equal(withNulls.has("undefined"), false, "no bogus 'undefined' bucket");

// --- groupUsageRows: a malformed row is skipped, it does not throw ---
const withJunk = groupUsageRows([
  row(null),
  row("garbage"),
  row({ proposalId: "prop-1" }), // has a proposal but no model
  row({ ...good, proposalId: "prop-1" }),
]);
assert.equal(withJunk.get("prop-1")?.length, 1, "only the valid row is kept");

assert.equal(groupUsageRows([]).size, 0, "empty input, empty map");

console.log("usage.check.ts: all checks passed");
