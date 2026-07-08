import { NextResponse } from "next/server";
import { z } from "zod";

import { getGitHubInstallationToken } from "@/lib/github/app-auth";
import { AGENT_BUILD_LABEL } from "@/lib/github/agent-workflow-template";
import {
  addIssueLabels,
  createIssueComment,
  ensureRepoLabel,
  removeIssueLabel,
} from "@/lib/github/github-api";
import { createClient } from "@/lib/supabase/server";

// Dispatch a published GitHub issue to the repository's coding agent.
//
// This route does NOT write any code. It adds the "agent:build" label to an
// already-published issue via the GitHub App. The repository's own GitHub
// Action (Claude Code) is what reads the issue, writes code, and opens a
// pull request. Nothing reaches the default branch without a human merging
// that PR — the same "AI drafts, human approves" gate as everywhere else.

const dispatchSchema = z.object({
  issueDraftId: z.string().uuid("A valid issue draft ID is required"),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "GitHub coding-agent dispatch route is working",
  });
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Not authenticated. Please log in first.",
        },
        { status: 401 },
      );
    }

    const body: unknown = await req.json();
    const { issueDraftId } = dispatchSchema.parse(body);

    const { data: draft, error: draftError } = await supabase
      .from("github_issue_drafts")
      .select(
        "id, title, published_to_github, github_repo, github_issue_number, github_issue_url, selected_repository_id, task_id, project_id, client_id",
      )
      .eq("id", issueDraftId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (draftError || !draft) {
      return NextResponse.json(
        {
          success: false,
          error: "Issue draft not found",
          details: draftError?.message,
        },
        { status: 404 },
      );
    }

    // Only dispatch issues that actually exist on GitHub.
    if (!draft.published_to_github || !draft.github_issue_number) {
      return NextResponse.json(
        {
          success: false,
          error: "Publish the issue to GitHub first.",
          details:
            "The coding agent works from a real GitHub issue. Publish this draft, then dispatch it.",
        },
        { status: 400 },
      );
    }

    // Resolve the repository (owner, name, installation) for this issue.
    type RepoRow = {
      owner: string | null;
      name: string | null;
      full_name: string | null;
      installation_id: string | null;
    };

    let repository: RepoRow | null = null;

    if (draft.selected_repository_id) {
      const { data } = await supabase
        .from("github_repositories")
        .select("owner, name, full_name, installation_id")
        .eq("id", draft.selected_repository_id)
        .eq("user_id", user.id)
        .maybeSingle();
      repository = (data as RepoRow | null) ?? null;
    }

    if (!repository && draft.github_repo) {
      const { data } = await supabase
        .from("github_repositories")
        .select("owner, name, full_name, installation_id")
        .eq("full_name", draft.github_repo)
        .eq("user_id", user.id)
        .maybeSingle();
      repository = (data as RepoRow | null) ?? null;
    }

    // Derive owner/name as a consistent pair from a single full_name source
    // (the repo row's full_name, else the draft's stored github_repo), so we
    // never combine an owner from one source with a name from another.
    const repoFullName =
      repository?.full_name ?? draft.github_repo ?? "unknown/repo";
    const [owner, name] = repoFullName.split("/");
    const installationId = repository?.installation_id ?? null;

    if (!owner || !name) {
      return NextResponse.json(
        {
          success: false,
          error: "Could not determine the repository for this issue.",
        },
        { status: 400 },
      );
    }

    if (!installationId) {
      return NextResponse.json(
        {
          success: false,
          error: "Repository has no GitHub App installation.",
          details:
            "Connect the GitHub App and sync repositories before dispatching.",
        },
        { status: 400 },
      );
    }

    const issueNumber = draft.github_issue_number;
    const token = await getGitHubInstallationToken(installationId);

    // Ensure the trigger label exists (create-if-missing). A 422 just means it
    // already exists. This removes the manual "gh label create" setup step.
    await ensureRepoLabel(
      token,
      owner,
      name,
      AGENT_BUILD_LABEL,
      "5319e7",
      "Omni OS: run the coding agent on this issue",
    ).catch(() => null);

    // Remove the label first if it is already on the issue. GitHub only fires
    // the "labeled" event on an absent -> present transition, so removing then
    // re-adding guarantees a re-dispatch actually re-triggers the workflow.
    await removeIssueLabel(
      token,
      owner,
      name,
      issueNumber,
      AGENT_BUILD_LABEL,
    ).catch(() => null);

    // Trigger the repo's coding-agent workflow by adding the build label.
    const labelRes = await addIssueLabels(token, owner, name, issueNumber, [
      AGENT_BUILD_LABEL,
    ]);

    if (!labelRes.ok) {
      const detail = await labelRes.text().catch(() => "");

      return NextResponse.json(
        {
          success: false,
          error: "GitHub rejected the dispatch.",
          details: `Status ${labelRes.status}: ${detail.slice(0, 300)}`,
        },
        { status: 502 },
      );
    }

    const warnings: string[] = [];
    const now = new Date().toISOString();

    // Best-effort audit comment on the issue.
    const commentRes = await createIssueComment(
      token,
      owner,
      name,
      issueNumber,
      "🤖 **Build requested from Omni OS.**\n\nThe coding agent will implement this issue and open a pull request for review. No changes reach the default branch until a human merges that PR.",
    ).catch(() => null);

    if (!commentRes || !commentRes.ok) {
      warnings.push("Could not post the audit comment on the issue.");
    }

    // Best-effort activity event. Ignore if the table is missing.
    const { error: activityError } = await supabase
      .from("activity_events")
      .insert({
        user_id: user.id,
        client_id: draft.client_id,
        project_id: draft.project_id,
        event_type: "github_agent_dispatched",
        title: "Coding agent build requested",
        description: `Requested a coding-agent build for issue #${issueNumber} in ${repoFullName}`,
        metadata: {
          issueDraftId: draft.id,
          taskId: draft.task_id,
          repositoryFullName: repoFullName,
          issueNumber,
          dispatchedAt: now,
        },
      });

    if (activityError) {
      warnings.push(`Activity event failed to save: ${activityError.message}`);
    }

    return NextResponse.json({
      success: true,
      repository: repoFullName,
      issueNumber,
      issueUrl: draft.github_issue_url,
      pullsUrl: `https://github.com/${owner}/${name}/pulls`,
      actionsUrl: `https://github.com/${owner}/${name}/actions`,
      warnings,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid dispatch request",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to dispatch coding agent",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
