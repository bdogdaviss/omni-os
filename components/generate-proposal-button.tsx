"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

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

  async function generateProposal() {
    setLoading(true);
    const toastId = toast.loading("Generating proposal…");

    try {
      const response = await fetch("/api/agents/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefId }),
      });
      const result = (await response.json()) as ProposalResponse;

      if (!response.ok || !result.success) {
        throw new Error(getFailureMessage(result));
      }

      toast.success("Proposal generated", { id: toastId });
      router.push("/proposals");
      router.refresh();
    } catch (caughtError) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to generate proposal",
        { id: toastId },
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
    </div>
  );
}
