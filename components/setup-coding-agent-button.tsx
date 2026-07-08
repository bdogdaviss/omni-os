"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type SetupCodingAgentButtonProps = {
  repositoryId: string;
  repoFullName: string | null;
};

type SetupResponse = {
  success: boolean;
  error?: string;
  details?: string;
  permissionUrl?: string;
  repository?: string;
  workflow?: "created" | "exists" | "permission" | "failed";
  claudeMd?: string;
  labelReady?: boolean;
  secret?: "set" | "no_key" | "permission" | "failed";
  prPermission?: "enabled" | "permission" | "failed";
  fullyAutomated?: boolean;
  remainingManualSteps?: string[];
  settingsUrl?: string;
  warnings?: string[];
};

export function SetupCodingAgentButton({
  repositoryId,
  repoFullName,
}: SetupCodingAgentButtonProps) {
  const [loading, setLoading] = useState(false);
  const [permissionUrl, setPermissionUrl] = useState<string | null>(null);
  const [done, setDone] = useState<SetupResponse | null>(null);

  async function setup() {
    setLoading(true);
    setPermissionUrl(null);
    const toastId = toast.loading("Setting up coding agent…");

    try {
      const response = await fetch("/api/github/repositories/setup-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repositoryId }),
      });
      const result = (await response.json()) as SetupResponse;

      if (!response.ok || !result.success) {
        setPermissionUrl(result.permissionUrl ?? null);
        throw new Error(
          result.details
            ? `${result.error ?? "Setup failed"}: ${result.details}`
            : result.error ?? "Setup failed",
        );
      }

      setDone(result);
      toast.success("Coding agent set up", { id: toastId });
    } catch (caughtError) {
      toast.error(
        caughtError instanceof Error ? caughtError.message : "Setup failed",
        { id: toastId },
      );
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    const workflowLabel =
      done.workflow === "exists"
        ? "Workflow already present"
        : "Workflow added";
    const hasManualSteps =
      Boolean(done.remainingManualSteps?.length) && !done.fullyAutomated;

    return (
      <div className="flex w-full flex-col gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
        <p className="font-medium text-emerald-900">
          {done.fullyAutomated
            ? `Coding agent fully set up for ${done.repository ?? repoFullName}`
            : `Coding agent set up for ${done.repository ?? repoFullName}`}
        </p>
        <p className="text-emerald-800">
          {workflowLabel}
          {done.claudeMd === "created" ? " · CLAUDE.md added" : ""}
          {done.labelReady ? " · label ready" : ""}
          {done.secret === "set" ? " · API key set" : ""}
          {done.prPermission === "enabled" ? " · PR permission enabled" : ""}.
        </p>
        {done.fullyAutomated ? (
          <p className="text-emerald-800">
            Nothing left to do — publish an issue and click Build with coding
            agent.
          </p>
        ) : null}
        {hasManualSteps ? (
          <div className="text-emerald-800">
            <p className="font-medium">
              Remaining manual step{done.remainingManualSteps!.length > 1 ? "s" : ""}:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              {done.remainingManualSteps!.map((step, index) => (
                <li key={`step-${index}`} className="break-words">
                  {step}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {hasManualSteps && done.settingsUrl ? (
          <a
            className="inline-flex items-center gap-1 font-medium text-emerald-800 underline underline-offset-4"
            href={done.settingsUrl}
            rel="noreferrer"
            target="_blank"
          >
            Open repo Actions settings
            <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        ) : null}
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
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={loading}
        onClick={setup}
        size="sm"
        type="button"
        variant="outline"
      >
        {loading ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Wand2 aria-hidden="true" />
        )}
        {loading ? "Setting up…" : "Set up coding agent"}
      </Button>
      {permissionUrl ? (
        <a
          className="text-right text-xs font-medium text-destructive underline underline-offset-4"
          href={permissionUrl}
          rel="noreferrer"
          target="_blank"
        >
          Open GitHub App permissions
        </a>
      ) : null}
    </div>
  );
}
