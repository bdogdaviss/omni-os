import { NextResponse } from "next/server";

import { syncReposForIntegration } from "@/lib/github/github-api";
import { createClient } from "@/lib/supabase/server";

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "GitHub repository sync API route is working",
  });
}

export async function POST() {
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

    const { data: integrationData, error: integrationError } = await supabase
      .from("github_integrations")
      .select("id, installation_id, connected")
      .eq("user_id", user.id)
      .eq("connected", true);

    if (integrationError) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to load GitHub integrations",
          details: integrationError.message,
        },
        { status: 500 },
      );
    }

    const integrations = (integrationData ?? []) as {
      id: string;
      installation_id: string | null;
    }[];

    if (integrations.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No connected GitHub App installation found.",
          details:
            "Connect the GitHub App from GitHub Settings before syncing repositories.",
        },
        { status: 400 },
      );
    }

    // Sync each installation. Manual repos are never deleted.
    for (const integration of integrations) {
      await syncReposForIntegration(supabase, user.id, integration);
    }

    const { data: repositories, error: reposError } = await supabase
      .from("github_repositories")
      .select(
        "id, owner, name, full_name, private, selected, synced_from_github, has_issues, archived",
      )
      .eq("user_id", user.id)
      .eq("synced_from_github", true)
      .order("full_name", { ascending: true });

    if (reposError) {
      return NextResponse.json(
        {
          success: false,
          error: "Repositories synced but failed to reload them",
          details: reposError.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      repositories: repositories ?? [],
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        success: false,
        error: "Failed to sync repositories",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
