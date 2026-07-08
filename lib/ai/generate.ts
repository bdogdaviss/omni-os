// Shared text generation for Omni OS's agents, with automatic failover.
//
// Primary: Anthropic (Claude Haiku by default). If a Claude call fails because
// the credit balance is exhausted, the account is rate-limited, or the API is
// overloaded, the SAME request is retried against OpenAI using OPENAI_API_KEY.
// Day to day this stays on cheap Claude; OpenAI is only the safety net.
//
// Two surfaces:
//   generateAgentText   — free-form text out.
//   generateStructured  — forces the model to emit JSON matching a Zod schema
//                         (via tool use / function calling), then validates it.
//                         Use this instead of prompting for JSON and calling
//                         JSON.parse on the reply — the model can't hand back
//                         prose, a trailing comma, or a truncated object.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

type GenerateArgs = {
  system: string;
  user: string;
  maxTokens: number;
};

export type Provider = "anthropic" | "openai";

export type GenerateResult = {
  text: string;
  provider: Provider;
};

export type StructuredResult<T> = {
  data: T;
  provider: Provider;
};

const OPENAI_FALLBACK_MODEL =
  process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini";

const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

function anthropicKey() {
  return process.env.ANTHROPIC_API_KEY?.trim();
}

function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

// Decide whether a Claude failure is the kind we should fail over on:
// out of credits, over the spend/usage cap, rate limited, or overloaded. A
// genuine bug (bad prompt, invalid schema) should NOT silently switch
// providers. Note the spend-cap case arrives as HTTP 400 (not 429), so it is
// matched by message, not status — "You have reached your specified API usage
// limits." That's still "Claude is unavailable for billing reasons," which is
// exactly what the OpenAI safety net is for.
export function shouldFailoverToOpenAI(error: unknown): boolean {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: number }).status
      : undefined;

  if (status === 429 || status === 529) {
    return true;
  }

  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();

  return (
    message.includes("credit balance") ||
    message.includes("billing") ||
    message.includes("quota") ||
    message.includes("insufficient") ||
    message.includes("usage limit") ||
    message.includes("spending limit") ||
    message.includes("rate limit") ||
    message.includes("overloaded")
  );
}

// Claude first, OpenAI only on the retryable failures above. Shared by both the
// text and structured surfaces so the failover rule lives in exactly one place.
// Exported for the self-check in generate.check.ts.
export async function withFailover<T>(
  anthropicCall: () => Promise<T>,
  openaiCall: () => Promise<T>,
): Promise<{ result: T; provider: Provider }> {
  // No Claude key at all — use OpenAI directly if it's configured.
  if (!anthropicKey()) {
    if (!hasOpenAIKey()) {
      throw new Error(
        "No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
      );
    }
    return { result: await openaiCall(), provider: "openai" };
  }

  try {
    return { result: await anthropicCall(), provider: "anthropic" };
  } catch (error) {
    if (shouldFailoverToOpenAI(error) && hasOpenAIKey()) {
      console.warn(
        "Claude call failed; failing over to OpenAI:",
        error instanceof Error ? error.message : error,
      );
      return { result: await openaiCall(), provider: "openai" };
    }

    throw error;
  }
}

// Single OpenAI chat-completions call, shared by the text and structured paths.
async function openaiChat(
  body: Record<string, unknown>,
): Promise<{
  choices?: {
    message?: {
      content?: string;
      tool_calls?: { function?: { arguments?: string } }[];
    };
  }[];
}> {
  const key = process.env.OPENAI_API_KEY?.trim();

  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is not set, so Omni OS cannot fail over to OpenAI.",
    );
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({ model: OPENAI_FALLBACK_MODEL, ...body }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `OpenAI fallback failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  return response.json();
}

// --- Plain text generation ------------------------------------------------

async function anthropicText({
  system,
  user,
  maxTokens,
}: GenerateArgs): Promise<string> {
  const anthropic = new Anthropic({ apiKey: anthropicKey() });

  const response = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });

  const textBlock = response.content.find((block) => block.type === "text");

  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude did not return text");
  }

  return textBlock.text;
}

async function openaiText({
  system,
  user,
  maxTokens,
}: GenerateArgs): Promise<string> {
  const data = await openaiChat({
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("OpenAI fallback returned no text.");
  }

  return text;
}

/**
 * Generate free-form text from a system + user prompt. Tries Claude first and
 * fails over to OpenAI only when Claude is out of credits / rate limited /
 * overloaded.
 */
export async function generateAgentText(
  args: GenerateArgs,
): Promise<GenerateResult> {
  const { result, provider } = await withFailover(
    () => anthropicText(args),
    () => openaiText(args),
  );
  return { text: result, provider };
}

// --- Structured (schema-validated) generation -----------------------------

// Zod v4 emits the JSON Schema natively (no extra dependency). Strip the
// $schema URL — neither Anthropic's input_schema nor OpenAI's function
// parameters need it.
// Exported for the self-check in generate.check.ts.
export function toInputSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

async function anthropicStructured<T>(
  args: GenerateArgs,
  schema: z.ZodType<T>,
  toolName: string,
): Promise<T> {
  const anthropic = new Anthropic({ apiKey: anthropicKey() });

  const response = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: args.maxTokens,
    system: args.system,
    messages: [{ role: "user", content: args.user }],
    tools: [
      {
        name: toolName,
        description:
          "Record the result. Call this tool exactly once, filling in every field.",
        input_schema: toInputSchema(schema) as Anthropic.Tool.InputSchema,
      },
    ],
    // Force the tool so the reply is always a tool_use block, never prose.
    tool_choice: { type: "tool", name: toolName },
  });

  const block = response.content.find((b) => b.type === "tool_use");

  if (!block || block.type !== "tool_use") {
    throw new Error("Claude did not return structured output");
  }

  // block.input is already parsed JSON; Zod is the real correctness guarantee.
  return schema.parse(block.input);
}

async function openaiStructured<T>(
  args: GenerateArgs,
  schema: z.ZodType<T>,
  toolName: string,
): Promise<T> {
  const data = await openaiChat({
    max_tokens: args.maxTokens,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    tools: [
      {
        type: "function",
        function: { name: toolName, parameters: toInputSchema(schema) },
      },
    ],
    tool_choice: { type: "function", function: { name: toolName } },
  });

  const raw = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;

  if (!raw) {
    throw new Error("OpenAI fallback returned no structured output.");
  }

  return schema.parse(JSON.parse(raw));
}

/**
 * Generate a value that is guaranteed to match `schema`. The model is forced to
 * call a single tool whose parameters are the schema, so it hands back parsed
 * JSON rather than text — no backtick-stripping, no JSON.parse on prose. The
 * returned data has passed `schema.parse`, so callers can trust its shape.
 */
export async function generateStructured<T>(
  args: GenerateArgs & { schema: z.ZodType<T>; toolName?: string },
): Promise<StructuredResult<T>> {
  const toolName = args.toolName ?? "record_result";
  const { result, provider } = await withFailover(
    () => anthropicStructured(args, args.schema, toolName),
    () => openaiStructured(args, args.schema, toolName),
  );
  return { data: result, provider };
}
