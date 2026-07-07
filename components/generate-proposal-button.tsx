"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type ProposalResponse = {
  success: boolean;
  error?: string;
  details?: string;
};

function getFailureMessage(result: ProposalResponse) {
  if (result.details) {
    return `${result.error ?? "Failed to generate proposal"}: ${result.details}`;
  }

  return result.error ?? "Failed to generate proposal";
}

export function GenerateProposalButton({ briefId }: { briefId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateProposal() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/agents/proposal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ briefId }),
      });
      const result = (await response.json()) as ProposalResponse;

      if (!response.ok || !result.success) {
        throw new Error(getFailureMessage(result));
      }

      router.push("/proposals");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to generate proposal",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 sm:items-end">
      <Button disabled={loading} onClick={generateProposal} type="button">
        {loading ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <FileText aria-hidden="true" />
        )}
        {loading ? "Generating..." : "Generate Proposal"}
      </Button>
      {error ? (
        <p className="max-w-xs break-words text-xs text-destructive sm:text-right">
          {error}
        </p>
      ) : null}
    </div>
  );
}
