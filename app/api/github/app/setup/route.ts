import { NextResponse } from "next/server";

import { getGitHubInstallationInfo } from "@/lib/github/app-auth";
import { syncReposForIntegration } from "@/lib/github/github-api";
import { createClient } from "@/lib/supabase/server";

// GitHub App setup callback. Saves the installation and syncs repositories.
// Never creates issues.
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

  const url = new URL(req.url);
  const installationId = url.searchParams.get("installation_id")?.trim();
  const setupAction = url.searchParams.get("setup_action")?.trim() ?? null;

  if (!installationId) {
    return NextResponse.redirect(
      new URL("/settings/github?error=missing_installation_id", req.url),
    );
  }

  // Best-effort account info from GitHub (app JWT only, no issues touched).
  let accountLogin: string | null = null;
  let accountType: string | null = null;

  try {
    const info = await getGitHubInstallationInfo(installationId);
    accountLogin = info?.accountLogin ?? null;
    accountType = info?.accountType ?? null;
  } catch {
    // Ignore: account info is optional.
  }

  // Create or update the integration row for this installation.
  const { data: existing, error: existingError } = await supabase
    .from("github_integrations")
    .select("id")
    .eq("user_id", user.id)
    .eq("installation_id", installationId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.redirect(
      new URL("/settings/github?error=integration_lookup_failed", req.url),
    );
  }

  const now = new Date().toISOString();
  let integrationId: string | null = existing?.id ?? null;

  if (existing) {
    await supabase
      .from("github_integrations")
      .update({
        connected: true,
        account_login: accountLogin,
        account_type: accountType,
        notes: setupAction,
        updated_at: now,
      })
      .eq("id", existing.id)
      .eq("user_id", user.id);
  } else {
    const { data: created, error: insertError } = await supabase
      .from("github_integrations")
      .insert({
        user_id: user.id,
        integration_type: "github_app",
        installation_id: installationId,
        account_login: accountLogin,
        account_type: accountType,
        connected: true,
        notes: setupAction,
      })
      .select("id")
      .single();

    if (insertError || !created) {
      return NextResponse.redirect(
        new URL("/settings/github?error=integration_save_failed", req.url),
      );
    }

    integrationId = created.id as string;
  }

  // Try to sync repositories immediately; failure is non-fatal.
  let synced = true;

  try {
    if (integrationId) {
      await syncReposForIntegration(supabase, user.id, {
        id: integrationId,
        installation_id: installationId,
      });
    }
  } catch {
    synced = false;
  }

  return NextResponse.redirect(
    new URL(
      synced
        ? "/settings/github?connected=true"
        : "/settings/github?connected=true&synced=false",
      req.url,
    ),
  );
}
