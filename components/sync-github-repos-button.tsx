"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

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
  const [syncedCount, setSyncedCount] = useState<number | null>(null);

  async function syncRepos() {
    setLoading(true);
    setSyncedCount(null);
    const toastId = toast.loading("Syncing repositories…");

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
      toast.success("Repositories synced", { id: toastId });
      router.refresh();
    } catch (caughtError) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to sync repositories",
        { id: toastId },
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
    </div>
  );
}
