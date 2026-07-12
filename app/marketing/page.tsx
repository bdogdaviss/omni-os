import { Suspense } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { CopyFollowUpButton } from "@/components/copy-follow-up-button";
import { DashboardNav } from "@/components/dashboard-nav";
import { MarketingKitForm } from "@/components/marketing-kit-form";
import { RemoveMarketingKitButton, RemoveVideoJobButton } from "@/components/remove-video-job-button";
import { SendToVideoButton } from "@/components/send-to-video-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

// Kits can be copied into a generator or dispatched to a connected repository,
// where the coding agent records the real current app and returns an MP4.

type Kit = {
  title: string;
  duration: string;
  video_prompt: string;
  script: string;
  shot_list: string[];
  voiceover: string;
  captions: string[];
};

type KitRow = {
  id: string;
  created_at: string | null;
  metadata: unknown;
};

const VIDEO_TYPE_LABELS: Record<string, string> = {
  demo: "Demo",
  onboarding: "Onboarding",
  marketing: "Marketing",
  custom: "Custom",
};

type VideoJobRow = {
  id: string;
  title: string | null;
  video_type: string | null;
  status: string | null;
  provider: string | null;
  model_response: string | null;
  video_url: string | null;
  created_at: string | null;
};

const JOB_STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  running: "Recording",
  responded_no_video: "No video — text reply",
  video_ready: "Video ready",
  failed: "Failed",
};

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** Defensive: metadata is jsonb — never trust its shape at render time. */
function parseKit(metadata: unknown): { kit: Kit; videoType: string } | null {
  if (typeof metadata !== "object" || metadata === null) {
    return null;
  }

  const m = metadata as Record<string, unknown>;
  const raw = m.kit;

  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const k = raw as Record<string, unknown>;

  if (typeof k.title !== "string" || typeof k.video_prompt !== "string") {
    return null;
  }

  return {
    videoType: typeof m.videoType === "string" ? m.videoType : "custom",
    kit: {
      title: k.title,
      duration: typeof k.duration === "string" ? k.duration : "",
      video_prompt: k.video_prompt,
      script: typeof k.script === "string" ? k.script : "",
      shot_list: asStringArray(k.shot_list),
      voiceover: typeof k.voiceover === "string" ? k.voiceover : "",
      captions: asStringArray(k.captions),
    },
  };
}

function formatDate(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function LoginPrompt() {
  return (
    <Card className="rounded-lg border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle>Log in to use the marketing studio</CardTitle>
        <CardDescription>
          Video kits are scoped to your account. Sign in to generate and view
          them.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button asChild>
          <Link href="/auth/login">Log in</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

function KitSection({ heading, text }: { heading: string; text: string }) {
  if (!text.trim()) {
    return null;
  }

  return (
    <details className="rounded-md border bg-muted/30">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
        {heading}
      </summary>
      <div className="space-y-3 border-t px-4 py-3">
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
          {text}
        </p>
        <CopyFollowUpButton label={`Copy ${heading.toLowerCase()}`} text={text} />
      </div>
    </details>
  );
}

async function MarketingContent() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return <LoginPrompt />;
  }

  const [{ data: clientData }, { data: kitRows }, videoJobsResult, { data: repoData }] =
    await Promise.all([
      supabase
        .from("clients")
        .select("id, name, company")
        .eq("user_id", user.id)
        .order("name"),
      supabase
        .from("activity_events")
        .select("id, created_at, metadata")
        .eq("user_id", user.id)
        .eq("event_type", "marketing_kit")
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("marketing_videos")
        .select(
          "id, title, video_type, status, provider, model_response, video_url, created_at",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("github_repositories")
        .select("id, full_name")
        .eq("user_id", user.id)
        .eq("synced_from_github", true)
        .eq("archived", false)
        .order("full_name"),
    ]);

  // Tolerate marketing_videos query failures (most likely the migration not
  // being applied yet) — the page still renders kits; the jobs section stays
  // empty. Logged so a genuine query error isn't silently invisible.
  if (videoJobsResult.error) {
    console.warn(`marketing_videos query failed: ${videoJobsResult.error.message}`);
  }
  const videoJobs = (videoJobsResult.data ?? []) as VideoJobRow[];

  const clients = ((clientData ?? []) as {
    id: string;
    name: string | null;
    company: string | null;
  }[]).map((client) => ({
    id: client.id,
    label: client.company
      ? `${client.name ?? "Unnamed"} · ${client.company}`
      : client.name ?? "Unnamed client",
  }));

  const repositories = ((repoData ?? []) as { id: string; full_name: string }[]).map(
    (repository) => ({ id: repository.id, label: repository.full_name }),
  );

  const kits = ((kitRows ?? []) as KitRow[])
    .map((row) => {
      const parsed = parseKit(row.metadata);

      return parsed
        ? { id: row.id, createdAt: row.created_at, ...parsed }
        : null;
    })
    .filter((kit): kit is NonNullable<typeof kit> => kit !== null);

  return (
    <div className="space-y-6">
      <Card className="rounded-lg border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>New video kit</CardTitle>
          <CardDescription>
            Pick a type, get the full production kit: a prompt ready for any
            video generator, plus the script, shot list, voiceover, and
            captions. Copy the pieces into another tool or record a connected
            repository directly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MarketingKitForm clients={clients} />
        </CardContent>
      </Card>

      {videoJobs.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold tracking-tight">Video jobs</h2>
          {videoJobs.map((job) => (
            <details key={job.id} className="group rounded-lg border border-border/70 bg-card shadow-sm">
              <summary className="cursor-pointer list-none rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <CardHeader className="gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="min-w-0 flex-1 break-words text-base">
                    {job.title ?? "Untitled video"}
                  </CardTitle>
                  <Badge variant="outline">
                    {JOB_STATUS_LABELS[job.status ?? ""] ?? job.status ?? "Unknown"}
                  </Badge>
                  <ChevronDown className="mt-0.5 size-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden="true" />
                </div>
                <CardDescription className="break-words">
                  {VIDEO_TYPE_LABELS[job.video_type ?? ""] ?? job.video_type}
                  {job.provider ? ` · answered by ${job.provider}` : ""}
                  {job.created_at ? ` · ${formatDate(job.created_at)}` : ""}
                </CardDescription>
                </CardHeader>
              </summary>
              <CardContent className="space-y-3 border-t pt-4">
                {job.video_url ? (
                  // The socket the real (screen-recording agent) pipeline
                  // fills. Approve & send-to-client lands here with it.
                  <video
                    className="max-h-[70vh] w-full rounded-md border bg-black"
                    controls
                    preload="metadata"
                    src={job.video_url}
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {job.status === "running"
                      ? "The repository agent is producing this video. Refresh to check for completion."
                      : "No video file exists for this job."}
                  </p>
                )}
                {job.model_response ? (
                  <details className="rounded-md border bg-muted/30">
                    <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
                      Model reply
                    </summary>
                    <p className="whitespace-pre-wrap break-words border-t px-4 py-3 text-sm leading-6 text-muted-foreground">
                      {job.model_response}
                    </p>
                  </details>
                ) : null}
                <RemoveVideoJobButton videoJobId={job.id} />
              </CardContent>
            </details>
          ))}
        </div>
      ) : null}

      {kits.length === 0 ? (
        <Card className="rounded-lg border-dashed shadow-sm">
          <CardHeader>
            <CardTitle>No kits yet</CardTitle>
            <CardDescription>
              Your generated video kits will appear here, newest first.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-4">
          {kits.length === 12 ? (
            <p className="text-xs text-muted-foreground">
              Showing the 12 most recent kits.
            </p>
          ) : null}
          {kits.map((entry) => (
            <Card key={entry.id} className="rounded-lg border-border/70 shadow-sm">
              <CardHeader className="gap-2 border-b">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="min-w-0 flex-1 break-words text-lg">
                    {entry.kit.title}
                  </CardTitle>
                  <Badge variant="outline">
                    {VIDEO_TYPE_LABELS[entry.videoType] ?? entry.videoType}
                  </Badge>
                </div>
                <CardDescription className="break-words">
                  {entry.kit.duration}
                  {entry.createdAt ? ` · ${formatDate(entry.createdAt)}` : ""}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3 pt-4">
                <div className="space-y-2 rounded-md border bg-muted/30 p-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Video generator prompt — paste into Sora / Veo / Runway
                  </p>
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">
                    {entry.kit.video_prompt}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <CopyFollowUpButton
                      label="Copy video prompt"
                      text={entry.kit.video_prompt}
                    />
                    <SendToVideoButton kitEventId={entry.id} repositories={repositories} />
                    <RemoveMarketingKitButton kitEventId={entry.id} />
                  </div>
                </div>

                <KitSection heading="Script" text={entry.kit.script} />
                <KitSection
                  heading="Shot list"
                  text={entry.kit.shot_list.map((shot, i) => `${i + 1}. ${shot}`).join("\n")}
                />
                <KitSection heading="Voiceover" text={entry.kit.voiceover} />
                <KitSection
                  heading="Captions"
                  text={entry.kit.captions.join("\n\n")}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function MarketingFallback() {
  return (
    <Card className="rounded-lg border-border/70 shadow-sm">
      <CardHeader>
        <CardTitle>Marketing studio</CardTitle>
        <CardDescription>Loading…</CardDescription>
      </CardHeader>
    </Card>
  );
}

export default function MarketingPage() {
  return (
    <main className="min-h-screen bg-muted/30 pb-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <DashboardNav />
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Omni OS
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Marketing Studio
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Demo, onboarding, and promo video kits — scripts, shot lists, and
              generator-ready prompts, built from your client context.
            </p>
          </div>
        </header>

        <Suspense fallback={<MarketingFallback />}>
          <MarketingContent />
        </Suspense>
      </div>
    </main>
  );
}
