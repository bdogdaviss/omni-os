// Shared, timezone-safe helpers for task due-date logic.
//
// due_date is stored as a plain YYYY-MM-DD string. To avoid UTC shifting a
// bare date across time zones, we never parse due_date through `new Date()` for
// comparison. Instead we build a local "today" YYYY-MM-DD string and compare
// the date strings lexicographically (they sort chronologically).

export type DueDateState =
  | "completed"
  | "overdue"
  | "due_today"
  | "due_soon"
  | "scheduled"
  | "no_due_date";

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

/** Local YYYY-MM-DD for a given Date (defaults to now). */
export function toLocalDateString(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local YYYY-MM-DD offset by a number of days from today. */
export function localDateStringOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);

  return toLocalDateString(date);
}

/** Normalize a stored due_date value to a YYYY-MM-DD string or null. */
export function normalizeDueDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  // Handle full timestamps (e.g. "2026-07-10T00:00:00Z") by taking the date.
  const match = trimmed.match(/^\d{4}-\d{2}-\d{2}/);

  return match ? match[0] : null;
}

function isDone(status: string | null | undefined) {
  return (status ?? "").toLowerCase() === "done";
}

export function getDueDateState(
  dueDate: string | null | undefined,
  status: string | null | undefined,
): DueDateState {
  if (isDone(status)) {
    return "completed";
  }

  const due = normalizeDueDate(dueDate);

  if (!due) {
    return "no_due_date";
  }

  const today = toLocalDateString();
  const dueSoonCutoff = localDateStringOffset(3);

  if (due < today) {
    return "overdue";
  }

  if (due === today) {
    return "due_today";
  }

  if (due <= dueSoonCutoff) {
    return "due_soon";
  }

  return "scheduled";
}

export function isOverdue(
  dueDate: string | null | undefined,
  status: string | null | undefined,
) {
  return getDueDateState(dueDate, status) === "overdue";
}

export function isDueToday(
  dueDate: string | null | undefined,
  status: string | null | undefined,
) {
  return getDueDateState(dueDate, status) === "due_today";
}

export function isDueSoon(
  dueDate: string | null | undefined,
  status: string | null | undefined,
) {
  const state = getDueDateState(dueDate, status);

  return state === "due_today" || state === "due_soon";
}

/** Format a YYYY-MM-DD due date without timezone drift. */
export function formatDueDate(value: string | null | undefined) {
  const due = normalizeDueDate(value);

  if (!due) {
    return "No due date";
  }

  const [year, month, day] = due.split("-").map((part) => Number(part));

  if (!year || !month || !day) {
    return due;
  }

  // Construct with explicit local parts so the day never shifts.
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

/** Format a full timestamp (started_at / completed_at / updated_at). */
export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
