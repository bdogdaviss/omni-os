"use client";

import { useState } from "react";
import { Check, Clipboard } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type CopyFollowUpButtonProps = {
  text: string;
  /** Button label; defaults to the proposal follow-up wording. */
  label?: string;
};

export function CopyFollowUpButton({
  text,
  label = "Copy Follow Up Draft",
}: CopyFollowUpButtonProps) {
  const [copied, setCopied] = useState(false);

  async function copyText() {
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
    <div className="flex flex-col items-start gap-2">
      <Button
        // h-10 on touch screens (40px minimum target); compact on desktop.
        className="h-10 sm:h-8"
        disabled={!text.trim()}
        onClick={copyText}
        size="sm"
        type="button"
        variant="outline"
      >
        {copied ? <Check aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
        {copied ? "Copied" : label}
      </Button>
    </div>
  );
}
