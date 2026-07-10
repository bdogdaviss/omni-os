// GitHub webhook signature verification (X-Hub-Signature-256).
//
// GitHub signs the raw request body with HMAC-SHA256 using the webhook secret
// and sends the hex digest as "sha256=<hex>". Verification must run on the raw
// body bytes BEFORE any JSON parsing — re-serialized JSON is different bytes
// and a broken MAC. This is a trust boundary: the route is unauthenticated and
// writes to the database, so the signature is the only thing standing between
// "GitHub said the issue closed" and "anyone on the internet said so".

import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyGitHubSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!secret || !signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest();
  const given = Buffer.from(
    signatureHeader.slice("sha256=".length).toLowerCase(),
    "hex",
  );

  // timingSafeEqual throws on length mismatch, so gate it. Non-hex input makes
  // Buffer.from(..., "hex") stop early, which lands here too.
  if (given.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(expected, given);
}
