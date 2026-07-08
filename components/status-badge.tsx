import { cn } from "@/lib/utils";

// One place that maps every status / priority string in the app to a semantic
// tone. Replaces the per-component color switches (task-card, the status
// selects, etc.). Colors come from the --status-* tokens in globals.css via the
// .status-badge[data-tone] rules, so light/dark are handled centrally.
export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

const TONE_BY_VALUE: Record<string, StatusTone> = {
  // idle / not-started / low
  draft: "neutral",
  new: "neutral",
  todo: "neutral",
  to_do: "neutral",
  not_started: "neutral",
  not_applicable: "neutral",
  backlog: "neutral",
  paused: "neutral",
  idle: "neutral",
  low: "neutral",
  planning: "neutral",
  archived: "neutral",
  // in-flight
  in_progress: "info",
  active: "info",
  running: "info",
  dispatched: "info",
  review: "info",
  pending: "info",
  ready_for_launch: "info",
  // done / good
  done: "success",
  completed: "success",
  verified: "success",
  approved: "success",
  sent: "success",
  published: "success",
  live: "success",
  launched: "success",
  // needs attention
  blocked: "warning",
  on_hold: "warning",
  waiting: "warning",
  medium: "warning",
  // urgent / failed
  high: "danger",
  failed: "danger",
  error: "danger",
  rejected: "danger",
  cancelled: "danger",
};

function key(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function statusTone(value: string): StatusTone {
  return TONE_BY_VALUE[key(value)] ?? "neutral";
}

function titleCase(value: string) {
  return value
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function StatusBadge({
  status,
  tone,
  label,
  showDot = true,
  className,
}: {
  status: string;
  /** Override the auto-derived tone (e.g. for a taxonomy that isn't a status). */
  tone?: StatusTone;
  /** Override the auto-formatted label (default: Title Cased status). */
  label?: React.ReactNode;
  showDot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("status-badge", !showDot && "no-dot", className)}
      data-tone={tone ?? statusTone(status)}
    >
      {label ?? titleCase(status)}
    </span>
  );
}
