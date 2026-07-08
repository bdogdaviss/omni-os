"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ListChecks, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
    const toastId = toast.loading("Generating build tasks…");

    try {
      const response = await fetch("/api/agents/build-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId }),
      });
      const result = (await response.json()) as BuildTasksResponse;

      if (!response.ok || !result.success) {
        throw new Error(getFailureMessage(result));
      }

      toast.success("Build tasks generated", { id: toastId });
      setDone(true);
      router.push("/tasks");
      router.refresh();
    } catch (caughtError) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to generate build tasks",
        { id: toastId },
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Button disabled={loading} onClick={generateBuildTasks} type="button">
        {loading ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <ListChecks aria-hidden="true" />
        )}
        {loading ? "Generating Tasks..." : "Generate Build Tasks"}
      </Button>
      {done ? (
        <Button asChild className="self-start" size="sm" variant="link">
          <Link href="/tasks">
            View build tasks
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
