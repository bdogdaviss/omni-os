"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileCode2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type GenerateIssueDraftButtonProps = {
  taskId: string;
};

type IssueDraftResponse = {
  success: boolean;
  error?: string;
  details?: string;
};

function getFailureMessage(result: IssueDraftResponse) {
  if (result.details) {
    return `${result.error ?? "Failed to generate issue draft"}: ${result.details}`;
  }

  return result.error ?? "Failed to generate issue draft";
}

export function GenerateIssueDraftButton({
  taskId,
}: GenerateIssueDraftButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function generateIssueDraft() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/agents/github-issue-draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskId }),
      });
      const result = (await response.json()) as IssueDraftResponse;

      if (!response.ok || !result.success) {
        throw new Error(getFailureMessage(result));
      }

      setDone(true);
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to generate issue draft",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        disabled={loading}
        onClick={generateIssueDraft}
        size="sm"
        type="button"
        variant="outline"
      >
        {loading ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <FileCode2 aria-hidden="true" />
        )}
        {loading ? "Generating Draft..." : "Generate Issue Draft"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Draft only. No GitHub issue will be created.
      </p>
      {done ? (
        <Button
          asChild
          className="justify-start px-0"
          size="sm"
          variant="link"
        >
          <Link href="/issue-drafts">
            View Issue Drafts
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      ) : null}
      {error ? <p className="break-words text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
