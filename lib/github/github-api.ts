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
