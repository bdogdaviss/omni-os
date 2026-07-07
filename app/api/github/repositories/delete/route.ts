import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const deleteRepoSchema = z.object({
  repositoryId: z.string().uuid("A valid repository ID is required"),
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
    message: "GitHub repository delete API route is working",
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
    const { repositoryId } = deleteRepoSchema.parse(body);

    // Removes the repo from Omni OS only. Never touches GitHub.
    const { error: deleteError } = await supabase
      .from("github_repositories")
      .delete()
      .eq("id", repositoryId)
      .eq("user_id", user.id);

    if (deleteError) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to remove repository",
          details: deleteError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid repository delete request",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to remove repository",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
