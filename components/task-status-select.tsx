"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

type TaskStatusSelectProps = {
  taskId: string;
  currentStatus: string;
};

type UpdateStatusResponse = {
  success: boolean;
  error?: string;
  details?: string;
};

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "to_do", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
] as const;

function getFailureMessage(result: UpdateStatusResponse) {
  if (result.details) {
    return `${result.error ?? "Failed to update status"}: ${result.details}`;
  }

  return result.error ?? "Failed to update status";
}

export function TaskStatusSelect({
  taskId,
  currentStatus,
}: TaskStatusSelectProps) {
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
      const response = await fetch("/api/tasks/update-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskId, status: nextStatus }),
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
        htmlFor={`task-status-${taskId}`}
      >
        Update status
      </label>
      <div className="flex items-center gap-2">
        <select
          id={`task-status-${taskId}`}
          className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
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
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Updating...
          </span>
        ) : null}
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
