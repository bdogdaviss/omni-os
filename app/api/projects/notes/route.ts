import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const noteSchema = z.object({
  projectId: z.string().uuid("A valid project ID is required"),
  note: z.string().min(1, "Note text is required"),
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
    message: "Project notes API route is working",
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
    const { projectId, note } = noteSchema.parse(body);

    // Confirm the project exists and belongs to this user before inserting.
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (projectError) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to verify project",
          details: projectError.message,
        },
        { status: 500 },
      );
    }

    if (!project) {
      return NextResponse.json(
        {
          success: false,
          error: "Project not found",
          details: "The project may not exist or may belong to another user.",
        },
        { status: 404 },
      );
    }

    const { data: savedNote, error: insertError } = await supabase
      .from("project_notes")
      .insert({
        user_id: user.id,
        project_id: projectId,
        note,
      })
      .select()
      .single();

    if (insertError || !savedNote) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to save note",
          details: insertError?.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      note: savedNote,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid note request",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to save note",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
