import { NextResponse } from "next/server";
import { z } from "zod";

import { getGitHubInstallationToken } from "@/lib/github/app-auth";
import {
  AGENT_BUILD_LABEL,
  AGENT_CLAUDE_MD_PATH,
  AGENT_CLAUDE_MD_STARTER,
  AGENT_PR_CHECK_PATH,
  AGENT_PR_CHECK_YAML,
  AGENT_WORKFLOW_PATH,
  AGENT_WORKFLOW_YAML,
} from "@/lib/github/agent-workflow-template";
import {
  ensureRepoLabel,
  getRepoActionsPublicKey,
  getRepoFileSha,
  putRepoActionsSecret,
  putRepoFile,
  setActionsCreatePrPermission,
} from "@/lib/github/github-api";
import { encryptRepoSecret } from "@/lib/github/secret-box";
import { createClient } from "@/lib/supabase/server";

// Push the coding-agent workflow (and a starter CLAUDE.md) into a client repo,
// so onboarding a new client repo needs no manual file copying.
//
// This writes files to the repo, which requires the GitHub App to have
// Contents: write AND Workflows: write (GitHub mandates the workflows scope for
// anything under .github/workflows/). Until those are granted, the workflow
// write returns 403 and this route reports exactly what to do.

const setupSchema = z.object({
  repositoryId: z.string().uuid("A valid repository ID is required"),
});

type FileOutcome = "created" | "exists" | "permission" | "failed";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function appPermissionsUrl() {
  const slug = process.env.GITHUB_APP_SLUG?.trim();

  return slug
    ? `https://github.com/settings/apps/${slug}/permissions`
    : "https://github.com/settings/apps";
}

// Create a file only if it does not already exist. Never overwrites, so an
// existing workflow or CLAUDE.md is left untouched.
async function createFileIfMissing(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
): Promise<{ outcome: FileOutcome; detail?: string }> {
  const { sha, response: getRes } = await getRepoFileSha(
    token,
    owner,
    repo,
    path,
  );

  if (sha) {
    return { outcome: "exists" };
  }

  // A 403 on the read is already a permissions signal.
  if (getRes.status === 403) {
    return { outcome: "permission" };
  }

  const putRes = await putRepoFile(token, owner, repo, path, content, message);

  if (putRes.ok) {
    return { outcome: "created" };
  }

  const detail = await putRes.text().catch(() => "");

  // A 403 is GitHub's signal for a missing App scope (Contents/Workflows).
  // Anything else is a genuine failure (archived repo, protected branch, etc.)
  // and must not be misreported as a permissions problem.
  if (putRes.status === 403) {
    return { outcome: "permission", detail };
  }

  return { outcome: "failed", detail: `Status ${putRes.status}: ${detail.slice(0, 200)}` };
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "GitHub coding-agent setup route is working",
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
    const { repositoryId } = setupSchema.parse(body);

    const { data: repo, error: repoError } = await supabase
      .from("github_repositories")
      .select("id, owner, name, full_name, installation_id")
      .eq("id", repositoryId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (repoError || !repo) {
      return NextResponse.json(
        {
          success: false,
          error: "Repository not found",
          details: repoError?.message,
        },
        { status: 404 },
      );
    }

    const owner = repo.owner ?? repo.full_name?.split("/")[0] ?? null;
    const name = repo.name ?? repo.full_name?.split("/")[1] ?? null;

    if (!owner || !name) {
      return NextResponse.json(
        { success: false, error: "Repository owner/name is incomplete." },
        { status: 400 },
      );
    }

    if (!repo.installation_id) {
      return NextResponse.json(
        {
          success: false,
          error: "This repository has no GitHub App installation.",
          details:
            "Connect the GitHub App and sync repositories before setting up the coding agent.",
        },
        { status: 400 },
      );
    }

    const token = await getGitHubInstallationToken(repo.installation_id);

    // Workflow file first — this is the write that needs Workflows: write.
    const workflow = await createFileIfMissing(
      token,
      owner,
      name,
      AGENT_WORKFLOW_PATH,
      AGENT_WORKFLOW_YAML,
      "Add Omni OS coding-agent workflow",
    );

    if (workflow.outcome === "permission") {
      return NextResponse.json(
        {
          success: false,
          error: "The GitHub App needs more permissions to write the workflow.",
          details: `Add "Contents: Read & write" and "Workflows: Read & write" to the app at ${appPermissionsUrl()}, then re-approve the installation. GitHub requires the Workflows permission for any file under .github/workflows/.`,
          permissionUrl: appPermissionsUrl(),
        },
        { status: 403 },
      );
    }

    if (workflow.outcome === "failed") {
      return NextResponse.json(
        {
          success: false,
          error: "Could not write the workflow file.",
          details:
            workflow.detail ??
            "GitHub rejected the write. Check that the repository is not archived and the default branch is writable.",
        },
        { status: 502 },
      );
    }

    // Independent PR-build check. Same Workflows: write scope as the agent
    // workflow, which just succeeded, so a failure here is not a permissions
    // problem — treat it as best-effort and warn.
    const prCheck = await createFileIfMissing(
      token,
      owner,
      name,
      AGENT_PR_CHECK_PATH,
      AGENT_PR_CHECK_YAML,
      "Add Omni OS PR build check",
    );

    // CLAUDE.md is a plain file (only needs Contents: write). Best-effort.
    const claudeMd = await createFileIfMissing(
      token,
      owner,
      name,
      AGENT_CLAUDE_MD_PATH,
      AGENT_CLAUDE_MD_STARTER,
      "Add Omni OS coding-agent guide (CLAUDE.md)",
    );

    // Ensure the trigger label exists (needs only Issues: write).
    const labelRes = await ensureRepoLabel(
      token,
      owner,
      name,
      AGENT_BUILD_LABEL,
      "5319e7",
      "Omni OS: run the coding agent on this issue",
    ).catch(() => null);
    const labelReady = Boolean(labelRes && (labelRes.ok || labelRes.status === 422));

    // Push the ANTHROPIC_API_KEY secret (needs Secrets: write). Best-effort.
    //
    // Prefer a DEDICATED key (GITHUB_AGENT_ANTHROPIC_KEY) meant for repo
    // distribution — ideally spend-limited — because this value ends up in each
    // repo's Actions secrets, where anyone who can edit a workflow could read
    // it. Fall back to the main ANTHROPIC_API_KEY, but warn that a leak there
    // has a wider blast radius.
    type SecretOutcome = "set" | "no_key" | "permission" | "failed";
    let secretOutcome: SecretOutcome = "failed";
    const dedicatedKey = process.env.GITHUB_AGENT_ANTHROPIC_KEY?.trim();
    const anthropicKey = dedicatedKey || process.env.ANTHROPIC_API_KEY?.trim();
    const usingSharedKey = !dedicatedKey && Boolean(anthropicKey);

    if (!anthropicKey) {
      secretOutcome = "no_key";
    } else {
      try {
        const pkRes = await getRepoActionsPublicKey(token, owner, name);

        if (pkRes.status === 403 || pkRes.status === 404) {
          secretOutcome = "permission";
        } else if (!pkRes.ok) {
          secretOutcome = "failed";
        } else {
          const pk = (await pkRes.json()) as {
            key?: string;
            key_id?: string;
          };

          if (!pk.key || !pk.key_id) {
            secretOutcome = "failed";
          } else {
            const encrypted = await encryptRepoSecret(pk.key, anthropicKey);
            const putSecretRes = await putRepoActionsSecret(
              token,
              owner,
              name,
              "ANTHROPIC_API_KEY",
              encrypted,
              pk.key_id,
            );

            secretOutcome = putSecretRes.ok
              ? "set"
              : putSecretRes.status === 403
                ? "permission"
                : "failed";
          }
        }
      } catch {
        secretOutcome = "failed";
      }
    }

    // Allow Actions to create/approve PRs (needs Administration: write).
    // Best-effort — without the permission this stays a one-time manual toggle.
    type PrOutcome = "enabled" | "permission" | "failed";
    let prOutcome: PrOutcome = "failed";
    const prRes = await setActionsCreatePrPermission(token, owner, name).catch(
      () => null,
    );

    if (prRes && prRes.ok) {
      prOutcome = "enabled";
    } else if (prRes && (prRes.status === 403 || prRes.status === 404)) {
      prOutcome = "permission";
    }

    // At this point the workflow is "created" or "exists" — earlier returns
    // handle "permission" and "failed".
    const warnings: string[] = [];

    if (claudeMd.outcome === "failed" || claudeMd.outcome === "permission") {
      warnings.push(
        "CLAUDE.md was not added (you can add one manually later). The workflow is what matters.",
      );
    }

    if (prCheck.outcome === "failed" || prCheck.outcome === "permission") {
      warnings.push(
        "The PR build check (omni-pr-check.yml) was not added, so pull requests in this repo have no independent CI signal. You can re-run setup or add it manually.",
      );
    }

    if (!labelReady) {
      warnings.push(
        "Could not pre-create the agent:build label; Omni OS will create it on first dispatch.",
      );
    }

    if (secretOutcome === "set" && usingSharedKey) {
      warnings.push(
        "The coding agent uses your main ANTHROPIC_API_KEY, now stored in this repo's Actions secrets. If you share this repo with a client or contractor, create a separate spend-limited Anthropic key and set GITHUB_AGENT_ANTHROPIC_KEY in Omni OS's environment — that key will be used instead, limiting exposure.",
      );
    }

    if (secretOutcome === "permission") {
      warnings.push(
        `Could not set the ANTHROPIC_API_KEY secret automatically. Add "Secrets: Read & write" to the app at ${appPermissionsUrl()} and re-approve, or set it manually.`,
      );
    } else if (secretOutcome === "no_key") {
      warnings.push(
        "Omni OS has no ANTHROPIC_API_KEY in its own environment, so it could not copy one to the repo. Set the repo secret manually.",
      );
    } else if (secretOutcome === "failed") {
      warnings.push(
        "Could not set the ANTHROPIC_API_KEY secret automatically. Set it manually.",
      );
    }

    if (prOutcome === "permission") {
      warnings.push(
        `Could not enable "Actions can create pull requests" automatically. Add "Administration: Read & write" to the app at ${appPermissionsUrl()} and re-approve, or enable it manually.`,
      );
    } else if (prOutcome === "failed") {
      warnings.push(
        'Could not enable "Actions can create pull requests" automatically. Enable it manually.',
      );
    }

    // Only list the steps that were NOT automated.
    const remainingManualSteps: string[] = [];

    if (secretOutcome !== "set") {
      remainingManualSteps.push(
        `Set the repo secret: gh secret set ANTHROPIC_API_KEY --repo ${repo.full_name}`,
      );
    }

    if (prOutcome !== "enabled") {
      remainingManualSteps.push(
        "Enable Settings > Actions > General > Workflow permissions > 'Allow GitHub Actions to create and approve pull requests'.",
      );
    }

    const fullyAutomated = remainingManualSteps.length === 0;

    return NextResponse.json({
      success: true,
      repository: repo.full_name,
      workflow: workflow.outcome,
      prCheck: prCheck.outcome,
      claudeMd: claudeMd.outcome,
      labelReady,
      secret: secretOutcome,
      prPermission: prOutcome,
      fullyAutomated,
      remainingManualSteps,
      settingsUrl: `https://github.com/${owner}/${name}/settings/actions`,
      warnings,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid setup request",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to set up coding agent",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
