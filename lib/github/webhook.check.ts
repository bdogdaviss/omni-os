// Self-check for the webhook trust boundary and the shared task-status rules.
// No network, no framework. Run: `node lib/github/webhook.check.ts`
//
// The signature check is the only authentication on a route that writes to the
// database, so the cases worth pinning are the ways an attacker or a subtle
// bug could slip past it: tampered body, wrong secret, wrong scheme, garbage
// hex, and the length-mismatch path that would make timingSafeEqual throw.

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyGitHubSignature } from "./webhook.ts";
import { taskStatusUpdatePayload } from "../task-status.ts";

const secret = "test-webhook-secret";
const body = JSON.stringify({ action: "closed", issue: { number: 7 } });
const sign = (payload: string, key = secret) =>
  "sha256=" + createHmac("sha256", key).update(payload, "utf8").digest("hex");

// --- the happy path ---
assert.equal(verifyGitHubSignature(body, sign(body), secret), true, "valid sig");
assert.equal(
  verifyGitHubSignature(body, sign(body).toUpperCase().replace("SHA256=", "sha256="), secret),
  true,
  "uppercase hex digest still verifies (we lowercase before compare)",
);

// --- every way in that must stay closed ---
assert.equal(
  verifyGitHubSignature(body + " ", sign(body), secret),
  false,
  "tampered body (one byte) fails",
);
assert.equal(
  verifyGitHubSignature(body, sign(body, "wrong-secret"), secret),
  false,
  "signature from the wrong secret fails",
);
assert.equal(verifyGitHubSignature(body, null, secret), false, "missing header fails");
assert.equal(verifyGitHubSignature(body, "", secret), false, "empty header fails");
assert.equal(
  verifyGitHubSignature(body, sign(body).replace("sha256=", "sha1="), secret),
  false,
  "sha1 scheme fails",
);
assert.equal(
  verifyGitHubSignature(body, "sha256=zzzz-not-hex", secret),
  false,
  "non-hex digest fails without throwing",
);
assert.equal(
  verifyGitHubSignature(body, "sha256=abcd", secret),
  false,
  "truncated digest fails without throwing (length mismatch path)",
);
assert.equal(
  verifyGitHubSignature(body, sign(body), ""),
  false,
  "empty secret fails even with a matching signature",
);

// --- shared task-status transition rules (used by webhook + update-status) ---
const NOW = "2026-07-09T12:00:00.000Z";

assert.deepEqual(
  taskStatusUpdatePayload("done", null, NOW),
  { status: "done", updated_at: NOW, completed_at: NOW },
  "done stamps completed_at",
);
assert.deepEqual(
  taskStatusUpdatePayload("in_progress", null, NOW),
  { status: "in_progress", updated_at: NOW, completed_at: null, started_at: NOW },
  "first entry to in_progress stamps started_at and clears completed_at",
);
assert.deepEqual(
  taskStatusUpdatePayload("in_progress", "2026-07-01T00:00:00Z", NOW),
  { status: "in_progress", updated_at: NOW, completed_at: null },
  "re-entering in_progress keeps the original started_at",
);
assert.deepEqual(
  taskStatusUpdatePayload("to_do", "2026-07-01T00:00:00Z", NOW),
  { status: "to_do", updated_at: NOW, completed_at: null },
  "leaving done clears completed_at",
);

console.log("webhook.check.ts: all checks passed");
