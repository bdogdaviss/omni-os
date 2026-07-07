"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type MarkProposalSentButtonProps = {
  proposalId: string;
};

type MarkSentResponse = {
  success: boolean;
  error?: string;
  details?: string;
};

function getFailureMessage(result: MarkSentResponse) {
  if (result.details) {
    return `${result.error ?? "Failed to mark proposal as sent"}: ${result.details}`;
  }

  return result.error ?? "Failed to mark proposal as sent";
}

export function MarkProposalSentButton({
  proposalId,
}: MarkProposalSentButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markAsSent() {
    const confirmed = window.confirm(
      "This will only mark the proposal as sent inside Omni OS. It will not email the client. Continue?",
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/proposals/mark-sent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ id: proposalId, sentMethod: "manual" }),
      });
      const result = (await response.json()) as MarkSentResponse;

      if (!response.ok || !result.success) {
        throw new Error(getFailureMessage(result));
      }

      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to mark proposal as sent",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        disabled={loading}
        onClick={markAsSent}
        type="button"
        variant="outline"
      >
        {loading ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <CheckCheck aria-hidden="true" />
        )}
        {loading ? "Marking..." : "Mark as Sent"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
