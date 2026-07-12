"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, SendHorizonal } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type SendToVideoButtonProps = {
  kitEventId: string;
  repositories: { id: string; label: string }[];
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
export function SendToVideoButton({ kitEventId, repositories }: SendToVideoButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [repositoryId, setRepositoryId] = useState(repositories[0]?.id ?? "");

  async function sendJob() {
    setLoading(true);
    const toastId = toast.loading("Sending the video request…");

    try {
      const response = await fetch("/api/marketing/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitEventId, repositoryId }),
      });
      const result = (await response.json()) as JobResponse;

      if (!response.ok || !result.success) {
        const message = result.error ?? "Failed to create the video job";
        throw new Error(result.details ? `${message}: ${result.details}` : message);
      }

      toast.success("Video job started — see Video jobs for status", { id: toastId });
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
    <div className="flex min-w-0 flex-wrap gap-2">
      <select aria-label="Repository to record" className="h-10 max-w-full rounded-md border bg-background px-3 text-sm sm:h-8" disabled={loading} onChange={(event) => setRepositoryId(event.target.value)} value={repositoryId}>
        {repositories.length === 0 ? <option value="">No connected repositories</option> : null}
        {repositories.map((repository) => <option key={repository.id} value={repository.id}>{repository.label}</option>)}
      </select>
      <Button
      className="h-10 sm:h-8"
      disabled={loading || !repositoryId}
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
      {loading ? "Starting…" : "Create video"}
      </Button>
    </div>
  );
}
