"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type ClientOption = {
  id: string;
  label: string;
};

type MarketingKitFormProps = {
  clients: ClientOption[];
};

type KitResponse = {
  success: boolean;
  error?: string;
  details?: string;
};

const VIDEO_TYPE_OPTIONS = [
  { value: "marketing", label: "Marketing / promo video" },
  { value: "demo", label: "Product demo video" },
  { value: "onboarding", label: "Onboarding video" },
  { value: "custom", label: "Custom (describe it below)" },
] as const;

// Tall touch targets on purpose — this page's whole reason to exist is being
// usable from a phone.
const fieldClass =
  "h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm";

export function MarketingKitForm({ clients }: MarketingKitFormProps) {
  const router = useRouter();
  const [videoType, setVideoType] = useState<string>("marketing");
  const [clientId, setClientId] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  async function generateKit() {
    setLoading(true);
    const toastId = toast.loading("Writing the production kit…");

    try {
      const response = await fetch("/api/agents/marketing-kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoType,
          clientId: clientId || undefined,
          prompt,
        }),
      });
      const result = (await response.json()) as KitResponse;

      if (!response.ok || !result.success) {
        const message = result.error ?? "Failed to generate the video kit";
        throw new Error(result.details ? `${message}: ${result.details}` : message);
      }

      toast.success("Video kit ready — newest card below", { id: toastId });
      setPrompt("");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to generate the video kit",
        { id: toastId },
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label
          className="flex flex-col gap-1.5 text-sm font-medium"
          htmlFor="kit-video-type"
        >
          Video type
          <select
            className={fieldClass}
            disabled={loading}
            id="kit-video-type"
            onChange={(event) => setVideoType(event.target.value)}
            value={videoType}
          >
            {VIDEO_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label
          className="flex flex-col gap-1.5 text-sm font-medium"
          htmlFor="kit-client"
        >
          Client (optional)
          <select
            className={fieldClass}
            disabled={loading}
            id="kit-client"
            onChange={(event) => setClientId(event.target.value)}
            value={clientId}
          >
            <option value="">No client — general</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label
        className="flex flex-col gap-1.5 text-sm font-medium"
        htmlFor="kit-prompt"
      >
        {videoType === "custom" ? "Describe the video (required)" : "Extra notes (optional)"}
        <textarea
          className="min-h-24 w-full rounded-md border border-input bg-background p-3 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
          disabled={loading}
          id="kit-prompt"
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={
            videoType === "custom"
              ? "e.g. 20-second teaser announcing the new booking feature, upbeat, vertical for reels"
              : "Anything specific: tone, platform, feature to highlight…"
          }
          value={prompt}
        />
      </label>

      <div className="flex flex-col gap-1.5 sm:self-start">
        <Button
          className="h-11"
          disabled={loading || (videoType === "custom" && prompt.trim().length < 10)}
          onClick={generateKit}
          type="button"
        >
          {loading ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Clapperboard aria-hidden="true" />
          )}
          {loading ? "Writing…" : "Generate video kit"}
        </Button>
        {videoType === "custom" && prompt.trim().length < 10 ? (
          <p className="text-xs text-muted-foreground">
            Describe the video above (at least 10 characters) to enable.
          </p>
        ) : null}
      </div>
    </div>
  );
}
