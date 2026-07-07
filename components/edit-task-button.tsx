"use client";

import { useState } from "react";
import { Pencil, X } from "lucide-react";

import { EditTaskForm } from "@/components/edit-task-form";
import { Button } from "@/components/ui/button";

type EditTaskButtonProps = {
  task: {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    priority: string | null;
    estimated_effort: string | null;
    acceptance_criteria: string[] | null;
    dependencies: string[] | null;
  };
};

export function EditTaskButton({ task }: EditTaskButtonProps) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <Button
        onClick={() => setEditing((current) => !current)}
        size="sm"
        type="button"
        variant="outline"
      >
        {editing ? (
          <X aria-hidden="true" />
        ) : (
          <Pencil aria-hidden="true" />
        )}
        {editing ? "Close Editor" : "Edit Task"}
      </Button>
      {editing ? (
        <EditTaskForm onCancel={() => setEditing(false)} task={task} />
      ) : null}
    </div>
  );
}
