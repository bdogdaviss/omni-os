"use client";

import { useState } from "react";
import { Check, Clipboard } from "lucide-react";
import { toast } from "sonner";

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

  async function copyDraft() {
    const text = `Title:\n${title}\n\nBody:\n${body}`;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Copy failed");
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
    </div>
  );
}
