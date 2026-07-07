import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ArrowRight, InfoIcon } from "lucide-react";
import { FetchDataSteps } from "@/components/tutorial/fetch-data-steps";
import { Button } from "@/components/ui/button";
import { Suspense } from "react";

async function UserDetails() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return JSON.stringify(data.claims, null, 2);
}

export default function ProtectedPage() {
  return (
    <div className="flex-1 w-full flex flex-col gap-12">
      <div className="w-full flex flex-col gap-4 rounded-lg border border-border/70 bg-background p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-base font-semibold tracking-tight sm:text-lg">
            Omni OS Command Center
          </h2>
          <p className="text-sm text-muted-foreground">
            You are signed in. Enter the dashboard to manage intake, briefs,
            proposals, and build tasks.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard">
            Enter Dashboard
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
      <div className="w-full">
        <div className="rounded-md border bg-muted/20 p-3 text-sm text-foreground flex gap-3 items-start">
          <InfoIcon size="16" strokeWidth={2} className="mt-0.5 shrink-0" />
          This is a protected page that you can only see as an authenticated
          user
        </div>
      </div>
      <div className="flex flex-col gap-2 items-start">
        <h2 className="text-base font-semibold tracking-tight sm:text-lg mb-4">
          Your user details
        </h2>
        <pre className="w-full text-xs font-mono p-3 rounded border max-h-32 overflow-x-auto overflow-y-auto">
          <Suspense>
            <UserDetails />
          </Suspense>
        </pre>
      </div>
      <div>
        <h2 className="text-base font-semibold tracking-tight sm:text-lg mb-4">
          Next steps
        </h2>
        <FetchDataSteps />
      </div>
    </div>
  );
}
