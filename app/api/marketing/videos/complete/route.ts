import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

function signature(jobId: string, expires: string, secret: string) {
  return createHmac("sha256", secret).update(`${jobId}:${expires}`).digest("hex");
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const jobId = url.searchParams.get("job") ?? "";
  const expires = url.searchParams.get("expires") ?? "";
  const supplied = url.searchParams.get("signature") ?? "";
  const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
  const expected = secret ? signature(jobId, expires, secret) : "";

  if (
    !secret ||
    !jobId ||
    !expires ||
    Number(expires) < Date.now() ||
    supplied.length !== expected.length ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  ) {
    return NextResponse.json({ error: "Invalid or expired upload URL." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: job, error: jobError } = await admin
    .from("marketing_videos")
    .select("id, user_id, client_id, title, status")
    .eq("id", jobId)
    .maybeSingle();

  if (jobError || !job || !["requested", "running"].includes(job.status)) {
    return NextResponse.json({ error: "Video job is not accepting uploads." }, { status: 409 });
  }

  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as { error?: unknown };
    const reason = typeof body.error === "string" ? body.error.slice(0, 1000) : "Repository video workflow failed.";
    await admin.from("marketing_videos").update({ status: "failed", model_response: reason, updated_at: new Date().toISOString() }).eq("id", job.id).eq("user_id", job.user_id);
    return NextResponse.json({ success: true, status: "failed" });
  }

  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_VIDEO_BYTES) return NextResponse.json({ error: "Video exceeds 50 MB." }, { status: 413 });
  const bytes = Buffer.from(await req.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_VIDEO_BYTES || bytes.subarray(4, 8).toString() !== "ftyp") {
    return NextResponse.json({ error: "A valid MP4 is required." }, { status: 400 });
  }

  const path = `${job.user_id}/${job.id}/video.mp4`;
  const upload = await admin.storage.from("marketing-videos").upload(path, bytes, {
    contentType: "video/mp4",
    upsert: true,
  });
  if (upload.error) {
    return NextResponse.json({ error: upload.error.message }, { status: 500 });
  }

  const { data: publicData } = admin.storage.from("marketing-videos").getPublicUrl(path);
  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("marketing_videos")
    .update({ status: "video_ready", video_url: publicData.publicUrl, updated_at: now })
    .eq("id", job.id)
    .eq("user_id", job.user_id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await admin.from("activity_events").insert({
    user_id: job.user_id,
    client_id: job.client_id,
    event_type: "marketing_video_ready",
    title: "Video ready",
    description: `${job.title ?? "Marketing video"} is ready to review.`,
    metadata: { source: "marketing_video", videoJobId: job.id, videoUrl: publicData.publicUrl },
  });

  return NextResponse.json({ success: true });
}
