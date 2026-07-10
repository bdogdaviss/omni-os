// The status-transition rules for build_tasks, shared by every writer.
//
// Two things set a task's status: a human via /api/tasks/update-status, and
// GitHub via /api/github/webhook (issue closed → done). Both must agree on the
// timestamp side effects, so the rules live here once:
//   - entering in_progress stamps started_at, but only the first time
//   - entering done stamps completed_at
//   - leaving done clears completed_at

export type TaskStatus =
  | "draft"
  | "to_do"
  | "in_progress"
  | "blocked"
  | "done";

export function taskStatusUpdatePayload(
  status: TaskStatus,
  existingStartedAt: string | null | undefined,
  now = new Date().toISOString(),
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    status,
    updated_at: now,
    completed_at: status === "done" ? now : null,
  };

  if (status === "in_progress" && !existingStartedAt) {
    payload.started_at = now;
  }

  return payload;
}
