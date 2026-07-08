"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// Theme-aware toast surface. richColors gives success/error/warning their own
// tinted styling out of the box; closeButton lets long-lived error toasts be
// dismissed.
export function Toaster(props: ToasterProps) {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      richColors
      closeButton
      {...props}
    />
  );
}
