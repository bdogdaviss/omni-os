import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const markSentSchema = z.object({
  id: z.string().uuid("A valid proposal ID is required"),
  sentMethod: z.literal("manual"),
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
    message: "Proposal mark sent API route is working",
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
    const { id, sentMethod } = markSentSchema.parse(body);

    const { data: updatedProposal, error: updateError } = await supabase
      .from("proposals")
      .update({
        sent: true,
        sent_at: new Date().toISOString(),
        sent_method: sentMethod,
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to mark proposal as sent",
          details: updateError.message,
        },
        { status: 500 },
      );
    }

    if (!updatedProposal) {
      return NextResponse.json(
        {
          success: false,
          error: "No proposal was updated",
          details:
            "The proposal may not exist, may already be unavailable, or may belong to another user.",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      proposal: updatedProposal,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid mark sent request",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to mark proposal as sent",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
