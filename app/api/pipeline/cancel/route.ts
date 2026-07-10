import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

// The kill switch. Canceling stops the pipeline from advancing — the webhook
// only drives runs whose status is "running" — but does NOT abort an agent
// run already going on GitHub's side; that one finishes and its PR simply sits
// unmerged.

const cancelSchema = z.object({
  runId: z.string().uuid("A valid run ID is required"),
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
    const { runId } = cancelSchema.parse(body);

    const { data: updated, error: updateError } = await supabase
      .from("pipeline_runs")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("id", runId)
      .eq("user_id", user.id)
      .in("status", ["running", "blocked"])
      .select("id")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 },
      );
    }

    if (!updated) {
      return NextResponse.json(
        { success: false, error: "No active run with that ID." },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message ?? "Invalid request" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Cancel failed." },
      { status: 500 },
    );
  }
}
