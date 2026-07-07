import { NextResponse } from "next/server";

import { githubEnvReadiness } from "@/lib/github/validation";

// Safe health route: returns configuration booleans only.
// Never reveals env values. Never calls GitHub.
export async function GET(req: Request) {
  // Touch the request so this route is always evaluated at request time,
  // keeping the env readiness booleans live instead of frozen at build.
  void new URL(req.url);

  const readiness = githubEnvReadiness();

  return NextResponse.json({
    success: true,
    message: "GitHub settings health route is working",
    githubAppIdConfigured: readiness.githubAppIdConfigured,
    githubAppSlugConfigured: readiness.githubAppSlugConfigured,
    githubPrivateKeyConfigured: readiness.githubPrivateKeyConfigured,
    githubWebhookSecretConfigured: readiness.githubWebhookSecretConfigured,
    realPublishingEnabled: readiness.realPublishingEnabled,
  });
}
