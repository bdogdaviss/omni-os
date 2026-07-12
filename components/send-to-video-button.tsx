"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, SendHorizonal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type SendToVideoButtonProps = {
  kitEventId: string;
};

type JobResponse = {
  success: boolean;
  status?: string;
  error?: string;
  details?: string;
};

// Dev-test button: sends the kit's video prompt to the text model as a literal
// "make a video" request. The expected outcome is a text reply and a job card
// marked "No video" — the point is exercising the pipe, not getting a film.
export function SendToVideoButton({ kitEventId }: SendToVideoButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function sendJob() {
    setLoading(true);
    const toastId = toast.loading("Sending the video request…");

    try {
      const response = await fetch("/api/marketing/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitEventId }),
      });
      const result = (await response.json()) as JobResponse;

      if (!response.ok || !result.success) {
        const message = result.error ?? "Failed to create the video job";
        throw new Error(result.details ? `${message}: ${result.details}` : message);
      }

      // A saved job whose model call failed is still a failure to the person
      // reading the toast — green over "failed" is the lie this repo keeps
      // hunting down.
      if (result.status === "failed") {
        toast.error("Model call failed — details on the job card", {
          id: toastId,
        });
      } else {
        toast.success("Reply received — text, no video file (see Video jobs)", {
          id: toastId,
        });
      }
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create the video job",
        { id: toastId },
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      className="h-10 sm:h-8"
      disabled={loading}
      onClick={sendJob}
      size="sm"
      type="button"
      variant="outline"
    >
      {loading ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : (
        <SendHorizonal aria-hidden="true" />
      )}
      {/* Deliberately not "Send to Fable 5": the request goes to whatever
          model ANTHROPIC_MODEL/failover resolves to, and the job card names
          who actually answered. */}
      {loading ? "Sending…" : "Send video request (dev test)"}
    </Button>
  );
}
