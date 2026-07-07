"use client";

import { useState } from "react";
import { Check, Clipboard } from "lucide-react";

import { Button } from "@/components/ui/button";

type CopyFollowUpButtonProps = {
  text: string;
};

export function CopyFollowUpButton({ text }: CopyFollowUpButtonProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyText() {
    setError(null);

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Copy failed");
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        disabled={!text.trim()}
        onClick={copyText}
        size="sm"
        type="button"
        variant="outline"
      >
        {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
        {copied ? "Copied" : "Copy Follow Up Draft"}
      </Button>
      {error ? (
        <p className="break-words text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
