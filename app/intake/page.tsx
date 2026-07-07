"use client";

import { useState } from "react";

export default function IntakePage() {
  const [clientName, setClientName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
  const [timeline, setTimeline] = useState("");
  const [rawMessage, setRawMessage] = useState("");
  const [result, setResult] = useState<any>(null);
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
    <main className="min-h-screen p-8">
      <h1 className="text-3xl font-bold">Client Intake Agent</h1>

      <p className="mt-2 text-gray-500">
        Paste a client message and turn it into a clean Omni Strive project brief.
      </p>

      <div className="mt-8 grid max-w-2xl gap-4">
        <input
          className="rounded border p-3 text-black"
          placeholder="Client name"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
        />

        <input
          className="rounded border p-3 text-black"
          placeholder="Company"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />

        <input
          className="rounded border p-3 text-black"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="rounded border p-3 text-black"
          placeholder="Website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />

        <input
          className="rounded border p-3 text-black"
          placeholder="Budget range"
          value={budgetRange}
          onChange={(e) => setBudgetRange(e.target.value)}
        />

        <input
          className="rounded border p-3 text-black"
          placeholder="Timeline"
          value={timeline}
          onChange={(e) => setTimeline(e.target.value)}
        />

        <textarea
          className="min-h-40 rounded border p-3 text-black"
          placeholder="Paste client message here"
          value={rawMessage}
          onChange={(e) => setRawMessage(e.target.value)}
        />

        <button
          onClick={submitLead}
          disabled={loading}
          className="rounded bg-white px-4 py-3 text-black disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate Project Brief"}
        </button>
      </div>

      {result && (
        <div className="mt-8 max-w-2xl rounded-xl border p-6">
          <h2 className="text-xl font-semibold">Result</h2>

          <pre className="mt-4 overflow-x-auto rounded bg-gray-900 p-4 text-sm text-white">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}