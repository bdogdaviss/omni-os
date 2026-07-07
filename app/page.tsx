import Link from "next/link";
import { Suspense } from "react";
import {
  ClipboardList,
  FileCode2,
  FileText,
  FolderKanban,
  ListChecks,
  Rocket,
  Users,
  Workflow,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

const PIPELINE_STEPS = [
  {
    icon: ClipboardList,
    title: "Intake",
    description: "Paste a messy client message. Get a structured project brief.",
  },
  {
    icon: FileText,
    title: "Proposals",
    description: "Turn approved briefs into three-tier proposal drafts.",
  },
  {
    icon: FolderKanban,
    title: "Projects",
    description: "Spin up a workspace with notes and status tracking.",
  },
  {
    icon: ListChecks,
    title: "Build Tasks",
    description: "Break proposals into practical, assignable build tasks.",
  },
  {
    icon: FileCode2,
    title: "GitHub Issues",
    description: "Draft developer-ready issues. Publish only with confirmation.",
  },
  {
    icon: Rocket,
    title: "Launch",
    description: "Generate launch readiness checklists before anything ships.",
  },
] as const;

async function HomeActions() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return (
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/dashboard">Open Dashboard</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/intake">New Intake</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-center gap-3">
      <Button asChild size="lg">
        <Link href="/auth/login">Log in</Link>
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link href="/auth/sign-up">Sign up</Link>
      </Button>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <section className="flex flex-col items-center gap-6 text-center">
          <div className="flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm font-medium text-muted-foreground shadow-sm">
            <Workflow className="size-4" aria-hidden="true" />
            Omni Strive internal operations
          </div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Omni OS
          </h1>
          <p className="max-w-2xl text-balance text-base leading-7 text-muted-foreground sm:text-lg">
            One place to take a client from first message to launched product.
            AI drafts the busywork. You approve every step.
          </p>
          <Suspense
            fallback={
              <div className="flex flex-wrap justify-center gap-3">
                <Button asChild size="lg">
                  <Link href="/auth/login">Log in</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/auth/sign-up">Sign up</Link>
                </Button>
              </div>
            }
          >
            <HomeActions />
          </Suspense>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PIPELINE_STEPS.map((step) => (
            <Card
              key={step.title}
              className="rounded-lg border-border/70 shadow-sm"
            >
              <CardHeader className="gap-2 p-5">
                <step.icon
                  className="size-5 text-muted-foreground"
                  aria-hidden="true"
                />
                <CardTitle className="text-base">{step.title}</CardTitle>
                <CardDescription className="text-sm leading-6">
                  {step.description}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </section>

        <footer className="flex items-center justify-center gap-2 border-t pt-8 text-xs text-muted-foreground">
          <Users className="size-3.5" aria-hidden="true" />
          Internal tool. Nothing is sent to clients or GitHub without explicit
          confirmation.
        </footer>
      </div>
    </main>
  );
}
