import { NextResponse } from "next/server";
import { z } from "zod";

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

    const { data: updatedTask, error: updateError } = await supabase
      .from("build_tasks")
      .update({
        title: data.title,
        description: data.description.trim() ? data.description : null,
        category: data.category,
        priority: data.priority,
        estimated_effort: data.estimatedEffort,
        acceptance_criteria: data.acceptanceCriteria,
        dependencies: data.dependencies,
      })
      .eq("id", data.taskId)
      .eq("user_id", user.id)
      .select()
      .maybeSingle();

    if (updateError) {
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
