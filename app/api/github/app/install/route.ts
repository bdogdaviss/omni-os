import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

// Redirects the user to the GitHub App installation page.
// No GitHub API calls happen here.
export async function GET(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.redirect(
      new URL("/settings/github?error=login_required", req.url),
    );
  }

  const slug = process.env.GITHUB_APP_SLUG?.trim();

  if (!slug) {
    return NextResponse.redirect(
      new URL("/settings/github?error=missing_app_slug", req.url),
    );
  }

  return NextResponse.redirect(
    `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`,
  );
}
