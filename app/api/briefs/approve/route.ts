import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const approvalSchema = z.object({
  id: z.string().uuid("A valid project brief ID is required"),
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
    message: "Brief approval API route is working",
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
    const { id } = approvalSchema.parse(body);

    const { data: updatedBrief, error: updateError } = await supabase
      .from("project_briefs")
      .update({ approved: true })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to approve project brief",
          details: updateError.message,
        },
        { status: 500 },
      );
    }

    if (!updatedBrief) {
      return NextResponse.json(
        {
          success: false,
          error: "No project brief was updated",
          details:
            "The brief may not exist, may already be unavailable, or may belong to another user.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      brief: updatedBrief,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid approval request",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to approve project brief",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
