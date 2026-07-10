// Service-role Supabase client for requests that arrive with no user session.
//
// The GitHub webhook is called by GitHub, not by a logged-in operator, so RLS
// has no auth.uid() to scope by — writes need the service-role key, and every
// query MUST scope by an explicitly-looked-up user_id instead. Only use this
// from routes whose caller is authenticated some other way (the webhook's
// HMAC signature); never from anything a browser can reach directly.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    throw new Error(
      "Webhook writes need a service-role key. Set SUPABASE_SECRET_KEY (or " +
        "SUPABASE_SERVICE_ROLE_KEY) from Supabase Studio > Settings > API keys.",
    );
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
