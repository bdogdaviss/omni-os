"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type Journey = {
  key: string;
  clientLabel: string;
  step: 1 | 2 | 3;
  title: string;
  description: string;
  href: string;
  cta: string;
  blocked?: boolean;
};

// The three human gates, onboarding-style: done steps fill, the current step
// is the bold ring, everything else waits its turn.
function StepTimeline({
  current,
  blocked = false,
}: {
  current: 1 | 2 | 3;
  blocked?: boolean;
}) {
  const steps = [
    { n: 1 as const, label: "Brief" },
    { n: 2 as const, label: "Tier" },
    { n: 3 as const, label: "Build" },
  ];

  return (
    <div aria-label={`Step ${current} of 3`} className="flex items-center gap-2">
      {steps.map((step, index) => (
        <div
          className={cn(
            "flex items-center gap-2",
            index < steps.length - 1 && "flex-1",
          )}
          key={step.n}
        >
          <div
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              step.n < current
                ? "bg-primary text-primary-foreground"
                : step.n === current
                  ? blocked
                    ? // --status-danger stays readable in dark mode, where the
                      // raw destructive token blends into the card.
                      "border-2 border-[hsl(var(--status-danger))] text-[hsl(var(--status-danger))]"
                    : "border-2 border-primary text-primary"
                  : "border border-border text-muted-foreground",
            )}
          >
            {step.n < current ? (
              <Check aria-hidden="true" className="size-4" />
            ) : (
              step.n
            )}
          </div>
          <span
            className={cn(
              "text-xs font-medium",
              step.n === current ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {step.label}
          </span>
          {index < steps.length - 1 ? (
            <div
              className={cn(
                "h-px min-w-4 flex-1",
                step.n < current ? "bg-primary" : "bg-border",
              )}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * Phone: one decision per screen — a swipeable snap carousel with the CTA
 * pinned at the bottom and pagination dots, onboarding-style. Desktop (sm+):
 * the same cards stacked vertically.
 */
export function DecisionCarousel({ journeys }: { journeys: Journey[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const handleScroll = () => {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    let nearest = 0;
    let best = Number.POSITIVE_INFINITY;

    Array.from(track.children).forEach((child, index) => {
      const distance = Math.abs(
        (child as HTMLElement).offsetLeft - track.scrollLeft,
      );

      if (distance < best) {
        best = distance;
        nearest = index;
      }
    });

    setActive(nearest);
  };

  return (
    <div className="space-y-3">
      <div
        className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-col sm:overflow-visible sm:px-0 sm:pb-0"
        onScroll={handleScroll}
        ref={trackRef}
      >
        {journeys.map((journey) => (
          <Card
            className={cn(
              "w-[88%] shrink-0 snap-center rounded-lg shadow-sm sm:w-auto sm:shrink",
              journey.blocked
                ? "border-[hsl(var(--status-danger)/0.5)]"
                : "border-border/70",
            )}
            key={journey.key}
          >
            <CardContent className="flex min-h-[52dvh] flex-col gap-4 pt-6 text-center sm:min-h-0 sm:pt-5 sm:text-left">
              <div className="space-y-1.5">
                <p className="break-words text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {journey.clientLabel}
                </p>
                <p className="break-words text-xl font-semibold tracking-tight sm:text-lg">
                  {journey.title}
                </p>
                <p className="break-words text-sm leading-6 text-muted-foreground">
                  {journey.description}
                </p>
              </div>
              <div className="mt-auto space-y-4 sm:mt-0">
                <StepTimeline blocked={journey.blocked} current={journey.step} />
                <Button
                  asChild
                  className="h-12 w-full text-base sm:h-11 sm:w-auto sm:px-6"
                  variant={journey.blocked ? "destructive" : "default"}
                >
                  <Link href={journey.href}>{journey.cta}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {journeys.length > 1 ? (
        <div
          aria-hidden="true"
          className="flex items-center justify-center gap-1.5 sm:hidden"
        >
          {journeys.map((journey, index) => (
            <span
              className={cn(
                "size-1.5 rounded-full transition-colors",
                index === active ? "bg-primary" : "bg-border",
              )}
              key={journey.key}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
