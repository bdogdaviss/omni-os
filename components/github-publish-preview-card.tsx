"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { CreateGitHubIssueButton } from "@/components/create-github-issue-button";
import { Button } from "@/components/ui/button";

type RepositoryOption = {
  id: string;
  fullName: string;
  syncedFromGithub: boolean;
  hasInstallation: boolean;
};

type GitHubPublishPreviewCardProps = {
  issueDraftId: string;
  repositories: RepositoryOption[];
  realPublishingEnabled: boolean;
};

type ValidationResponse = {
  success: boolean;
  valid?: boolean;
  error?: string;
  details?: string;
  missingLabels?: string[];
  warnings?: string[];
};

export function GitHubPublishPreviewCard({
  issueDraftId,
  repositories,
  realPublishingEnabled,
}: GitHubPublishPreviewCardProps) {
  const [selectedRepositoryId, setSelectedRepositoryId] = useState("");
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResponse | null>(null);

  const selectedRepo =
    repositories.find((repo) => repo.id === selectedRepositoryId) ?? null;
  const validationPassed = Boolean(validation?.success && validation.valid);

  function selectRepository(repositoryId: string) {
    setSelectedRepositoryId(repositoryId);
    setValidation(null);
  }

  async function validateRepository() {
    if (!selectedRepositoryId) {
      toast.error("Select a repository first");
      return;
    }

    setValidating(true);
    setValidation(null);
    const toastId = toast.loading("Validating repository…");

    try {
      const response = await fetch("/api/github/issues/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          issueDraftId,
          repositoryId: selectedRepositoryId,
        }),
      });
      const result = (await response.json()) as ValidationResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.details
            ? `${result.error ?? "Validation failed"}: ${result.details}`
            : result.error ?? "Validation failed",
        );
      }

      setValidation(result);
      if (result.valid) {
        toast.success("Repository validation passed", { id: toastId });
      } else {
        toast.error("Repository validation did not pass", { id: toastId });
      }
    } catch (caughtError) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Validation failed",
        { id: toastId },
      );
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0 flex-1 break-words">
          Review only. GitHub issue creation requires explicit confirmation.
          Omni OS never publishes automatically.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor={`publish-repo-${issueDraftId}`}
        >
          GitHub repository
        </label>
        <select
          id={`publish-repo-${issueDraftId}`}
          className="h-9 w-full max-w-md rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
          onChange={(event) => selectRepository(event.target.value)}
          value={selectedRepositoryId}
        >
          <option value="">Select a repository…</option>
          {repositories.map((repo) => (
            <option key={repo.id} value={repo.id}>
              {repo.fullName}
              {repo.syncedFromGithub ? " (synced)" : " (manual)"}
            </option>
          ))}
        </select>
        {repositories.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No allowed repositories yet. Add or sync repositories in GitHub
            Settings first.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!selectedRepositoryId || validating}
          onClick={validateRepository}
          type="button"
          variant="outline"
        >
          {validating ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <CheckCircle2 aria-hidden="true" />
          )}
          {validating ? "Validating..." : "Validate Repository"}
        </Button>
        {selectedRepo && !selectedRepo.hasInstallation ? (
          <p className="min-w-0 break-words text-xs text-amber-700">
            Manual repository — connect the GitHub App to validate live and
            publish.
          </p>
        ) : null}
      </div>

      {validation ? (
        <div
          className={
            validationPassed
              ? "space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3"
              : "space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3"
          }
        >
          <p
            className={
              validationPassed
                ? "text-sm font-medium text-emerald-800"
                : "text-sm font-medium text-amber-800"
            }
          >
            {validationPassed
              ? "Repository validation passed."
              : "Repository validation did not pass."}
          </p>
          {(validation.missingLabels ?? []).length > 0 ? (
            <p className="break-words text-xs text-amber-800">
              Missing labels: {(validation.missingLabels ?? []).join(", ")}
            </p>
          ) : null}
          {(validation.warnings ?? []).map((warning, index) => (
            <p key={`vwarn-${index}`} className="break-words text-xs text-amber-800">
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      {!realPublishingEnabled ? (
        <p className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          Real publishing is disabled until later Phase 10 steps are complete.
        </p>
      ) : null}

      <CreateGitHubIssueButton
        issueDraftId={issueDraftId}
        realPublishingEnabled={realPublishingEnabled}
        repositoryId={selectedRepositoryId || null}
        validationPassed={validationPassed}
      />
    </div>
  );
}
