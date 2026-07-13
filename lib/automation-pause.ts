// The global pause switch, read-side. Both gates in the pipeline — the start
// route (no new runs) and the webhook's green-check path (no merges/dispatches)
// — call this before acting.

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * True when the operator paused all automation.
 *
 * Fails OPEN: a missing table (migration not applied yet) or a read error
 * reports "not paused". Failing closed would freeze every pipeline the moment
 * the settings read hiccups — worse than honoring a pause a beat late, because
 * a held green check lands the run in `blocked`, which is recoverable.
 */
export async function isAutomationPaused(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("automation_settings")
    .select("paused")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn(`Automation pause read failed (treating as not paused): ${error.message}`);
    return false;
  }

  return Boolean(data?.paused);
}
