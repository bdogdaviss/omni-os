"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type LaunchChecklistItemStatusSelectProps = {
  itemId: string;
  currentStatus: string;
};

type UpdateStatusResponse = {
  success: boolean;
  error?: string;
  details?: string;
};

const STATUS_OPTIONS = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "verified", label: "Verified" },
  { value: "blocked", label: "Blocked" },
  { value: "not_applicable", label: "Not Applicable" },
] as const;

function getFailureMessage(result: UpdateStatusResponse) {
  if (result.details) {
    return `${result.error ?? "Failed to update status"}: ${result.details}`;
  }

  return result.error ?? "Failed to update status";
}

export function LaunchChecklistItemStatusSelect({
  itemId,
  currentStatus,
}: LaunchChecklistItemStatusSelectProps) {
  const router = useRouter();
  const [value, setValue] = useState(currentStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(nextStatus: string) {
    const previous = value;
    setValue(nextStatus);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/launch/checklist-items/update-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ itemId, status: nextStatus }),
      });
      const result = (await response.json()) as UpdateStatusResponse;

      if (!response.ok || !result.success) {
        throw new Error(getFailureMessage(result));
      }

      router.refresh();
    } catch (caughtError) {
      setValue(previous);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to update status",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label
        className="text-xs font-medium text-muted-foreground"
        htmlFor={`item-status-${itemId}`}
      >
        Update status
      </label>
      <div className="flex items-center gap-2">
        <select
          id={`item-status-${itemId}`}
          className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
          disabled={loading}
          onChange={(event) => updateStatus(event.target.value)}
          value={value}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {loading ? (
          <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Updating...
          </span>
        ) : null}
      </div>
      {error ? (
        <p className="break-words text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
