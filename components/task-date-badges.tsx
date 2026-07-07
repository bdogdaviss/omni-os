import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDueDate, getDueDateState } from "@/lib/task-dates";

type TaskDateBadgesProps = {
  dueDate?: string | null;
  status?: string | null;
  showNoDueDate?: boolean;
};

export function TaskDateBadges({
  dueDate,
  status,
  showNoDueDate = false,
}: TaskDateBadgesProps) {
  const state = getDueDateState(dueDate, status);

  if (state === "no_due_date") {
    if (!showNoDueDate) {
      return null;
    }

    return (
      <Badge variant="outline" className="text-muted-foreground">
        No due date
      </Badge>
    );
  }

  if (state === "completed") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
        )}
      >
        Completed
      </Badge>
    );
  }

  if (state === "overdue") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-50",
        )}
      >
        Overdue · {formatDueDate(dueDate)}
      </Badge>
    );
  }

  if (state === "due_today") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-50",
        )}
      >
        Due Today
      </Badge>
    );
  }

  if (state === "due_soon") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50",
        )}
      >
        Due Soon · {formatDueDate(dueDate)}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-muted-foreground">
      Scheduled · {formatDueDate(dueDate)}
    </Badge>
  );
}
