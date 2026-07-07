"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type DeleteRepoResponse = {
  success: boolean;
  error?: string;
  details?: string;
};

export function DeleteGitHubRepoButton({
  repositoryId,
}: {
  repositoryId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeRepo() {
    const confirmed = window.confirm(
      "Remove this repository from Omni OS? This does not delete anything from GitHub.",
    );

    if (!confirmed) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/github/repositories/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ repositoryId }),
      });
      const result = (await response.json()) as DeleteRepoResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.details
            ? `${result.error ?? "Failed to remove repository"}: ${result.details}`
            : result.error ?? "Failed to remove repository",
        );
      }

      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to remove repository",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={loading}
        onClick={removeRepo}
        size="sm"
        type="button"
        variant="outline"
      >
        {loading ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Trash2 aria-hidden="true" />
        )}
        {loading ? "Removing..." : "Remove"}
      </Button>
      {error ? (
        <p className="max-w-xs break-words text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
