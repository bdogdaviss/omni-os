"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type ApiResponse = {
  success: boolean;
  error?: string;
  resumedRuns?: number;
};

export function PauseAutomationButton({ paused }: { paused: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/automation/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paused: !paused }),
      });
      const result = (await response.json()) as ApiResponse;

      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Could not update pause state.");
      }

      const resumedRuns = result.resumedRuns ?? 0;

      toast.success(
        paused
          ? resumedRuns > 0
            ? `Automation resumed — ${resumedRuns} held merge${resumedRuns === 1 ? "" : "s"} replayed`
            : "Automation resumed"
          : "Automation paused — running agents finish, but nothing merges or dispatches",
      );
      router.refresh();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Could not update pause state.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      disabled={loading}
      onClick={toggle}
      size="sm"
      type="button"
      variant={paused ? "default" : "outline"}
    >
      {loading ? (
        <Loader2 className="animate-spin" aria-hidden="true" />
      ) : paused ? (
        <Play aria-hidden="true" />
      ) : (
        <Pause aria-hidden="true" />
      )}
      {paused ? "Resume automation" : "Pause automation"}
    </Button>
  );
}
