import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const noteSchema = z.object({
  clientId: z.string().uuid("A valid client ID is required"),
  note: z.string().min(1, "Note text is required"),
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
    message: "Client notes API route is working",
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
    const { clientId, note } = noteSchema.parse(body);

    // Confirm the client exists and belongs to this user before inserting.
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (clientError) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to verify client",
          details: clientError.message,
        },
        { status: 500 },
      );
    }

    if (!client) {
      return NextResponse.json(
        {
          success: false,
          error: "Client not found",
          details:
            "The client may not exist or may belong to another user.",
        },
        { status: 404 },
      );
    }

    // Double-submit protection: block the exact same note for this client
    // within the last 60 seconds. Errors here never block note taking.
    const cutoff = new Date(Date.now() - 60_000).toISOString();
    const { data: recentDuplicates } = await supabase
      .from("client_notes")
      .select("id")
      .eq("user_id", user.id)
      .eq("client_id", clientId)
      .eq("note", note)
      .gte("created_at", cutoff)
      .limit(1);

    if (recentDuplicates && recentDuplicates.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Duplicate note",
          details: "This note was already saved.",
        },
        { status: 409 },
      );
    }

    const { data: savedNote, error: insertError } = await supabase
      .from("client_notes")
      .insert({
        user_id: user.id,
        client_id: clientId,
        note,
      })
      .select()
      .single();

    if (insertError || !savedNote) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to save note",
          details: insertError?.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      note: savedNote,
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid note request",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to save note",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
