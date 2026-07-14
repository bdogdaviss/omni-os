"use client";

import { useState, useTransition } from "react";
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
  project?: { id?: string | null };
  proposal?: { id?: string | null };
};

function getFailureMessage(result: ApiResponse) {
  if (result.details) {
    return `${result.error ?? "Request failed"}: ${result.details}`;
  }

  return result.error ?? "Request failed";
}

// Never throws: every chain branch must resolve its loading toast, so
// network failures and non-JSON error pages come back as a failed result.
async function postJson(path: string, body: Record<string, unknown>) {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response
      .json()
      .catch(() => ({ success: false, error: `Request failed (${response.status})` }))) as ApiResponse;

    return {
      ok: response.ok && result.success,
      // Every chained route duplicate-guards with a 409; "already done" is a
      // resume, not a failure.
      duplicate: response.status === 409,
      result,
    };
  } catch (caughtError) {
    return {
      ok: false,
      duplicate: false,
      result: {
        success: false,
        error:
          caughtError instanceof Error ? caughtError.message : "Network error",
      } as ApiResponse,
    };
  }
}

export function ApprovalButton({
  id,
  approvalType,
  label,
}: ApprovalButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  // isPending covers the navigation/refresh after the chain: the button must
  // stay disabled until fresh data unmounts it, or a fast second tap could
  // rewrite selected_tier after tasks were generated for the first tier.
  const [isPending, startTransition] = useTransition();
  const busy = loading || isPending;
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
      // Auto-advance: approval is the human gate; the next stage runs without
      // another click. Failures here never undo the approval — the manual
      // generate buttons remain as the resume path.
      // ponytail: the chain runs from the browser, so closing the page
      // mid-flight stops it (duplicate guards make re-running safe). Upgrade
      // path: chain server-side behind the approve routes or a queue.
      if (approvalType === "brief") {
        const chainToast = toast.loading("Approved — drafting the proposal…");
        const generated = await postJson("/api/agents/proposal", {
          briefId: id,
        });

        if (generated.ok) {
          // The drafted proposal is the next decision — go straight to it,
          // expanded and scrolled into view.
          const proposalId = generated.result.proposal?.id;

          toast.success("Proposal drafted — here it is", { id: chainToast });
          startTransition(() =>
            router.push(
              proposalId
                ? `/proposals?focus=${proposalId}#proposal-${proposalId}`
                : "/proposals",
            ),
          );
        } else if (generated.duplicate) {
          toast.info("A proposal already exists for this brief", {
            id: chainToast,
          });
        } else {
          toast.error(
            `Brief approved, but the proposal draft failed: ${getFailureMessage(generated.result)}`,
            { id: chainToast },
          );
        }
      } else {
        const chainToast = toast.loading("Approved — generating build tasks…");
        const tasks = await postJson("/api/agents/build-tasks", {
          proposalId: id,
        });

        if (!tasks.ok && !tasks.duplicate) {
          toast.error(
            `Proposal approved, but build tasks failed: ${getFailureMessage(tasks.result)}`,
            { id: chainToast },
          );
        } else {
          // Project comes AFTER tasks: its creation back-links every
          // build_task for this proposal to the new project.
          toast.loading("Creating the project…", { id: chainToast });
          const project = await postJson("/api/projects/create-from-proposal", {
            proposalId: id,
          });

          if (project.ok) {
            const projectId = project.result.project?.id;

            toast.success(
              tasks.duplicate
                ? "Project ready — build tasks already existed"
                : "Build tasks generated and project created",
              { id: chainToast },
            );

            // Land in the new project workspace, where the tasks and the
            // start-pipeline control live.
            if (projectId) {
              startTransition(() => router.push(`/projects/${projectId}`));
            }
          } else {
            toast.error(
              `Tasks are ready, but project creation failed: ${getFailureMessage(project.result)}`,
              { id: chainToast },
            );
          }
        }
      }

      startTransition(() => router.refresh());
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
            disabled={busy}
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
      <Button disabled={busy} onClick={approve} type="button">
        {busy ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Check aria-hidden="true" />
        )}
        {busy
          ? "Working…"
          : label ??
            (approvalType === "proposal"
              ? `Approve ${selectedTier === "lean_mvp" ? "Lean MVP" : selectedTier === "core_build" ? "Core Build" : "Full Launch"}`
              : defaultLabel)}
      </Button>
    </div>
  );
}
