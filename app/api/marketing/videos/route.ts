import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getGitHubInstallationToken } from "@/lib/github/app-auth";
import { githubFetch } from "@/lib/github/github-api";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  kitEventId: z.string().uuid("A valid kit ID is required"),
  repositoryId: z.string().uuid("Select a connected repository"),
});

export async function GET() {
  return NextResponse.json({ success: true, message: "Marketing videos API route is working" });
}

export async function POST(req: Request) {
  let jobId: string | null = null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });

    const { kitEventId, repositoryId } = requestSchema.parse(await req.json());
    const [{ data: kitRow, error: kitError }, { data: repo, error: repoError }] = await Promise.all([
      supabase.from("activity_events").select("id, client_id, metadata").eq("id", kitEventId).eq("user_id", user.id).eq("event_type", "marketing_kit").maybeSingle(),
      supabase.from("github_repositories").select("id, owner, name, full_name, installation_id").eq("id", repositoryId).eq("user_id", user.id).eq("synced_from_github", true).maybeSingle(),
    ]);
    if (kitError || !kitRow) return NextResponse.json({ success: false, error: "Kit not found." }, { status: 404 });
    if (repoError || !repo?.installation_id || !repo.owner || !repo.name) return NextResponse.json({ success: false, error: "Connected repository not found." }, { status: 404 });

    const metadata = (kitRow.metadata ?? {}) as Record<string, unknown>;
    const kit = (metadata.kit ?? {}) as Record<string, unknown>;
    const title = typeof kit.title === "string" ? kit.title : "Untitled video";
    const videoType = typeof metadata.videoType === "string" ? metadata.videoType : "custom";
    const productionBrief = JSON.stringify({ repository: repo.full_name, videoType, ...kit }, null, 2);

    const { data: job, error: insertError } = await supabase.from("marketing_videos").insert({
      user_id: user.id, client_id: kitRow.client_id, kit_event_id: kitRow.id,
      video_type: videoType, title, prompt: productionBrief, status: "requested",
      provider: "GitHub coding agent",
    }).select("id").single();
    if (insertError || !job) throw new Error(`Could not create the job: ${insertError?.message}`);
    jobId = job.id;

    const secret = process.env.GITHUB_WEBHOOK_SECRET?.trim();
    if (!secret) throw new Error("GITHUB_WEBHOOK_SECRET is not configured.");
    const expires = String(Date.now() + 60 * 60 * 1000);
    const signature = createHmac("sha256", secret).update(`${job.id}:${expires}`).digest("hex");
    const callback = new URL("/api/marketing/videos/complete", req.url);
    callback.search = new URLSearchParams({ job: job.id, expires, signature }).toString();

    const token = await getGitHubInstallationToken(repo.installation_id);
    const dispatch = await githubFetch(`/repos/${repo.owner}/${repo.name}/dispatches`, {
      method: "POST",
      body: JSON.stringify({ event_type: "omni-marketing-video", client_payload: { job_id: job.id, production_brief: productionBrief, callback_url: callback.toString() } }),
    }, token);
    if (!dispatch.ok) throw new Error(`GitHub rejected video dispatch (${dispatch.status}): ${(await dispatch.text()).slice(0, 300)}`);

    await supabase.from("marketing_videos").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", job.id).eq("user_id", user.id);
    return NextResponse.json({ success: true, status: "running", jobId: job.id });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to dispatch video job";
    if (jobId) {
      const supabase = await createClient();
      await supabase.from("marketing_videos").update({ status: "failed", model_response: message, updated_at: new Date().toISOString() }).eq("id", jobId);
    }
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    return NextResponse.json({ success: false, error: "Failed to dispatch video job", details: message }, { status: 500 });
  }
}
