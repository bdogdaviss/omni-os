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
  "h-11 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function IntakePage() {
  const [clientName, setClientName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
  const [timeline, setTimeline] = useState("");
  const [rawMessage, setRawMessage] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function submitLead() {
    setLoading(true);
    setResult(null);

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

    const data = await response.json();

    setResult(data);
    setLoading(false);
  }

  return (
    <main className="min-h-screen bg-muted/30 px-6 py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <DashboardNav />
        <header className="space-y-2 border-b pb-6">
          <p className="text-sm font-medium text-muted-foreground">Omni OS</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Client Intake Agent
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Paste a client message and turn it into a clean Omni Strive project
            brief.
          </p>
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
                className="min-h-40 rounded-md border border-input bg-background p-3 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              <pre className="overflow-x-auto rounded-md border bg-muted/50 p-4 text-xs leading-6 text-foreground">
                {JSON.stringify(result, null, 2)}
              </pre>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
