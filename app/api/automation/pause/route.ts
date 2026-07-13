import { NextResponse } from "next/server";
import { z } from "zod";

import { resumeHeldRuns } from "@/lib/pipeline/run";
import { createClient } from "@/lib/supabase/server";

// The emergency brake. Pausing does not abort agent runs already going on
// GitHub's side — it holds their results: the webhook flips the run to
// blocked instead of merging, and no new runs can start until resume.

const pauseSchema = z.object({
  paused: z.boolean(),
});

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated. Please log in first." },
        { status: 401 },
      );
    }

    const body: unknown = await req.json();
    const { paused } = pauseSchema.parse(body);

    const { error: upsertError } = await supabase
      .from("automation_settings")
      .upsert({
        user_id: user.id,
        paused,
        updated_at: new Date().toISOString(),
      });

    if (upsertError) {
      return NextResponse.json(
        { success: false, error: upsertError.message },
        { status: 500 },
      );
    }

    // Green checks held during the pause replay now: merge + next dispatch
    // continue exactly where the webhook left off.
    const resumedRuns = paused ? 0 : await resumeHeldRuns(supabase, user.id);

    return NextResponse.json({ success: true, paused, resumedRuns });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Could not update pause state.",
      },
      { status: 500 },
    );
  }
}
