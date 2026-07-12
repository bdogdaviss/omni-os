"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type RemoveMarketingItemButtonProps = {
  endpoint: string;
  body: Record<string, string>;
  noun: "video" | "kit";
  description: string;
};

function RemoveMarketingItemButton({ endpoint, body, noun, description }: RemoveMarketingItemButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function remove() {
    setLoading(true);
    try {
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { success: boolean; error?: string; details?: string };
      if (!response.ok || !result.success) throw new Error(result.details ? `${result.error}: ${result.details}` : result.error ?? `Failed to remove ${noun}`);
      toast.success(`${noun === "video" ? "Video" : "Kit"} removed`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to remove ${noun}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button className="h-10 sm:h-8" disabled={loading} size="sm" type="button" variant="outline">
          {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
          {loading ? "Removing…" : "Remove"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this {noun}?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={remove}>Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function RemoveVideoJobButton({ videoJobId }: { videoJobId: string }) {
  return <RemoveMarketingItemButton endpoint="/api/marketing/videos" body={{ videoJobId }} noun="video" description="This removes the job from the list and deletes its stored MP4 when one exists." />;
}

export function RemoveMarketingKitButton({ kitEventId }: { kitEventId: string }) {
  return <RemoveMarketingItemButton endpoint="/api/agents/marketing-kit" body={{ kitEventId }} noun="kit" description="This removes the unused production kit from the Marketing page. Existing completed videos are not deleted." />;
}
