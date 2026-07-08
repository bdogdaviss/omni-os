"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type AddProjectNoteFormProps = {
  projectId: string;
};

type AddNoteResponse = {
  success: boolean;
  error?: string;
  details?: string;
};

function getFailureMessage(result: AddNoteResponse) {
  if (result.details) {
    return `${result.error ?? "Failed to save note"}: ${result.details}`;
  }

  return result.error ?? "Failed to save note";
}

export function AddProjectNoteForm({ projectId }: AddProjectNoteFormProps) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function saveNote() {
    const trimmed = note.trim();

    if (!trimmed) {
      toast.error("Note cannot be empty");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/projects/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectId, note: trimmed }),
      });
      const result = (await response.json()) as AddNoteResponse;

      if (!response.ok || !result.success) {
        throw new Error(getFailureMessage(result));
      }

      setNote("");
      toast.success("Note added");
      router.refresh();
    } catch (caughtError) {
      toast.error(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to save note",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        className="min-h-24 w-full resize-y rounded-md border border-input bg-background p-3 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:text-sm"
        disabled={loading}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Add an internal note about this project..."
        value={note}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={loading || !note.trim()}
          onClick={saveNote}
          type="button"
        >
          {loading ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : null}
          {loading ? "Saving..." : "Save Note"}
        </Button>
        <p className="text-xs text-muted-foreground">Internal only.</p>
      </div>
    </div>
  );
}
