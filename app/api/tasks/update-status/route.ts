import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const updateStatusSchema = z.object({
  taskId: z.string().uuid("A valid task ID is required"),
  status: z.enum(["draft", "to_do", "in_progress", "blocked", "done"], {
    message: "Status must be one of draft, to_do, in_progress, blocked, done",
  }),
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
    message: "Task status update API route is working",
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
    const { taskId, status } = updateStatusSchema.parse(body);

    const now = new Date().toISOString();

    // Base status update. Timestamp columns are set only when they exist; if
    // the started_at / completed_at / updated_at columns are missing, we retry
    // with a minimal payload so status updates keep working before the SQL runs.
    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: now,
    };

    // Read the existing row to decide started_at behavior. Best-effort: if the
    // timestamp columns don't exist yet, this simply returns fewer fields.
    const { data: existing } = await supabase
      .from("build_tasks")
      .select("started_at")
      .eq("id", taskId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (status === "in_progress") {
      const startedAt = (existing as { started_at?: string | null } | null)
        ?.started_at;

      if (!startedAt) {
        updatePayload.started_at = now;
      }
    }

    if (status === "done") {
      updatePayload.completed_at = now;
    } else {
      // Moving out of done clears the completion timestamp.
      updatePayload.completed_at = null;
    }

    let { data: updatedTask, error: updateError } = await supabase
      .from("build_tasks")
      .update(updatePayload)
      .eq("id", taskId)
      .eq("user_id", user.id)
      .select()
      .maybeSingle();

    // Fallback if the new timestamp columns are not present yet.
    if (
      updateError &&
      (updateError.message.toLowerCase().includes("started_at") ||
        updateError.message.toLowerCase().includes("completed_at") ||
        updateError.message.toLowerCase().includes("updated_at") ||
        updateError.message.toLowerCase().includes("schema cache") ||
        updateError.message.toLowerCase().includes("column"))
    ) {
      const retry = await supabase
        .from("build_tasks")
        .update({ status })
        .eq("id", taskId)
        .eq("user_id", user.id)
        .select()
        .maybeSingle();

      updatedTask = retry.data;
      updateError = retry.error;
    }

    if (updateError) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to update task status",
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
          error: "Invalid task status request",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to update task status",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
