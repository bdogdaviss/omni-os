import { NextResponse } from "next/server";
import { z } from "zod";

import { getGitHubInstallationToken } from "@/lib/github/app-auth";
import { githubFetch } from "@/lib/github/github-api";
import {
  GITHUB_CONFIRMATION_PHRASE,
  isRealPublishingEnabled,
  toLabelList,
} from "@/lib/github/validation";
import { createClient } from "@/lib/supabase/server";

// This is the ONLY route that can create a real GitHub issue.
// Hard gates, all enforced server side:
// 1. GITHUB_REAL_PUBLISHING_ENABLED must be exactly "true".
// 2. Authenticated user required.
// 3. reviewed must be true and confirmationText must match exactly.
// 4. Draft must not already be published (three separate checks).
// 5. Exactly one issue is created per successful request. No bulk publishing.

const createSchema = z.object({
  issueDraftId: z.string().uuid("A valid issue draft ID is required"),
  repositoryId: z.string().uuid("A valid repository ID is required"),
  reviewed: z.literal(true, {
    message: "You must confirm you reviewed the draft.",
  }),
  confirmationText: z.string(),
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
    message: "GitHub issue creation route is working",
    realPublishingEnabled: isRealPublishingEnabled(),
  });
}

export async function POST(req: Request) {
  try {
    // Gate 1: env flag first, before anything else.
    if (!isRealPublishingEnabled()) {
      return NextResponse.json(
        {
          success: false,
          error: "Real GitHub issue creation is disabled.",
          details: "Set GITHUB_REAL_PUBLISHING_ENABLED=true only when ready.",
        },
        { status: 403 },
      );
    }

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
    const data = createSchema.parse(body);

    // Gate 2: exact confirmation phrase.
    if (data.confirmationText !== GITHUB_CONFIRMATION_PHRASE) {
      return NextResponse.json(
        {
          success: false,
          error: "Confirmation text does not match.",
          details: `Type ${GITHUB_CONFIRMATION_PHRASE} exactly to confirm.`,
        },
        { status: 400 },
      );
    }

    const { data: draft, error: draftError } = await supabase
      .from("github_issue_drafts")
      .select(
        "id, task_id, client_id, project_id, title, body, labels, published_to_github, github_issue_url",
      )
      .eq("id", data.issueDraftId)
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

    const { data: repository, error: repoError } = await supabase
      .from("github_repositories")
      .select(
        "id, owner, name, full_name, selected, installation_id, has_issues",
      )
      .eq("id", data.repositoryId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (repoError || !repository) {
      return NextResponse.json(
        {
          success: false,
          error: "Repository not found",
          details: repoError?.message,
        },
        { status: 404 },
      );
    }

    if (!repository.selected) {
      return NextResponse.json(
        {
          success: false,
          error: "Repository is not selected for publishing.",
        },
        { status: 400 },
      );
    }

    // Gate 3: duplicate protection (three checks).
    if (draft.published_to_github) {
      return NextResponse.json(
        {
          success: false,
          error: "This draft has already been published to GitHub.",
        },
        { status: 400 },
      );
    }

    if (draft.github_issue_url) {
      return NextResponse.json(
        {
          success: false,
          error: "This draft already has a GitHub issue URL.",
        },
        { status: 400 },
      );
    }

    const { data: existingLink } = await supabase
      .from("github_issue_links")
      .select("id")
      .eq("user_id", user.id)
      .eq("issue_draft_id", draft.id)
      .eq("status", "created")
      .maybeSingle();

    if (existingLink) {
      return NextResponse.json(
        {
          success: false,
          error: "A GitHub issue link already exists for this draft.",
        },
        { status: 400 },
      );
    }

    if (!draft.title?.trim() || !draft.body?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "Draft must have a title and body before publishing.",
        },
        { status: 400 },
      );
    }

    if (!repository.installation_id) {
      return NextResponse.json(
        {
          success: false,
          error: "Repository has no GitHub App installation.",
          details:
            "Connect the GitHub App and sync repositories before publishing.",
        },
        { status: 400 },
      );
    }

    // Create exactly one real GitHub issue.
    const token = await getGitHubInstallationToken(repository.installation_id);
    const labels = toLabelList(draft.labels).slice(0, 6);

    const issuePayload: Record<string, unknown> = {
      title: draft.title,
      body: draft.body,
    };

    if (labels.length > 0) {
      issuePayload.labels = labels;
    }

    let createRes = await githubFetch(
      `/repos/${repository.owner}/${repository.name}/issues`,
      {
        method: "POST",
        body: JSON.stringify(issuePayload),
      },
      token,
    );

    let retriedWithoutLabels = false;

    if (!createRes.ok && labels.length > 0) {
      const failureText = await createRes.text().catch(() => "");
      const labelRelated =
        createRes.status === 422 || failureText.toLowerCase().includes("label");

      // Retry once without labels only if the failure looks label related.
      if (labelRelated) {
        retriedWithoutLabels = true;
        createRes = await githubFetch(
          `/repos/${repository.owner}/${repository.name}/issues`,
          {
            method: "POST",
            body: JSON.stringify({ title: draft.title, body: draft.body }),
          },
          token,
        );
      } else {
        // Record the failure and surface it.
        await supabase
          .from("github_issue_drafts")
          .update({
            publish_status: "failed",
            publish_error: `GitHub error (${createRes.status}): ${failureText.slice(0, 300)}`,
          })
          .eq("id", draft.id)
          .eq("user_id", user.id);

        return NextResponse.json(
          {
            success: false,
            error: "GitHub rejected the issue.",
            details: `Status ${createRes.status}: ${failureText.slice(0, 300)}`,
          },
          { status: 502 },
        );
      }
    }

    if (!createRes.ok) {
      const failureText = await createRes.text().catch(() => "");

      await supabase
        .from("github_issue_drafts")
        .update({
          publish_status: "failed",
          publish_error: `GitHub error (${createRes.status}): ${failureText.slice(0, 300)}`,
        })
        .eq("id", draft.id)
        .eq("user_id", user.id);

      return NextResponse.json(
        {
          success: false,
          error: "GitHub rejected the issue.",
          details: `Status ${createRes.status}: ${failureText.slice(0, 300)}`,
        },
        { status: 502 },
      );
    }

    const issue = (await createRes.json()) as {
      number?: number;
      html_url?: string;
    };
    const issueNumber = issue.number ?? null;
    const issueUrl = issue.html_url ?? null;
    const now = new Date().toISOString();
    const warnings: string[] = [];

    if (retriedWithoutLabels) {
      warnings.push(
        "GitHub rejected the labels, so the issue was created without labels.",
      );
    }

    // Phase 10E persistence — the issue exists on GitHub now, so record it
    // immediately and surface any save problems as warnings.
    const { error: draftUpdateError } = await supabase
      .from("github_issue_drafts")
      .update({
        published_to_github: true,
        published_at: now,
        publish_status: "published",
        publish_error: null,
        github_repo: repository.full_name,
        github_issue_number: issueNumber,
        github_issue_url: issueUrl,
        selected_repository_id: repository.id,
      })
      .eq("id", draft.id)
      .eq("user_id", user.id);

    if (draftUpdateError) {
      warnings.push(
        `Issue was created but the draft record failed to update: ${draftUpdateError.message}. Issue URL: ${issueUrl}`,
      );
    }

    const { error: linkError } = await supabase
      .from("github_issue_links")
      .insert({
        user_id: user.id,
        issue_draft_id: draft.id,
        task_id: draft.task_id,
        project_id: draft.project_id,
        client_id: draft.client_id,
        repository_id: repository.id,
        repository_full_name: repository.full_name,
        issue_number: issueNumber,
        issue_url: issueUrl,
        status: "created",
      });

    if (linkError) {
      warnings.push(`Issue link record failed to save: ${linkError.message}`);
    }

    const { error: activityError } = await supabase
      .from("activity_events")
      .insert({
        user_id: user.id,
        client_id: draft.client_id,
        project_id: draft.project_id,
        event_type: "github_issue_created",
        title: "GitHub issue created",
        description: `Created GitHub issue #${issueNumber ?? "?"} in ${repository.full_name}`,
        metadata: {
          issueDraftId: draft.id,
          taskId: draft.task_id,
          repositoryFullName: repository.full_name,
          issueNumber,
          issueUrl,
        },
      });

    if (activityError) {
      warnings.push(`Activity event failed to save: ${activityError.message}`);
    }

    return NextResponse.json({
      success: true,
      issue: {
        number: issueNumber,
        url: issueUrl,
        repository: repository.full_name,
      },
      warnings,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid issue creation request",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to create GitHub issue",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
