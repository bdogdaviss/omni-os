// Shared GitHub publishing safety helpers.
//
// Real GitHub issue creation is disabled unless GITHUB_REAL_PUBLISHING_ENABLED
// is EXACTLY the string "true". Missing, empty, "1", "TRUE", etc. all mean
// disabled. This is checked server side in the create route — the UI state is
// informational only and never the real gate.

export const GITHUB_CONFIRMATION_PHRASE = "CREATE GITHUB ISSUE";

export function isRealPublishingEnabled() {
  return process.env.GITHUB_REAL_PUBLISHING_ENABLED === "true";
}

export function githubEnvReadiness() {
  return {
    githubAppIdConfigured: Boolean(process.env.GITHUB_APP_ID?.trim()),
    githubAppSlugConfigured: Boolean(process.env.GITHUB_APP_SLUG?.trim()),
    githubPrivateKeyConfigured: Boolean(
      process.env.GITHUB_APP_PRIVATE_KEY?.trim(),
    ),
    githubWebhookSecretConfigured: Boolean(
      process.env.GITHUB_WEBHOOK_SECRET?.trim(),
    ),
    realPublishingEnabled: isRealPublishingEnabled(),
  };
}

/** Normalize a jsonb labels value into a clean string array. */
export function toLabelList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .map((label) => label.trim())
      .filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}
