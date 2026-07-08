"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type ProjectStatusSelectProps = {
  projectId: string;
  currentStatus: string;
};

type UpdateStatusResponse = {
  success: boolean;
  error?: string;
  details?: string;
};

const STATUS_OPTIONS = [
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "blocked", label: "Blocked" },
  { value: "ready_for_launch", label: "Ready for Launch" },
  { value: "launched", label: "Launched" },
  { value: "archived", label: "Archived" },
] as const;

function getFailureMessage(result: UpdateStatusResponse) {
  if (result.details) {
    return `${result.error ?? "Failed to update status"}: ${result.details}`;
  }

  return result.error ?? "Failed to update status";
}

export function ProjectStatusSelect({
  projectId,
  currentStatus,
}: ProjectStatusSelectProps) {
  const router = useRouter();
  const [value, setValue] = useState(currentStatus);
  const [loading, setLoading] = useState(false);

  async function updateStatus(nextStatus: string) {
    const previous = value;
    setValue(nextStatus);
    setLoading(true);

    try {
      const response = await fetch("/api/projects/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, status: nextStatus }),
      });
      const result = (await response.json()) as UpdateStatusResponse;

      if (!response.ok || !result.success) {
        throw new Error(getFailureMessage(result));
      }

      toast.success("Status updated");
      router.refresh();
    } catch (caughtError) {
      setValue(previous);
      toast.error(
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
        htmlFor={`project-status-${projectId}`}
      >
        Update status
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={`project-status-${projectId}`}
          className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
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
    </div>
  );
}
