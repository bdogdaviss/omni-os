"use client";

import { useState } from "react";

import { DashboardNav } from "@/components/dashboard-nav";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const inputClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm";

export default function IntakePage() {
  const [clientName, setClientName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
  const [timeline, setTimeline] = useState("");
  const [rawMessage, setRawMessage] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitLead() {
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/agents/intake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientName,
          company,
          email,
          website,
          budgetRange,
          timeline,
          rawMessage,
        }),
      });

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        details?: string;
      };

      if (!response.ok || !data.success) {
        const message = data.error ?? "Failed to generate project brief";
        setError(data.details ? `${message}. ${data.details}` : message);
        return;
      }

      setResult(data);
    } catch {
      setError("Failed to generate project brief. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-muted/30 pb-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <DashboardNav />
        <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Omni OS
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Client Intake Agent
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Paste a client message and turn it into a clean Omni Strive
              project brief.
            </p>
          </div>
        </header>

        <Card className="max-w-2xl rounded-lg border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">New client intake</CardTitle>
            <CardDescription>
              Fill in what you have. The intake agent will structure it into a
              project brief.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <input
                className={inputClass}
                placeholder="Client name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
              />

              <input
                className={inputClass}
                placeholder="Company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />

              <input
                className={inputClass}
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <input
                className={inputClass}
                placeholder="Website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />

              <input
                className={inputClass}
                placeholder="Budget range"
                value={budgetRange}
                onChange={(e) => setBudgetRange(e.target.value)}
              />

              <input
                className={inputClass}
                placeholder="Timeline"
                value={timeline}
                onChange={(e) => setTimeline(e.target.value)}
              />

              <textarea
                className="min-h-40 w-full resize-y rounded-md border border-input bg-background p-3 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
                placeholder="Paste client message here"
                value={rawMessage}
                onChange={(e) => setRawMessage(e.target.value)}
              />

              <Button
                onClick={submitLead}
                disabled={loading}
                type="button"
              >
                {loading ? "Generating..." : "Generate Project Brief"}
              </Button>

              {error ? (
                <p className="break-words rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {result ? (
          <Card className="max-w-2xl rounded-lg border-border/70 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Result</CardTitle>
              <CardDescription>
                Raw intake response. Review the structured brief on the Briefs
                page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="w-full overflow-x-auto rounded-md border bg-muted/50 p-4 text-xs leading-6 text-foreground">
                {JSON.stringify(result, null, 2)}
              </pre>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
