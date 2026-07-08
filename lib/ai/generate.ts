// Shared text generation for Omni OS's agents, with automatic failover.
//
// Primary: Anthropic (Claude Haiku by default). If a Claude call fails because
// the credit balance is exhausted, the account is rate-limited, or the API is
// overloaded, the SAME request is retried against OpenAI using OPENAI_API_KEY.
// Day to day this stays on cheap Claude; OpenAI is only the safety net.

import Anthropic from "@anthropic-ai/sdk";

type GenerateArgs = {
  system: string;
  user: string;
  maxTokens: number;
};

export type GenerateResult = {
  text: string;
  provider: "anthropic" | "openai";
};

const OPENAI_FALLBACK_MODEL =
  process.env.OPENAI_FALLBACK_MODEL || "gpt-4o-mini";

// Decide whether a Claude failure is the kind we should fail over on:
// out of credits, rate limited, or the service is overloaded. A genuine bug
// (bad request, invalid prompt) should NOT silently switch providers.
function shouldFailoverToOpenAI(error: unknown): boolean {
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
    message.includes("rate limit") ||
    message.includes("overloaded")
  );
}

function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

async function callOpenAI({
  system,
  user,
  maxTokens,
}: GenerateArgs): Promise<string> {
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
    body: JSON.stringify({
      model: OPENAI_FALLBACK_MODEL,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `OpenAI fallback failed (${response.status}): ${detail.slice(0, 300)}`,
    );
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error("OpenAI fallback returned no text.");
  }

  return text;
}

/**
 * Generate text from a system + user prompt. Tries Claude first and fails over
 * to OpenAI only when Claude is out of credits / rate limited / overloaded.
 */
export async function generateAgentText(
  args: GenerateArgs,
): Promise<GenerateResult> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();

  // No Claude key at all — use OpenAI directly if it's configured.
  if (!anthropicKey) {
    if (!hasOpenAIKey()) {
      throw new Error(
        "No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
      );
    }
    return { text: await callOpenAI(args), provider: "openai" };
  }

  const anthropic = new Anthropic({ apiKey: anthropicKey });

  try {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001",
      max_tokens: args.maxTokens,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
    });

    const textBlock = response.content.find((block) => block.type === "text");

    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude did not return text");
    }

    return { text: textBlock.text, provider: "anthropic" };
  } catch (error) {
    if (shouldFailoverToOpenAI(error) && hasOpenAIKey()) {
      console.warn(
        "Claude call failed; failing over to OpenAI:",
        error instanceof Error ? error.message : error,
      );
      return { text: await callOpenAI(args), provider: "openai" };
    }

    throw error;
  }
}
