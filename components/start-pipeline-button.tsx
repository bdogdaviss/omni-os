"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Rocket, XCircle } from "lucide-react";
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
import { estimateAgentBuild, formatUsd, formatUsdRange } from "@/lib/ai/cost";

type Repository = {
  id: string;
  fullName: string;
};

type ActiveRun = {
  id: string;
  status: string;
  position: number;
  total: number;
  updatedAt: string | null;
};

// Poor man's stall detection: the pipeline only moves when GitHub webhooks
// arrive, so "how long since anything happened" is the signal a human needs.
// A run showing hours of silence mid-task is stuck — cancel and restart.
function lastActivityLabel(updatedAt: string | null): string | null {
  if (!updatedAt) {
    return null;
  }

  const ageMs = Date.now() - new Date(updatedAt).getTime();

  if (Number.isNaN(ageMs) || ageMs < 0) {
    return null;
  }

  const minutes = Math.floor(ageMs / 60_000);

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

type StartPipelineButtonProps = {
  proposalId: string;
  approved: boolean;
  taskCount: number;
  repositories: Repository[];
  run: ActiveRun | null;
};

type ApiResponse = {
  success: boolean;
  error?: string;
};

export function StartPipelineButton({
  proposalId,
  approved,
  taskCount,
  repositories,
  run,
}: StartPipelineButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [repositoryId, setRepositoryId] = useState(repositories[0]?.id ?? "");
  const [agentProvider, setAgentProvider] = useState<"claude" | "openai">("claude");

  // An active run replaces the start button with its status + kill switch.
  if (run && (run.status === "running" || run.status === "blocked")) {
    const cancelRun = async () => {
      setLoading(true);
      const toastId = toast.loading("Canceling pipeline…");

      try {
        const response = await fetch("/api/pipeline/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runId: run.id }),
        });
        const result = (await response.json()) as ApiResponse;

        if (!response.ok || !result.success) {
          throw new Error(result.error ?? "Cancel failed");
        }

        toast.success("Pipeline canceled", { id: toastId });
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Cancel failed", {
          id: toastId,
        });
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {run.status === "blocked"
            ? `Build pipeline blocked at task ${run.position + 1} of ${run.total} — see the activity feed.`
            : `Build pipeline running: task ${run.position + 1} of ${run.total}.`}
          {lastActivityLabel(run.updatedAt) ? (
            <> · last activity {lastActivityLabel(run.updatedAt)}</>
          ) : null}
        </span>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={loading} size="sm" type="button" variant="outline">
              {loading ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <XCircle aria-hidden="true" />
              )}
              Cancel run
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel this pipeline run?</AlertDialogTitle>
              <AlertDialogDescription>
                No further tasks will be dispatched or merged. An agent already
                running on GitHub will still finish and leave its pull request
                open — nothing merges after a cancel.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep running</AlertDialogCancel>
              <AlertDialogAction onClick={cancelRun}>Cancel run</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  if (!approved || taskCount === 0) {
    return (
      <Button disabled type="button" variant="outline">
        <Rocket aria-hidden="true" />
        {approved ? "Generate build tasks first" : "Approve proposal first"}
      </Button>
    );
  }

  if (repositories.length === 0) {
    return (
      <Button disabled type="button" variant="outline">
        <Rocket aria-hidden="true" />
        Connect a GitHub repo first
      </Button>
    );
  }

  const claudeEstimate = estimateAgentBuild(taskCount, "claude");
  const openAiEstimate = estimateAgentBuild(taskCount, "openai");
  const estimate = agentProvider === "claude" ? claudeEstimate : openAiEstimate;

  const startPipeline = async () => {
    setLoading(true);
    const toastId = toast.loading("Starting the build pipeline…");

    try {
      const response = await fetch("/api/pipeline/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId, repositoryId, agentProvider }),
      });
      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Could not start the pipeline");
      }

      toast.success("Pipeline started — task 1 dispatched", { id: toastId });
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not start the pipeline",
        { id: toastId },
      );
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={loading} type="button">
          {loading ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Rocket aria-hidden="true" />
          )}
          {loading ? "Starting…" : "Start automated build"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Build all {taskCount} tasks automatically?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                This is the only approval. After it: every task becomes a real
                GitHub issue, a coding agent implements each one in dependency
                order, and each pull request merges into the{" "}
                <code>staging</code> branch as soon as the independent build
                check passes. Nothing touches your default branch.
              </p>
              <p>
                Selected route estimate:{" "}
                <span className="font-medium text-foreground">
                  {formatUsdRange(estimate.lowCents, estimate.highCents)}
                </span>{" "}
                for {taskCount} tasks, up to {formatUsd(estimate.ceilingCents)}{" "}
                if every task runs to its turn limit — a projection from a flat
                per-task figure, not a measurement.
              </p>
              <div className="grid gap-3">
                {([
                  { value: "claude" as const, name: "Claude Code", model: "Claude Sonnet 5", estimate: claudeEstimate },
                  { value: "openai" as const, name: "ChatGPT / OpenAI Codex", model: "GPT-5.6 Sol", estimate: openAiEstimate },
                ]).map((option) => (
                  <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-md border p-4 has-[:checked]:border-primary has-[:checked]:bg-muted/50">
                    <input className="mt-1 size-4" checked={agentProvider === option.value} name={`pipeline-provider-${proposalId}`} onChange={() => setAgentProvider(option.value)} type="radio" value={option.value} />
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">{option.name}</span>
                      <span className="block text-sm text-muted-foreground">{option.model} · estimated {formatUsdRange(option.estimate.lowCents, option.estimate.highCents)} for {taskCount} tasks</span>
                    </span>
                  </label>
                ))}
                <p className="text-xs text-muted-foreground">The selected provider is used for every task in this pipeline. GitHub Actions runner usage is separate.</p>
              </div>
              <label
                className="flex flex-col gap-1.5 text-sm font-medium text-foreground"
                htmlFor={`pipeline-repo-${proposalId}`}
              >
                Target repository
                <select
                  className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
                  id={`pipeline-repo-${proposalId}`}
                  onChange={(event) => setRepositoryId(event.target.value)}
                  value={repositoryId}
                >
                  {repositories.map((repo) => (
                    <option key={repo.id} value={repo.id}>
                      {repo.fullName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Not yet</AlertDialogCancel>
          <AlertDialogAction onClick={startPipeline}>
            Start with {agentProvider === "claude" ? "Claude" : "ChatGPT"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
