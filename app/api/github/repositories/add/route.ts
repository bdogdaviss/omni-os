import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const addRepoSchema = z.object({
  owner: z.string().min(1, "Owner is required"),
  name: z.string().min(1, "Repository name is required"),
  private: z.boolean().optional().default(true),
  selected: z.boolean().optional().default(true),
  defaultForProjects: z.boolean().optional().default(false),
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
    message: "GitHub repository add API route is working",
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
    const data = addRepoSchema.parse(body);

    const owner = data.owner.trim();
    const name = data.name.trim();

    if (!owner || !name) {
      return NextResponse.json(
        {
          success: false,
          error: "Owner and repository name are required.",
        },
        { status: 400 },
      );
    }

    const fullName = `${owner}/${name}`;

    // Return the existing repo instead of creating a duplicate.
    const { data: existing, error: existingError } = await supabase
      .from("github_repositories")
      .select("*")
      .eq("user_id", user.id)
      .eq("full_name", fullName)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to check for existing repository",
          details: existingError.message,
        },
        { status: 500 },
      );
    }

    if (existing) {
      return NextResponse.json({
        success: true,
        repository: existing,
      });
    }

    if (data.defaultForProjects) {
      await supabase
        .from("github_repositories")
        .update({ default_for_projects: false })
        .eq("user_id", user.id);
    }

    const { data: repository, error: insertError } = await supabase
      .from("github_repositories")
      .insert({
        user_id: user.id,
        owner,
        name,
        full_name: fullName,
        private: data.private,
        selected: data.selected,
        default_for_projects: data.defaultForProjects,
        synced_from_github: false,
      })
      .select()
      .single();

    if (insertError || !repository) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to add repository",
          details: insertError?.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      repository,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid repository request",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to add repository",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
