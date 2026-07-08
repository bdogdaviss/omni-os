"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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

  async function markAsSent() {
    setLoading(true);

    try {
      const response = await fetch("/api/proposals/mark-sent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: proposalId, sentMethod: "manual" }),
      });
      const result = (await response.json()) as MarkSentResponse;

      if (!response.ok || !result.success) {
        throw new Error(getFailureMessage(result));
      }

      toast.success("Proposal marked as sent");
      router.refresh();
    } catch (caughtError) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to mark proposal as sent",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={loading} type="button" variant="outline">
          {loading ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <CheckCheck aria-hidden="true" />
          )}
          {loading ? "Marking..." : "Mark as Sent"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark this proposal as sent?</AlertDialogTitle>
          <AlertDialogDescription>
            This only records the proposal as sent inside Omni OS. It does not
            email the client.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={markAsSent}>
            Mark as Sent
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
