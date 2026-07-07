import { NextResponse } from "next/server";
import { z } from "zod";

import { getGitHubInstallationToken } from "@/lib/github/app-auth";
import { githubFetch } from "@/lib/github/github-api";
import { toLabelList } from "@/lib/github/validation";
import { createClient } from "@/lib/supabase/server";

const validateSchema = z.object({
  issueDraftId: z.string().uuid("A valid issue draft ID is required"),
  repositoryId: z.string().uuid("A valid repository ID is required"),
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
    message: "GitHub issue validation route is working",
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
    const { issueDraftId, repositoryId } = validateSchema.parse(body);

    const { data: draft, error: draftError } = await supabase
      .from("github_issue_drafts")
      .select("id, title, body, labels, published_to_github, github_issue_url")
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

    const { data: repository, error: repoError } = await supabase
      .from("github_repositories")
      .select(
        "id, owner, name, full_name, private, selected, synced_from_github, installation_id, has_issues, archived",
      )
      .eq("id", repositoryId)
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

    if (draft.published_to_github || draft.github_issue_url) {
      return NextResponse.json(
        {
          success: false,
          error: "Duplicate publish blocked",
          details: "This GitHub issue draft has already been published.",
        },
        { status: 409 },
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

    if (repository.has_issues === false) {
      return NextResponse.json(
        {
          success: false,
          error: "Issues are disabled for this repository.",
        },
        { status: 400 },
      );
    }

    const warnings: string[] = [];
    const draftLabels = toLabelList(draft.labels);
    let missingLabels: string[] = [];
    let valid = true;

    if (repository.archived) {
      warnings.push("This repository is archived on the last sync record.");
    }

    // Live GitHub verification, only for synced repos with an installation.
    if (repository.synced_from_github && repository.installation_id) {
      try {
        const token = await getGitHubInstallationToken(
          repository.installation_id,
        );

        const repoRes = await githubFetch(
          `/repos/${repository.owner}/${repository.name}`,
          {},
          token,
        );

        if (!repoRes.ok) {
          valid = false;
          warnings.push(
            `GitHub could not verify access to ${repository.full_name} (status ${repoRes.status}).`,
          );
        } else {
          const liveRepo = (await repoRes.json()) as {
            archived?: boolean;
            has_issues?: boolean;
          };

          if (liveRepo.archived) {
            valid = false;
            warnings.push("Repository is archived on GitHub.");
          }

          if (liveRepo.has_issues === false) {
            valid = false;
            warnings.push("Issues are disabled for this repository on GitHub.");
          }

          // Compare draft labels against live repo labels. Read-only.
          if (draftLabels.length > 0) {
            const labelsRes = await githubFetch(
              `/repos/${repository.owner}/${repository.name}/labels?per_page=100`,
              {},
              token,
            );

            if (labelsRes.ok) {
              const repoLabels = (await labelsRes.json()) as {
                name?: string;
              }[];
              const repoLabelNames = new Set(
                repoLabels
                  .map((label) => label.name?.toLowerCase().trim())
                  .filter(Boolean),
              );

              missingLabels = draftLabels.filter(
                (label) => !repoLabelNames.has(label.toLowerCase()),
              );

              if (missingLabels.length > 0) {
                warnings.push(
                  "Some labels may not exist in the repository. The issue can be created without labels or GitHub may reject unknown labels.",
                );
              }
            } else {
              warnings.push(
                "Could not fetch repository labels. Labels were not verified.",
              );
            }
          }
        }
      } catch (liveError) {
        valid = false;
        warnings.push(
          `Live GitHub validation failed: ${getErrorMessage(liveError)}`,
        );
      }
    } else {
      warnings.push(
        "Manual repository — not verified against GitHub. Connect the GitHub App and sync to validate live. Publishing requires a synced repository.",
      );
    }

    return NextResponse.json({
      success: true,
      valid,
      repository: {
        id: repository.id,
        full_name: repository.full_name,
        private: repository.private,
        synced_from_github: repository.synced_from_github,
      },
      missingLabels,
      warnings,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid validation request",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to validate repository",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
