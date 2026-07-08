// Self-check for the failover + structured-output logic in generate.ts.
// No network, no framework. Run: `node lib/ai/generate.check.ts`
//
// Covers the two non-trivial pieces:
//   - which Claude failures fail over to OpenAI (and which must NOT)
//   - the schema round-trip that generateStructured relies on
//
// The actual model calls are stubbed with plain thunks — withFailover takes the
// two providers as functions precisely so its routing can be exercised offline.

import assert from "node:assert/strict";
import { z } from "zod";
import {
  shouldFailoverToOpenAI,
  toInputSchema,
  withFailover,
} from "./generate.ts";

const saved = {
  a: process.env.ANTHROPIC_API_KEY,
  o: process.env.OPENAI_API_KEY,
};

function setKeys(a: string | undefined, o: string | undefined) {
  if (a === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = a;
  if (o === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = o;
}

const claude = async () => "from-claude";
const openai = async () => "from-openai";
const boom = (err: unknown) => async () => {
  throw err;
};
const mustNotRun = async (): Promise<string> => {
  throw new Error("this provider should not have been called");
};

async function main() {
  // --- shouldFailoverToOpenAI: retryable vs genuine bug ---
  assert.equal(shouldFailoverToOpenAI({ status: 429 }), true, "429 fails over");
  assert.equal(shouldFailoverToOpenAI({ status: 529 }), true, "529 fails over");
  assert.equal(shouldFailoverToOpenAI({ status: 400 }), false, "400 does not");
  assert.equal(
    shouldFailoverToOpenAI(new Error("Your credit balance is too low")),
    true,
    "credit balance fails over",
  );
  assert.equal(
    shouldFailoverToOpenAI(new Error("Overloaded")),
    true,
    "overloaded fails over",
  );
  assert.equal(
    shouldFailoverToOpenAI(new Error("invalid prompt: bad tool schema")),
    false,
    "a real bug does not fail over",
  );

  // --- withFailover routing ---
  // No provider configured at all → clear error, nothing called.
  setKeys(undefined, undefined);
  await assert.rejects(
    () => withFailover(mustNotRun, mustNotRun),
    /No AI provider configured/,
    "no keys → throws",
  );

  // No Claude key, OpenAI present → OpenAI directly, Claude never touched.
  setKeys(undefined, "ok");
  assert.deepEqual(
    await withFailover(mustNotRun, openai),
    { result: "from-openai", provider: "openai" },
    "no claude key → openai",
  );

  // Claude present and healthy → Claude, OpenAI never touched.
  setKeys("ok", "ok");
  assert.deepEqual(
    await withFailover(claude, mustNotRun),
    { result: "from-claude", provider: "anthropic" },
    "claude healthy → anthropic",
  );

  // Claude rate-limited, OpenAI present → fail over.
  assert.deepEqual(
    await withFailover(boom({ status: 429 }), openai),
    { result: "from-openai", provider: "openai" },
    "claude 429 → openai",
  );

  // Claude bad-request (a real bug) → rethrow the original error unchanged,
  // do NOT hide it behind OpenAI.
  await assert.rejects(
    () => withFailover(boom({ status: 400 }), mustNotRun),
    (err: unknown) => (err as { status?: number })?.status === 400,
    "claude 400 → rethrow",
  );

  // Claude rate-limited but NO OpenAI key → can't fail over, must rethrow.
  setKeys("ok", undefined);
  await assert.rejects(
    () => withFailover(boom({ status: 429 }), mustNotRun),
    "claude 429 without openai key → rethrow",
  );

  // --- toInputSchema: the contract generateStructured depends on ---
  const schema = z.object({
    project_type: z.string(),
    complexity: z.enum(["low", "medium", "high"]),
    mvp: z.array(z.string()),
  });
  const json = toInputSchema(schema);
  assert.equal(json.$schema, undefined, "$schema stripped");
  assert.equal(json.type, "object", "top-level object schema");
  assert.deepEqual(
    (json.required as string[]).sort(),
    ["complexity", "mvp", "project_type"],
    "all fields required",
  );
  // Zod is the real guarantee: good input passes, bad enum is rejected.
  schema.parse({ project_type: "app", complexity: "low", mvp: ["auth"] });
  assert.throws(
    () => schema.parse({ project_type: "app", complexity: "urgent", mvp: [] }),
    "invalid enum value rejected",
  );

  console.log("generate.check.ts: all checks passed");
}

main()
  .catch((err) => {
    console.error("generate.check.ts: FAILED\n", err);
    process.exitCode = 1;
  })
  .finally(() => setKeys(saved.a, saved.o));
