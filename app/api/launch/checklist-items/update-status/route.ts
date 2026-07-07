import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const updateStatusSchema = z.object({
  itemId: z.string().uuid("A valid checklist item ID is required"),
  status: z.enum(
    ["not_started", "in_progress", "verified", "blocked", "not_applicable"],
    {
      message:
        "Status must be one of not_started, in_progress, verified, blocked, not_applicable",
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
    message: "Launch checklist item status update API route is working",
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
    const { itemId, status } = updateStatusSchema.parse(body);

    const { data: updatedItem, error: updateError } = await supabase
      .from("launch_checklist_items")
      .update({ status })
      .eq("id", itemId)
      .eq("user_id", user.id)
      .select()
      .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to update checklist item status",
          details: updateError.message,
        },
        { status: 500 },
      );
    }

    if (!updatedItem) {
      return NextResponse.json(
        {
          success: false,
          error: "No checklist item was updated",
          details:
            "The item may not exist, may already be unavailable, or may belong to another user.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      item: updatedItem,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid checklist item status request",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to update checklist item status",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
