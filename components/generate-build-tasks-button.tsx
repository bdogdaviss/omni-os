"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ListChecks, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type GenerateBuildTasksButtonProps = {
  proposalId: string;
  approved: boolean;
};

type BuildTasksResponse = {
  success: boolean;
  error?: string;
  details?: string;
};

function getFailureMessage(result: BuildTasksResponse) {
  if (result.details) {
    return `${result.error ?? "Failed to generate build tasks"}: ${result.details}`;
  }

  return result.error ?? "Failed to generate build tasks";
}

export function GenerateBuildTasksButton({
  proposalId,
  approved,
}: GenerateBuildTasksButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!approved) {
    return (
      <Button disabled type="button" variant="outline">
        <ListChecks aria-hidden="true" />
        Approve proposal first
      </Button>
    );
  }

  async function generateBuildTasks() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/agents/build-tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ proposalId }),
      });
      const result = (await response.json()) as BuildTasksResponse;

      if (!response.ok || !result.success) {
        throw new Error(getFailureMessage(result));
      }

      setDone(true);
      router.push("/tasks");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to generate build tasks",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button disabled={loading} onClick={generateBuildTasks} type="button">
        {loading ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <ListChecks aria-hidden="true" />
        )}
        {loading ? "Generating Tasks..." : "Generate Build Tasks"}
      </Button>
      {done ? (
        <Button asChild size="sm" variant="link">
          <Link href="/tasks">
            View build tasks
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      ) : null}
      {error ? (
        <p className="max-w-xs text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
