"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

type SyncResponse = {
  success: boolean;
  error?: string;
  details?: string;
  repositories?: unknown[];
};

export function SyncGitHubReposButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncedCount, setSyncedCount] = useState<number | null>(null);

  async function syncRepos() {
    setLoading(true);
    setError(null);
    setSyncedCount(null);

    try {
      const response = await fetch("/api/github/repositories/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const result = (await response.json()) as SyncResponse;

      if (!response.ok || !result.success) {
        throw new Error(
          result.details
            ? `${result.error ?? "Failed to sync repositories"}: ${result.details}`
            : result.error ?? "Failed to sync repositories",
        );
      }

      setSyncedCount(result.repositories?.length ?? 0);
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to sync repositories",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={loading}
        onClick={syncRepos}
        type="button"
        variant="outline"
      >
        {loading ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw aria-hidden="true" />
        )}
        {loading ? "Syncing..." : "Sync Repositories"}
      </Button>
      {syncedCount !== null ? (
        <p className="text-xs text-muted-foreground">
          Synced {syncedCount} repositories.
        </p>
      ) : null}
      {error ? (
        <p className="max-w-xs break-words text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
