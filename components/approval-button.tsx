"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clipboard, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type ApprovalButtonProps = {
  id: string;
  approvalType: "brief" | "proposal";
  label?: string;
};

type ApiResponse = {
  success: boolean;
  error?: string;
  details?: string;
};

function getFailureMessage(result: ApiResponse) {
  if (result.details) {
    return `${result.error ?? "Request failed"}: ${result.details}`;
  }

  return result.error ?? "Request failed";
}

export function ApprovalButton({
  id,
  approvalType,
  label,
}: ApprovalButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defaultLabel =
    approvalType === "brief" ? "Approve Brief" : "Approve Proposal";
  const endpoint =
    approvalType === "brief"
      ? "/api/briefs/approve"
      : "/api/proposals/approve";

  async function approve() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id }),
      });
      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.success) {
        throw new Error(getFailureMessage(result));
      }

      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Approval failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button disabled={loading} onClick={approve} type="button">
        {loading ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Check aria-hidden="true" />
        )}
        {loading ? "Approving..." : label ?? defaultLabel}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function CopyTextButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyText() {
    setError(null);

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copy failed");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        disabled={!text.trim()}
        onClick={copyText}
        size="sm"
        type="button"
        variant="outline"
      >
        {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
        {copied ? "Copied Draft" : "Copy Follow Up Draft"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
