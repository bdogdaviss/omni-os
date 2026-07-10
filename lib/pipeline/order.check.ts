// Self-check for the dependency ordering that decides dispatch sequence.
// No network, no framework. Run: `node lib/pipeline/order.check.ts`
//
// The pipeline builds task N+1 on top of task N's merged code, so a wrong
// order here means agents building against code that doesn't exist yet. The
// cases worth pinning: dependencies actually come first, stability when there
// are none, tolerance for junk (unknown titles, self-references, cycles).

import assert from "node:assert/strict";
import { orderTasksByDependencies } from "./order.ts";

const t = (id: string, title: string, deps: unknown = []) => ({
  id,
  title,
  dependencies: deps,
});

// --- no dependencies: original order preserved ---
assert.deepEqual(
  orderTasksByDependencies([t("a", "Schema"), t("b", "API"), t("c", "UI")]),
  ["a", "b", "c"],
  "no deps -> original order",
);

// --- classic chain, listed out of order: dependencies come first ---
assert.deepEqual(
  orderTasksByDependencies([
    t("ui", "Build the dashboard UI", ["Create the API endpoint"]),
    t("api", "Create the API endpoint", ["Add the database schema"]),
    t("db", "Add the database schema"),
  ]),
  ["db", "api", "ui"],
  "chain resolves db -> api -> ui",
);

// --- title matching is normalized (case/whitespace) ---
assert.deepEqual(
  orderTasksByDependencies([
    t("ui", "Build UI", ["  add THE schema  "]),
    t("db", "Add the Schema"),
  ]),
  ["db", "ui"],
  "dependency titles match through normalizeText",
);

// --- junk tolerance ---
assert.deepEqual(
  orderTasksByDependencies([
    t("a", "First", ["Task that was deduped away", 42, null]),
    t("b", "Second", ["First"]),
  ]),
  ["a", "b"],
  "unknown titles and non-string deps are ignored",
);
assert.deepEqual(
  orderTasksByDependencies([t("a", "Self", ["Self"]), t("b", "Other")]),
  ["a", "b"],
  "self-reference is ignored, not a deadlock",
);

// --- cycle: broken by original order instead of hanging ---
assert.deepEqual(
  orderTasksByDependencies([
    t("a", "Alpha", ["Beta"]),
    t("b", "Beta", ["Alpha"]),
    t("c", "Gamma", ["Beta"]),
  ]),
  ["a", "b", "c"],
  "cycle forces earliest task, rest resolve normally",
);

// --- every task appears exactly once, whatever the input shape ---
const big = orderTasksByDependencies([
  t("1", "A", ["B"]),
  t("2", "B", ["C"]),
  t("3", "C", ["A"]), // cycle back
  t("4", "D", ["C"]),
  t("5", "E"),
]);
assert.equal(big.length, 5, "all tasks present");
assert.equal(new Set(big).size, 5, "no duplicates");

assert.deepEqual(orderTasksByDependencies([]), [], "empty input");

console.log("order.check.ts: all checks passed");
