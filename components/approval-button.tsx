"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type ApprovalButtonProps = {
  id: string;
  approvalType: "brief" | "proposal";
  label?: string;
};

type ProposalTier = "lean_mvp" | "core_build" | "full_launch";

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
  const [selectedTier, setSelectedTier] = useState<ProposalTier>("lean_mvp");
  const defaultLabel =
    approvalType === "brief" ? "Approve Brief" : "Approve Proposal";
  const endpoint =
    approvalType === "brief"
      ? "/api/briefs/approve"
      : "/api/proposals/approve";

  async function approve() {
    setLoading(true);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id,
          ...(approvalType === "proposal" ? { selectedTier } : {}),
        }),
      });
      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.success) {
        throw new Error(getFailureMessage(result));
      }

      toast.success("Approved");
      router.refresh();
    } catch (caughtError) {
      toast.error(
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
      {approvalType === "proposal" ? (
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Build tier
          <select
            className="h-11 rounded-md border border-input bg-background px-3 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:text-sm"
            disabled={loading}
            onChange={(event) =>
              setSelectedTier(event.target.value as ProposalTier)
            }
            value={selectedTier}
          >
            <option value="lean_mvp">Lean MVP</option>
            <option value="core_build">Core Build</option>
            <option value="full_launch">Full Launch</option>
          </select>
        </label>
      ) : null}
      <Button disabled={loading} onClick={approve} type="button">
        {loading ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Check aria-hidden="true" />
        )}
        {loading
          ? "Approving..."
          : label ??
            (approvalType === "proposal"
              ? `Approve ${selectedTier === "lean_mvp" ? "Lean MVP" : selectedTier === "core_build" ? "Core Build" : "Full Launch"}`
              : defaultLabel)}
      </Button>
    </div>
  );
}
