// GitHub App authentication using native Node crypto.
//
// Security rules:
// - The private key and app JWT never leave the server.
// - Installation access tokens are short lived, generated on demand, and are
//   NEVER stored in Supabase or exposed to the client.

import crypto from "node:crypto";

const GITHUB_API_BASE = "https://api.github.com";

function base64UrlEncode(input: Buffer | string) {
  const buffer = typeof input === "string" ? Buffer.from(input) : input;

  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function getAppId() {
  const appId = process.env.GITHUB_APP_ID?.trim();

  if (!appId) {
    throw new Error(
      "Missing GITHUB_APP_ID. Set it in your server environment before connecting the GitHub App.",
    );
  }

  return appId;
}

function getPrivateKey() {
  const raw = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!raw?.trim()) {
    throw new Error(
      "Missing GITHUB_APP_PRIVATE_KEY. Set it in your server environment before connecting the GitHub App.",
    );
  }

  // Env files often store the PEM with escaped newlines.
  return raw.replace(/\\n/g, "\n");
}

/** Create a short-lived GitHub App JWT (RS256). */
export function createGitHubAppJwt() {
  const appId = getAppId();
  const privateKey = getPrivateKey();
  const now = Math.floor(Date.now() / 1000);

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: appId,
    }),
  );
  const signingInput = `${header}.${payload}`;

  const signature = crypto.sign(
    "RSA-SHA256",
    Buffer.from(signingInput),
    privateKey,
  );

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

/**
 * Exchange the app JWT for a short-lived installation access token.
 * Do not store the returned token anywhere.
 */
export async function getGitHubInstallationToken(installationId: string) {
  const trimmed = installationId?.trim();

  if (!trimmed) {
    throw new Error("Missing GitHub installation ID.");
  }

  const appJwt = createGitHubAppJwt();

  const response = await fetch(
    `${GITHUB_API_BASE}/app/installations/${encodeURIComponent(trimmed)}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${appJwt}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");

    throw new Error(
      `GitHub installation token request failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as { token?: string };

  if (!data.token) {
    throw new Error("GitHub did not return an installation token.");
  }

  return data.token;
}

/** Fetch installation metadata (account login/type) using the app JWT. */
export async function getGitHubInstallationInfo(installationId: string) {
  const appJwt = createGitHubAppJwt();

  const response = await fetch(
    `${GITHUB_API_BASE}/app/installations/${encodeURIComponent(installationId.trim())}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${appJwt}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as {
    account?: { login?: string; type?: string };
  };

  return {
    accountLogin: data.account?.login ?? null,
    accountType: data.account?.type ?? null,
  };
}
