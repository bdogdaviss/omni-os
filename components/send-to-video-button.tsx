"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, SendHorizonal } from "lucide-react";
import { toast } from "sonner";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { formatUsdRange, VIDEO_AGENT_ESTIMATE_CENTS } from "@/lib/ai/cost";

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
  const [videoProvider, setVideoProvider] = useState<"claude" | "openai">("openai");

  async function sendJob() {
    setLoading(true);
    const toastId = toast.loading("Sending the video request…");

    try {
      const response = await fetch("/api/marketing/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kitEventId, repositoryId, videoProvider }),
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
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button className="h-10 sm:h-8" disabled={loading || !repositoryId} size="sm" type="button" variant="outline">
            {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <SendHorizonal aria-hidden="true" />}
            {loading ? "Starting…" : "Create video"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Choose the video agent</AlertDialogTitle>
            <AlertDialogDescription>Estimated model cost only. The final cost depends on repository size, agent turns, and rendered length.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3">
            {([
              { value: "openai" as const, name: "ChatGPT / OpenAI Codex", model: "GPT-5.6 Sol", estimate: VIDEO_AGENT_ESTIMATE_CENTS.openai },
              { value: "claude" as const, name: "Claude Code", model: "Claude Sonnet 5", estimate: VIDEO_AGENT_ESTIMATE_CENTS.claude },
            ]).map((option) => (
              <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-md border p-4 has-[:checked]:border-primary has-[:checked]:bg-muted/50">
                <input className="mt-1 size-4" checked={videoProvider === option.value} name="video-provider" onChange={() => setVideoProvider(option.value)} type="radio" value={option.value} />
                <span className="min-w-0">
                  <span className="block font-medium">{option.name}</span>
                  <span className="block text-sm text-muted-foreground">{option.model} · estimated {formatUsdRange(option.estimate.low, option.estimate.high)}</span>
                </span>
              </label>
            ))}
            <p className="text-xs text-muted-foreground">GitHub Actions runner usage is separate. The selected provider is the only provider called; there is no automatic fallback.</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={sendJob}>Start with {videoProvider === "claude" ? "Claude" : "ChatGPT"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
