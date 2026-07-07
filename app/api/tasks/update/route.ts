import { NextResponse } from "next/server";
import { z } from "zod";

import {
  isDuplicateDatabaseError,
  normalizeText,
} from "@/lib/duplicates/normalize";
import { createClient } from "@/lib/supabase/server";

const updateTaskSchema = z.object({
  taskId: z.string().uuid("A valid task ID is required"),
  title: z.string().min(1, "Task title is required"),
  description: z.string().optional().default(""),
  category: z.enum(
    [
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
    ],
    {
      message:
        "Category must be one of planning, design, frontend, backend, database, ai, auth, integrations, testing, launch",
    },
  ),
  priority: z.enum(["low", "medium", "high"], {
    message: "Priority must be one of low, medium, high",
  }),
  estimatedEffort: z.enum(["small", "medium", "large"], {
    message: "Estimated effort must be one of small, medium, large",
  }),
  acceptanceCriteria: z.array(z.string()),
  dependencies: z.array(z.string()),
  owner: z.string().nullish(),
  dueDate: z
    .string()
    .nullish()
    .refine(
      (value) =>
        value === null ||
        value === undefined ||
        value === "" ||
        /^\d{4}-\d{2}-\d{2}$/.test(value),
      { message: "Due date must be a YYYY-MM-DD string or empty" },
    ),
});

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Task update API route is working",
  });
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Not authenticated. Please log in first.",
        },
        { status: 401 },
      );
    }

    const body: unknown = await req.json();
    const data = updateTaskSchema.parse(body);

    // Duplicate title check — no other task under the same proposal or
    // project may share the same normalized title.
    type TaskScope = {
      id: string;
      proposal_id: string | null;
      project_id?: string | null;
    };

    let currentTask: TaskScope | null = null;

    const fullLookup = await supabase
      .from("build_tasks")
      .select("id, proposal_id, project_id")
      .eq("id", data.taskId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (fullLookup.error) {
      // The project_id column may not exist yet; retry with base columns.
      const baseLookup = await supabase
        .from("build_tasks")
        .select("id, proposal_id")
        .eq("id", data.taskId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (baseLookup.error) {
        return NextResponse.json(
          {
            success: false,
            error: "Failed to load task",
            details: baseLookup.error.message,
          },
          { status: 500 },
        );
      }

      currentTask = (baseLookup.data as TaskScope | null) ?? null;
    } else {
      currentTask = (fullLookup.data as TaskScope | null) ?? null;
    }

    if (!currentTask) {
      return NextResponse.json(
        {
          success: false,
          error: "Task not found",
          details:
            "The task may not exist or may belong to another user.",
        },
        { status: 404 },
      );
    }

    const normalizedTitle = normalizeText(data.title);
    const siblings: { id: string; title: string | null }[] = [];
    const siblingIds = new Set<string>();

    if (currentTask.proposal_id) {
      const { data: proposalSiblings } = await supabase
        .from("build_tasks")
        .select("id, title")
        .eq("user_id", user.id)
        .eq("proposal_id", currentTask.proposal_id)
        .neq("id", data.taskId);

      for (const sibling of proposalSiblings ?? []) {
        if (!siblingIds.has(sibling.id)) {
          siblingIds.add(sibling.id);
          siblings.push(sibling);
        }
      }
    }

    if (currentTask.project_id) {
      const { data: projectSiblings } = await supabase
        .from("build_tasks")
        .select("id, title")
        .eq("user_id", user.id)
        .eq("project_id", currentTask.project_id)
        .neq("id", data.taskId);

      for (const sibling of projectSiblings ?? []) {
        if (!siblingIds.has(sibling.id)) {
          siblingIds.add(sibling.id);
          siblings.push(sibling);
        }
      }
    }

    const duplicateTitle = siblings.find(
      (sibling) => normalizeText(sibling.title) === normalizedTitle,
    );

    if (duplicateTitle) {
      return NextResponse.json(
        {
          success: false,
          error: "Duplicate task title",
          details:
            "A task with this title already exists in this project or proposal.",
        },
        { status: 409 },
      );
    }

    // Fields common to all environments.
    const baseFields = {
      title: data.title,
      description: data.description.trim() ? data.description : null,
      category: data.category,
      priority: data.priority,
      estimated_effort: data.estimatedEffort,
      acceptance_criteria: data.acceptanceCriteria,
      dependencies: data.dependencies,
    };

    const owner = data.owner?.trim() ? data.owner.trim() : null;
    const dueDate = data.dueDate?.trim() ? data.dueDate.trim() : null;

    // Owner / due_date / updated_at require the Phase 4 columns.
    const fullFields = {
      ...baseFields,
      owner,
      due_date: dueDate,
      updated_at: new Date().toISOString(),
    };

    let { data: updatedTask, error: updateError } = await supabase
      .from("build_tasks")
      .update(fullFields)
      .eq("id", data.taskId)
      .eq("user_id", user.id)
      .select()
      .maybeSingle();

    // Fallback if the new owner / due_date / updated_at columns are missing.
    if (
      updateError &&
      (updateError.message.toLowerCase().includes("owner") ||
        updateError.message.toLowerCase().includes("due_date") ||
        updateError.message.toLowerCase().includes("updated_at") ||
        updateError.message.toLowerCase().includes("schema cache") ||
        updateError.message.toLowerCase().includes("column"))
    ) {
      const retry = await supabase
        .from("build_tasks")
        .update(baseFields)
        .eq("id", data.taskId)
        .eq("user_id", user.id)
        .select()
        .maybeSingle();

      updatedTask = retry.data;
      updateError = retry.error;
    }

    if (updateError) {
      if (isDuplicateDatabaseError(updateError)) {
        return NextResponse.json(
          {
            success: false,
            error: "Duplicate task title",
            details:
              "A task with this title already exists in this project or proposal.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: "Failed to update task",
          details: updateError.message,
        },
        { status: 500 },
      );
    }

    if (!updatedTask) {
      return NextResponse.json(
        {
          success: false,
          error: "No task was updated",
          details:
            "The task may not exist, may already be unavailable, or may belong to another user.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      task: updatedTask,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid task update request",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to update task",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
