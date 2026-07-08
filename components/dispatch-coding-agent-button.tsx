"use client";

import { useState } from "react";
import { Bot, ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type DispatchCodingAgentButtonProps = {
  issueDraftId: string;
  repoFullName: string | null;
};

type DispatchResponse = {
  success: boolean;
  error?: string;
  details?: string;
  repository?: string;
  pullsUrl?: string;
  actionsUrl?: string;
  warnings?: string[];
};

function getFailureMessage(result: DispatchResponse) {
  if (result.details) {
    return `${result.error ?? "Failed to dispatch coding agent"}: ${result.details}`;
  }

  return result.error ?? "Failed to dispatch coding agent";
}

export function DispatchCodingAgentButton({
  issueDraftId,
  repoFullName,
}: DispatchCodingAgentButtonProps) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<DispatchResponse | null>(null);

  async function dispatchAgent() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/github/issues/dispatch-agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ issueDraftId }),
      });
      const result = (await response.json()) as DispatchResponse;

      if (!response.ok || !result.success) {
        throw new Error(getFailureMessage(result));
      }

      setConfirming(false);
      setDone(result);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to dispatch coding agent",
      );
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    const pullsUrl =
      done.pullsUrl ??
      (repoFullName ? `https://github.com/${repoFullName}/pulls` : null);

    return (
      <div className="flex flex-col gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-4 text-sm">
        <p className="font-medium text-emerald-900">Build requested</p>
        <p className="break-words leading-6 text-emerald-800">
          The coding agent is implementing this issue
          {done.repository ? ` in ${done.repository}` : ""} and will open a pull
          request. Review and merge it on GitHub — nothing changes the repo
          until you do.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          {pullsUrl ? (
            <a
              className="inline-flex items-center gap-1 break-all font-medium text-emerald-800 underline underline-offset-4"
              href={pullsUrl}
              rel="noreferrer"
              target="_blank"
            >
              View pull requests
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          ) : null}
          {done.actionsUrl ? (
            <a
              className="inline-flex items-center gap-1 break-all font-medium text-emerald-800 underline underline-offset-4"
              href={done.actionsUrl}
              rel="noreferrer"
              target="_blank"
            >
              Watch progress (Actions)
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          ) : null}
        </div>
        {done.warnings && done.warnings.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-xs text-emerald-700">
            {done.warnings.map((warning, index) => (
              <li key={`warn-${index}`} className="break-words">
                {warning}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {confirming ? (
        <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4 text-sm">
          <p className="break-words leading-6 text-muted-foreground">
            This tells the coding agent in{" "}
            <span className="font-medium text-foreground">
              {repoFullName ?? "the repository"}
            </span>{" "}
            to implement this issue and open a pull request. It does not change
            the repo — you review and merge the pull request yourself.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={loading}
              onClick={dispatchAgent}
              size="sm"
              type="button"
            >
              {loading ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Bot aria-hidden="true" />
              )}
              {loading ? "Requesting build…" : "Confirm build"}
            </Button>
            <Button
              disabled={loading}
              onClick={() => setConfirming(false)}
              size="sm"
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
            type="button"
            variant="outline"
          >
            <Bot aria-hidden="true" />
            Build with coding agent
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Runs the repo&apos;s coding agent (GitHub Actions) to write the code and
        open a pull request. Requires one-time repo setup.
      </p>
      {error ? (
        <p className="break-words text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
