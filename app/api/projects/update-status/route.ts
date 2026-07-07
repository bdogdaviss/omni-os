import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const updateStatusSchema = z.object({
  projectId: z.string().uuid("A valid project ID is required"),
  status: z.enum(
    ["planning", "active", "blocked", "ready_for_launch", "launched", "archived"],
    {
      message:
        "Status must be one of planning, active, blocked, ready_for_launch, launched, archived",
    },
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
    message: "Project status update API route is working",
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
    const { projectId, status } = updateStatusSchema.parse(body);

    const { data: updatedProject, error: updateError } = await supabase
      .from("projects")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", projectId)
      .eq("user_id", user.id)
      .select()
      .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to update project status",
          details: updateError.message,
        },
        { status: 500 },
      );
    }

    if (!updatedProject) {
      return NextResponse.json(
        {
          success: false,
          error: "No project was updated",
          details:
            "The project may not exist, may already be unavailable, or may belong to another user.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      project: updatedProject,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid project status request",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to update project status",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
