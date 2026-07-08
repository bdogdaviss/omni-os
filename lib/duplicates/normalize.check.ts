// Self-check for the duplicate-detection helpers. No framework.
// Run: node lib/duplicates/normalize.check.ts
import assert from "node:assert/strict";
import { isDuplicateDatabaseError, normalizeText } from "./normalize.ts";

// --- normalizeText: trim, lowercase, collapse internal whitespace ---
assert.equal(normalizeText("  Acme  Corp "), "acme corp", "trim + collapse + lowercase");
assert.equal(normalizeText("ACME"), "acme", "lowercase");
assert.equal(normalizeText("a\t\n  b"), "a b", "collapse tabs/newlines to one space");
assert.equal(normalizeText(""), "", "empty string");
assert.equal(normalizeText(null), "", "null → empty");
assert.equal(normalizeText(undefined), "", "undefined → empty");
// The whole point: two visually-different spellings normalize equal, so the
// dedup pre-check catches them.
assert.equal(
  normalizeText("  ACME   corp") === normalizeText("acme corp"),
  true,
  "spacing/case variants collapse to the same key",
);

// --- isDuplicateDatabaseError: Postgres 23505, by code or message ---
assert.equal(isDuplicateDatabaseError({ code: "23505" }), true, "23505 code");
assert.equal(
  isDuplicateDatabaseError({ message: "duplicate key value violates unique constraint" }),
  true,
  "duplicate-key message (case-insensitive)",
);
assert.equal(
  isDuplicateDatabaseError({ message: "DUPLICATE KEY VALUE" }),
  true,
  "duplicate-key message uppercase",
);
assert.equal(isDuplicateDatabaseError({ code: "23503" }), false, "FK violation is not a dup");
assert.equal(isDuplicateDatabaseError({ message: "connection refused" }), false, "unrelated error");
assert.equal(isDuplicateDatabaseError(null), false, "null");
assert.equal(isDuplicateDatabaseError("23505"), false, "a bare string is not an error object");
assert.equal(isDuplicateDatabaseError(undefined), false, "undefined");

console.log("normalize.check.ts: all checks passed");
