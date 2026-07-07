"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";

const CONFIRMATION_PHRASE = "CREATE GITHUB ISSUE";

type CreateGitHubIssueButtonProps = {
  issueDraftId: string;
  repositoryId: string | null;
  validationPassed: boolean;
  realPublishingEnabled: boolean;
};

type CreateIssueResponse = {
  success: boolean;
  error?: string;
  details?: string;
  issue?: { number?: number; url?: string };
  warnings?: string[];
};

export function CreateGitHubIssueButton({
  issueDraftId,
  repositoryId,
  validationPassed,
  realPublishingEnabled,
}: CreateGitHubIssueButtonProps) {
  const router = useRouter();
  const [reviewed, setReviewed] = useState(false);
  const [confirmationText, setConfirmationText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const confirmationMatches = confirmationText === CONFIRMATION_PHRASE;
  const disabled =
    !repositoryId ||
    !validationPassed ||
    !realPublishingEnabled ||
    !reviewed ||
    !confirmationMatches ||
    loading ||
    Boolean(createdUrl);

  async function createIssue() {
    if (disabled || !repositoryId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/github/issues/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          issueDraftId,
          repositoryId,
          reviewed: true,
          confirmationText,
        }),
      });
      const result = (await response.json()) as CreateIssueResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.details
            ? `${result.error ?? "Failed to create GitHub issue"}: ${result.details}`
            : result.error ?? "Failed to create GitHub issue",
        );
      }

      setCreatedUrl(result.issue?.url ?? null);
      setWarnings(result.warnings ?? []);
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to create GitHub issue",
      );
    } finally {
      setLoading(false);
    }
  }

  if (createdUrl) {
    return (
      <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-medium text-emerald-800">
          GitHub issue created.
        </p>
        <a
          className="text-sm text-emerald-700 underline underline-offset-4"
          href={createdUrl}
          rel="noreferrer"
          target="_blank"
        >
          {createdUrl}
        </a>
        {warnings.map((warning, index) => (
          <p key={`warn-${index}`} className="text-xs text-amber-700">
            {warning}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-rose-200 bg-rose-50/40 p-4">
      <div className="flex items-start gap-2 text-sm text-rose-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          This will create a real GitHub issue in the selected repository. This
          cannot be undone from Omni OS.
        </p>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          checked={reviewed}
          className="mt-1"
          disabled={loading}
          onChange={(event) => setReviewed(event.target.checked)}
          type="checkbox"
        />
        I reviewed this issue draft and selected the correct GitHub repository.
      </label>

      <div className="flex flex-col gap-1">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor={`confirm-${issueDraftId}`}
        >
          Type {CONFIRMATION_PHRASE} to confirm.
        </label>
        <input
          id={`confirm-${issueDraftId}`}
          className="h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          disabled={loading}
          onChange={(event) => setConfirmationText(event.target.value)}
          placeholder={CONFIRMATION_PHRASE}
          value={confirmationText}
        />
      </div>

      <Button disabled={disabled} onClick={createIssue} type="button">
        {loading ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Rocket aria-hidden="true" />
        )}
        {loading ? "Creating Issue..." : "Create Real GitHub Issue"}
      </Button>

      {!realPublishingEnabled ? (
        <p className="text-xs text-muted-foreground">
          Real publishing is disabled. Set GITHUB_REAL_PUBLISHING_ENABLED=true
          on the server only when ready.
        </p>
      ) : null}
      {!validationPassed && realPublishingEnabled ? (
        <p className="text-xs text-muted-foreground">
          Validate the repository above before creating the issue.
        </p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
