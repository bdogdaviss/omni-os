"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";

type FilterOption = {
  value: string;
  label: string;
};

type TaskFilterControlsProps = {
  owners: FilterOption[];
  projects: FilterOption[];
  clients: FilterOption[];
};

const STATUS_OPTIONS: FilterOption[] = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "to_do", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];

const PRIORITY_OPTIONS: FilterOption[] = [
  { value: "all", label: "All priorities" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const DUE_OPTIONS: FilterOption[] = [
  { value: "all", label: "All due states" },
  { value: "overdue", label: "Overdue" },
  { value: "due_today", label: "Due Today" },
  { value: "due_soon", label: "Due Soon" },
  { value: "no_due_date", label: "No Due Date" },
  { value: "completed", label: "Completed" },
];

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function FilterSelect({
  label,
  paramKey,
  value,
  options,
  onChange,
}: {
  label: string;
  paramKey: string;
  value: string;
  options: FilterOption[];
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        className="text-xs font-medium text-muted-foreground"
        htmlFor={`task-filter-${paramKey}`}
      >
        {label}
      </label>
      <select
        id={`task-filter-${paramKey}`}
        className={selectClass}
        onChange={(event) => onChange(paramKey, event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TaskFilterControls({
  owners,
  projects,
  clients,
}: TaskFilterControlsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const current = (key: string) => searchParams.get(key) ?? "all";
  const hasActiveFilters = [
    "status",
    "priority",
    "owner",
    "due",
    "project",
    "client",
  ].some((key) => {
    const value = searchParams.get(key);

    return value && value !== "all";
  });

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (!value || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }

    const query = params.toString();
    router.push(query ? `/tasks?${query}` : "/tasks");
  }

  function clearFilters() {
    router.push("/tasks");
  }

  const ownerOptions: FilterOption[] = [
    { value: "all", label: "All owners" },
    { value: "unassigned", label: "Unassigned" },
    ...owners,
  ];
  const projectOptions: FilterOption[] = [
    { value: "all", label: "All projects" },
    ...projects,
  ];
  const clientOptions: FilterOption[] = [
    { value: "all", label: "All clients" },
    ...clients,
  ];

  return (
    <div className="space-y-3 rounded-lg border bg-background p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <FilterSelect
          label="Status"
          onChange={updateFilter}
          options={STATUS_OPTIONS}
          paramKey="status"
          value={current("status")}
        />
        <FilterSelect
          label="Priority"
          onChange={updateFilter}
          options={PRIORITY_OPTIONS}
          paramKey="priority"
          value={current("priority")}
        />
        <FilterSelect
          label="Owner"
          onChange={updateFilter}
          options={ownerOptions}
          paramKey="owner"
          value={current("owner")}
        />
        <FilterSelect
          label="Due date"
          onChange={updateFilter}
          options={DUE_OPTIONS}
          paramKey="due"
          value={current("due")}
        />
        <FilterSelect
          label="Project"
          onChange={updateFilter}
          options={projectOptions}
          paramKey="project"
          value={current("project")}
        />
        <FilterSelect
          label="Client"
          onChange={updateFilter}
          options={clientOptions}
          paramKey="client"
          value={current("client")}
        />
      </div>
      {hasActiveFilters ? (
        <div className="flex justify-end">
          <Button onClick={clearFilters} size="sm" type="button" variant="outline">
            Clear Filters
          </Button>
        </div>
      ) : null}
    </div>
  );
}
