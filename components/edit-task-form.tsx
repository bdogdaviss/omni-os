"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type EditTaskFormProps = {
  task: {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    priority: string | null;
    estimated_effort: string | null;
    acceptance_criteria: string[] | null;
    dependencies: string[] | null;
    owner?: string | null;
    due_date?: string | null;
  };
  onCancel?: () => void;
};

type UpdateTaskResponse = {
  success: boolean;
  error?: string;
  details?: string;
};

const CATEGORY_OPTIONS = [
  "planning",
  "design",
  "frontend",
  "backend",
  "database",
  "ai",
  "auth",
  "integrations",
  "testing",
  "launch",
] as const;

const PRIORITY_OPTIONS = ["low", "medium", "high"] as const;

const EFFORT_OPTIONS = ["small", "medium", "large"] as const;

const inputClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm";

const textareaClass =
  "min-h-20 w-full resize-y rounded-md border border-input bg-background p-3 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm";

const selectClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm";

function normalizeOption<T extends string>(
  value: string | null | undefined,
  options: readonly T[],
  fallback: T,
): T {
  const candidate = (value ?? "").toLowerCase();

  return (options as readonly string[]).includes(candidate)
    ? (candidate as T)
    : fallback;
}

function toLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getFailureMessage(result: UpdateTaskResponse) {
  if (result.details) {
    return `${result.error ?? "Failed to update task"}: ${result.details}`;
  }

  return result.error ?? "Failed to update task";
}

export function EditTaskForm({ task, onCancel }: EditTaskFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [category, setCategory] = useState<string>(
    normalizeOption(task.category, CATEGORY_OPTIONS, "planning"),
  );
  const [priority, setPriority] = useState<string>(
    normalizeOption(task.priority, PRIORITY_OPTIONS, "medium"),
  );
  const [estimatedEffort, setEstimatedEffort] = useState<string>(
    normalizeOption(task.estimated_effort, EFFORT_OPTIONS, "medium"),
  );
  const [acceptanceCriteria, setAcceptanceCriteria] = useState(
    (task.acceptance_criteria ?? []).join("\n"),
  );
  const [dependencies, setDependencies] = useState(
    (task.dependencies ?? []).join("\n"),
  );
  const [owner, setOwner] = useState(task.owner ?? "");
  const [dueDate, setDueDate] = useState(
    (task.due_date ?? "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveTask() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/tasks/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskId: task.id,
          title: title.trim(),
          description,
          category,
          priority,
          estimatedEffort,
          acceptanceCriteria: toLines(acceptanceCriteria),
          dependencies: toLines(dependencies),
          owner: owner.trim() ? owner.trim() : null,
          dueDate: dueDate.trim() ? dueDate.trim() : null,
        }),
      });
      const result = (await response.json()) as UpdateTaskResponse;

      if (!response.ok || !result.success) {
        throw new Error(getFailureMessage(result));
      }

      router.refresh();
      onCancel?.();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to update task",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border bg-muted/20 p-4">
      <div className="flex flex-col gap-1.5">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor={`edit-title-${task.id}`}
        >
          Title
        </label>
        <input
          id={`edit-title-${task.id}`}
          className={inputClass}
          disabled={loading}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Task title"
          value={title}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor={`edit-description-${task.id}`}
        >
          Description
        </label>
        <textarea
          id={`edit-description-${task.id}`}
          className={textareaClass}
          disabled={loading}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What needs to be built and why"
          value={description}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor={`edit-category-${task.id}`}
          >
            Category
          </label>
          <select
            id={`edit-category-${task.id}`}
            className={selectClass}
            disabled={loading}
            onChange={(event) => setCategory(event.target.value)}
            value={category}
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor={`edit-priority-${task.id}`}
          >
            Priority
          </label>
          <select
            id={`edit-priority-${task.id}`}
            className={selectClass}
            disabled={loading}
            onChange={(event) => setPriority(event.target.value)}
            value={priority}
          >
            {PRIORITY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor={`edit-effort-${task.id}`}
          >
            Estimated effort
          </label>
          <select
            id={`edit-effort-${task.id}`}
            className={selectClass}
            disabled={loading}
            onChange={(event) => setEstimatedEffort(event.target.value)}
            value={estimatedEffort}
          >
            {EFFORT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor={`edit-owner-${task.id}`}
          >
            Owner
          </label>
          <input
            id={`edit-owner-${task.id}`}
            className={inputClass}
            disabled={loading}
            onChange={(event) => setOwner(event.target.value)}
            placeholder="Baron, Caden, Nic, or Unassigned"
            value={owner}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            className="text-xs font-medium text-muted-foreground"
            htmlFor={`edit-due-date-${task.id}`}
          >
            Due date
          </label>
          <input
            id={`edit-due-date-${task.id}`}
            className={inputClass}
            disabled={loading}
            onChange={(event) => setDueDate(event.target.value)}
            type="date"
            value={dueDate}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor={`edit-criteria-${task.id}`}
        >
          Acceptance criteria (one per line)
        </label>
        <textarea
          id={`edit-criteria-${task.id}`}
          className={textareaClass}
          disabled={loading}
          onChange={(event) => setAcceptanceCriteria(event.target.value)}
          placeholder={"User can log in\nDashboard loads without errors\nData saves to Supabase"}
          value={acceptanceCriteria}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor={`edit-dependencies-${task.id}`}
        >
          Dependencies (one per line)
        </label>
        <textarea
          id={`edit-dependencies-${task.id}`}
          className={textareaClass}
          disabled={loading}
          onChange={(event) => setDependencies(event.target.value)}
          placeholder={"Set up auth first\nDatabase schema must exist\nProposal must be approved"}
          value={dependencies}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={loading || !title.trim()}
          onClick={saveTask}
          type="button"
        >
          {loading ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : null}
          {loading ? "Saving..." : "Save Changes"}
        </Button>
        {onCancel ? (
          <Button
            disabled={loading}
            onClick={onCancel}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
        ) : null}
      </div>
      {error ? <p className="break-words text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
