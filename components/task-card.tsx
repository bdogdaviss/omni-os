import Link from "next/link";

import { EditTaskButton } from "@/components/edit-task-button";
import { GenerateIssueDraftButton } from "@/components/generate-issue-draft-button";
import { TaskDateBadges } from "@/components/task-date-badges";
import { StatusBadge } from "@/components/status-badge";
import { TaskStatusSelect } from "@/components/task-status-select";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime, formatDueDate, normalizeDueDate } from "@/lib/task-dates";

export type TaskCardTask = {
  id: string;
  title: string | null;
  description: string | null;
  category: string | null;
  priority: string | null;
  estimated_effort: string | null;
  acceptance_criteria: unknown;
  dependencies: unknown;
  status: string | null;
  owner?: string | null;
  due_date?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  updated_at?: string | null;
  created_at: string | null;
};

type TaskCardClient = {
  id: string;
  name: string | null;
  company: string | null;
} | null;

const STATUS_ORDER = [
  "draft",
  "to_do",
  "in_progress",
  "blocked",
  "done",
] as const;

type TaskStatus = (typeof STATUS_ORDER)[number];

function normalizeStatus(value: string | null | undefined): TaskStatus {
  const candidate = (value ?? "draft").toLowerCase();

  return (STATUS_ORDER as readonly string[]).includes(candidate)
    ? (candidate as TaskStatus)
    : "draft";
}

function formatStatusLabel(value: string | null | undefined) {
  switch (normalizeStatus(value)) {
    case "to_do":
      return "To Do";
    case "in_progress":
      return "In Progress";
    case "blocked":
      return "Blocked";
    case "done":
      return "Done";
    case "draft":
    default:
      return "Draft";
  }
}

function asText(value: string | null | undefined, fallback = "Not set") {
  return value?.trim() ? value : fallback;
}

function toTextList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === "string" ? item : JSON.stringify(item),
    );
  }

  if (typeof value === "string" && value.trim()) {
    return [value];
  }

  return [];
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 text-xs">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

export function TaskCard({
  task,
  client,
  showIssueDraftButton = true,
}: {
  task: TaskCardTask;
  client?: TaskCardClient;
  showIssueDraftButton?: boolean;
}) {
  const acceptanceCriteria = toTextList(task.acceptance_criteria);
  const dependencies = toTextList(task.dependencies);
  const startedAt = formatDateTime(task.started_at);
  const completedAt = formatDateTime(task.completed_at);
  const updatedAt = formatDateTime(task.updated_at);
  const dueDate = normalizeDueDate(task.due_date);

  return (
    <Card className="flex flex-col rounded-lg border-border/70 shadow-sm">
      <CardHeader className="gap-3 border-b">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="break-words text-lg">
              {asText(task.title, "Untitled task")}
            </CardTitle>
            {client ? (
              <CardDescription className="break-words">
                {client.id ? (
                  <Link
                    className="underline-offset-4 hover:underline"
                    href={`/clients/${client.id}`}
                  >
                    {asText(client.name, "Unassigned client")}
                  </Link>
                ) : (
                  asText(client.name, "Unassigned client")
                )}
                {client.company ? ` · ${client.company}` : ""}
              </CardDescription>
            ) : null}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <StatusBadge
              status={task.status ?? "draft"}
              label={formatStatusLabel(task.status)}
            />
            <TaskDateBadges dueDate={task.due_date} status={task.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="font-medium">
            {asText(task.category, "uncategorized")}
          </Badge>
          <StatusBadge
            status={asText(task.priority, "medium")}
            label={`${asText(task.priority, "medium")} priority`}
          />
          <Badge variant="outline">
            {asText(task.estimated_effort, "effort n/a")} effort
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-4 pt-5 text-sm">
        <p className="break-words leading-6 text-muted-foreground">
          {asText(task.description, "No description provided")}
        </p>

        <div className="space-y-1 rounded-md border bg-muted/20 p-3">
          <MetaRow label="Owner" value={asText(task.owner, "Unassigned")} />
          <MetaRow
            label="Due date"
            value={dueDate ? formatDueDate(dueDate) : "No due date"}
          />
          {startedAt ? <MetaRow label="Started" value={startedAt} /> : null}
          {completedAt ? <MetaRow label="Completed" value={completedAt} /> : null}
          {updatedAt ? <MetaRow label="Updated" value={updatedAt} /> : null}
        </div>

        {acceptanceCriteria.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              Acceptance criteria
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {acceptanceCriteria.map((item, index) => (
                <li key={`ac-${task.id}-${index}`} className="break-words leading-6">
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {dependencies.length > 0 ? (
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              Dependencies
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {dependencies.map((item, index) => (
                <li key={`dep-${task.id}-${index}`} className="break-words leading-6">
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-col items-stretch gap-3 border-t">
        <span className="text-xs text-muted-foreground">
          Created {formatDateTime(task.created_at) ?? "No date"}
        </span>
        <TaskStatusSelect
          currentStatus={normalizeStatus(task.status)}
          taskId={task.id}
        />
        <EditTaskButton
          task={{
            id: task.id,
            title: task.title ?? "",
            description: task.description,
            category: task.category,
            priority: task.priority,
            estimated_effort: task.estimated_effort,
            acceptance_criteria: acceptanceCriteria,
            dependencies: dependencies,
            owner: task.owner ?? null,
            due_date: task.due_date ?? null,
          }}
        />
        {showIssueDraftButton ? (
          <GenerateIssueDraftButton taskId={task.id} />
        ) : null}
      </CardFooter>
    </Card>
  );
}
