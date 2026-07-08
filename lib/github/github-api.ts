// Server-side GitHub API helpers.
//
// All GitHub calls happen here or in server routes only. Tokens are passed in
// per call and never exposed to the client or stored in Supabase.

import { getGitHubInstallationToken } from "@/lib/github/app-auth";
import { createClient } from "@/lib/supabase/server";

const GITHUB_API_BASE = "https://api.github.com";

export async function githubFetch(
  path: string,
  options: RequestInit = {},
  token: string,
) {
  return fetch(`${GITHUB_API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers ?? {}),
    },
  });
}

/** Fetch JSON from GitHub, throwing a useful error on failure. */
export async function githubJson<T>(
  path: string,
  options: RequestInit,
  token: string,
): Promise<T> {
  const response = await githubFetch(path, options, token);

  if (!response.ok) {
    const detail = await response.text().catch(() => "");

    throw new Error(
      `GitHub API ${path} failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  return (await response.json()) as T;
}

/**
 * Add labels to an issue. Labels must already exist in the repository, or
 * GitHub returns 422. Used to trigger the repo's coding-agent workflow.
 */
export async function addIssueLabels(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  labels: string[],
) {
  return githubFetch(
    `/repos/${owner}/${repo}/issues/${issueNumber}/labels`,
    { method: "POST", body: JSON.stringify({ labels }) },
    token,
  );
}

/**
 * Ensure a label exists in the repository. Returns the create response.
 * A 422 means the label already exists, which the caller treats as success.
 * Uses the Issues write permission — no extra App scope required.
 */
export async function ensureRepoLabel(
  token: string,
  owner: string,
  repo: string,
  name: string,
  color: string,
  description: string,
) {
  return githubFetch(
    `/repos/${owner}/${repo}/labels`,
    { method: "POST", body: JSON.stringify({ name, color, description }) },
    token,
  );
}

/**
 * Remove a single label from an issue. Ignores a 404 (label not present).
 * Used before re-adding a label so the "labeled" event fires again on a retry.
 */
export async function removeIssueLabel(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  label: string,
) {
  return githubFetch(
    `/repos/${owner}/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
    { method: "DELETE" },
    token,
  );
}

/** Post a comment on an issue. Best-effort audit trail. */
export async function createIssueComment(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
) {
  return githubFetch(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    { method: "POST", body: JSON.stringify({ body }) },
    token,
  );
}

/**
 * Get a file's blob sha, or null if it does not exist (404). Used to decide
 * between create and update, and to avoid overwriting existing files.
 * Requires Contents: read on the App.
 */
export async function getRepoFileSha(
  token: string,
  owner: string,
  repo: string,
  path: string,
): Promise<{ sha: string | null; response: Response }> {
  const response = await githubFetch(
    `/repos/${owner}/${repo}/contents/${path}`,
    {},
    token,
  );

  if (response.status === 404) {
    return { sha: null, response };
  }

  if (!response.ok) {
    return { sha: null, response };
  }

  const data = (await response.json()) as { sha?: string };

  return { sha: data.sha ?? null, response };
}

/**
 * Create or update a file via the Contents API. Pass sha to update an existing
 * file. Writing under .github/workflows/ additionally requires the App's
 * Workflows: write permission. Returns the raw Response for the caller to
 * inspect (permission errors surface as 403).
 */
export async function putRepoFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  contentUtf8: string,
  message: string,
  sha?: string | null,
) {
  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(contentUtf8, "utf8").toString("base64"),
  };

  if (sha) {
    body.sha = sha;
  }

  return githubFetch(
    `/repos/${owner}/${repo}/contents/${path}`,
    { method: "PUT", body: JSON.stringify(body) },
    token,
  );
}

/**
 * Get the repository's Actions secrets public key (for encrypting a secret).
 * Requires the App's Secrets: read (included in Secrets: write).
 */
export async function getRepoActionsPublicKey(
  token: string,
  owner: string,
  repo: string,
) {
  return githubFetch(
    `/repos/${owner}/${repo}/actions/secrets/public-key`,
    {},
    token,
  );
}

/**
 * Create or update an Actions repository secret. `encryptedValue` must already
 * be sealed with the repo public key. Requires the App's Secrets: write.
 */
export async function putRepoActionsSecret(
  token: string,
  owner: string,
  repo: string,
  secretName: string,
  encryptedValue: string,
  keyId: string,
) {
  return githubFetch(
    `/repos/${owner}/${repo}/actions/secrets/${secretName}`,
    {
      method: "PUT",
      body: JSON.stringify({ encrypted_value: encryptedValue, key_id: keyId }),
    },
    token,
  );
}

/**
 * Set default workflow permissions and allow Actions to create/approve PRs.
 * Requires the App's Administration: write (repo admin).
 */
export async function setActionsCreatePrPermission(
  token: string,
  owner: string,
  repo: string,
) {
  return githubFetch(
    `/repos/${owner}/${repo}/actions/permissions/workflow`,
    {
      method: "PUT",
      body: JSON.stringify({
        default_workflow_permissions: "write",
        can_approve_pull_request_reviews: true,
      }),
    },
    token,
  );
}

export type GitHubRepo = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  owner: { login: string };
  has_issues: boolean;
  archived: boolean;
};

/** List all repositories accessible to a GitHub App installation. */
export async function syncInstallationRepositories(installationId: string) {
  const token = await getGitHubInstallationToken(installationId);
  const repositories: GitHubRepo[] = [];
  let page = 1;

  while (page <= 10) {
    const data = await githubJson<{
      total_count?: number;
      repositories?: GitHubRepo[];
    }>(`/installation/repositories?per_page=100&page=${page}`, {}, token);

    const batch = data.repositories ?? [];
    repositories.push(...batch);

    if (
      batch.length === 0 ||
      repositories.length >= (data.total_count ?? repositories.length)
    ) {
      break;
    }

    page += 1;
  }

  return repositories;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Sync repositories for one integration into github_repositories.
 * Upserts by (user_id, full_name). Never deletes manual repos.
 */
export async function syncReposForIntegration(
  supabase: SupabaseServerClient,
  userId: string,
  integration: { id: string; installation_id: string | null },
) {
  if (!integration.installation_id) {
    return { synced: 0 };
  }

  const repos = await syncInstallationRepositories(integration.installation_id);
  const now = new Date().toISOString();

  const rows = repos.map((repo) => ({
    user_id: userId,
    integration_id: integration.id,
    github_repo_id: String(repo.id),
    installation_id: integration.installation_id,
    owner: repo.owner?.login ?? repo.full_name.split("/")[0] ?? "unknown",
    name: repo.name,
    full_name: repo.full_name,
    private: repo.private,
    selected: true,
    synced_from_github: true,
    has_issues: repo.has_issues,
    archived: repo.archived,
    updated_at: now,
  }));

  if (rows.length > 0) {
    const { error } = await supabase
      .from("github_repositories")
      .upsert(rows, { onConflict: "user_id,full_name" });

    if (error) {
      throw new Error(`Failed to save synced repositories: ${error.message}`);
    }
  }

  return { synced: rows.length };
}
