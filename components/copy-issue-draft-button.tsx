"use client";

import { useState } from "react";
import { Check, Clipboard } from "lucide-react";

import { Button } from "@/components/ui/button";

type CopyIssueDraftButtonProps = {
  title: string;
  body: string;
};

export function CopyIssueDraftButton({
  title,
  body,
}: CopyIssueDraftButtonProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyDraft() {
    setError(null);

    const text = `Title:\n${title}\n\nBody:\n${body}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copy failed");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        disabled={!title.trim() && !body.trim()}
        onClick={copyDraft}
        size="sm"
        type="button"
        variant="outline"
      >
        {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
        {copied ? "Copied" : "Copy Issue Draft"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
