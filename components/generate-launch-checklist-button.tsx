"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Rocket } from "lucide-react";

import { Button } from "@/components/ui/button";

type GenerateLaunchChecklistButtonProps = {
  proposalId: string;
  approved: boolean;
};

type LaunchChecklistResponse = {
  success: boolean;
  error?: string;
  details?: string;
};

function getFailureMessage(result: LaunchChecklistResponse) {
  if (result.details) {
    return `${result.error ?? "Failed to generate launch checklist"}: ${result.details}`;
  }

  return result.error ?? "Failed to generate launch checklist";
}

export function GenerateLaunchChecklistButton({
  proposalId,
  approved,
}: GenerateLaunchChecklistButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!approved) {
    return (
      <Button disabled type="button" variant="outline">
        <Rocket aria-hidden="true" />
        Approve proposal first
      </Button>
    );
  }

  async function generateLaunchChecklist() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/agents/launch-checklist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ proposalId }),
      });
      const result = (await response.json()) as LaunchChecklistResponse;

      if (!response.ok || !result.success) {
        throw new Error(getFailureMessage(result));
      }

      setDone(true);
      router.push("/launch");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to generate launch checklist",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Button
        disabled={loading}
        onClick={generateLaunchChecklist}
        type="button"
        variant="outline"
      >
        {loading ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Rocket aria-hidden="true" />
        )}
        {loading ? "Generating Checklist..." : "Generate Launch Checklist"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Internal only. Nothing will be deployed.
      </p>
      {done ? (
        <Button asChild className="self-start px-0" size="sm" variant="link">
          <Link href="/launch">
            View Launch Checklists
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      ) : null}
      {error ? (
        <p className="break-words text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
