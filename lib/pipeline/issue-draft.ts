// The GitHub issue-draft generation contract, shared by two callers: the
// manual route (app/api/agents/github-issue-draft) and the automated pipeline
// (lib/pipeline/run.ts). One prompt, one schema — the issues an agent builds
// from must not depend on which path created them.

import { z } from "zod";

const labelsSchema = z.preprocess((value) => {
  if (Array.isArray(value)) {
    return value.map((item) =>
      typeof item === "string" ? item : JSON.stringify(item),
    );
  }

  if (typeof value === "string" && value.trim()) {
    return [value];
  }

  return [];
}, z.array(z.string()));

export const issueDraftSchema = z.object({
  title: z.string().min(1, "Issue title is required"),
  body: z.string().min(1, "Issue body is required"),
  labels: labelsSchema,
});

export const issueDraftAgentPrompt = `
You are Omni Strive's GitHub Issue Draft Agent.

Omni Strive builds mobile apps, web platforms, AI integrations, dashboards, automations, and software products for clients.

Your job is to turn an internal build task into a clean GitHub issue draft.

Rules:
1. Create a developer-ready GitHub issue draft.
2. Be specific and practical.
3. Do not create vague issues.
4. Do not include pricing.
5. Do not include legal terms.
6. Do not include private client secrets.
7. Do not call GitHub.
8. Do not create real issues.
9. Do not send anything externally.
10. Include acceptance criteria.
11. Include implementation notes if useful.
12. Include testing notes.
13. Include suggested labels.
14. Return only valid JSON.
15. Do not include markdown outside the JSON.
16. Do not wrap JSON in triple backticks.

Return this exact JSON shape:

{
  "title": "",
  "body": "",
  "labels": []
}

The body should be formatted as GitHub markdown and include these sections:

## Summary
Explain the task in 2 to 4 sentences.

## Context
Explain why this is needed based on the client/project.

## Requirements
- Requirement 1
- Requirement 2
- Requirement 3

## Acceptance Criteria
- Criteria 1
- Criteria 2
- Criteria 3

## Implementation Notes
- Note 1
- Note 2

## Testing Notes
- Test 1
- Test 2

Labels should be practical and lowercase, like:
frontend
backend
database
ai
auth
integrations
testing
launch
priority-low
priority-medium
priority-high

Do not include more than 6 labels.
`;

export function buildIssueDraftUserPrompt(
  task: unknown,
  client: unknown,
  proposal: unknown,
  brief: unknown,
) {
  return `
Build task:
${JSON.stringify(task, null, 2)}

Client:
${JSON.stringify(client, null, 2)}

Proposal:
${JSON.stringify(proposal, null, 2)}

Project brief:
${JSON.stringify(brief, null, 2)}
          `;
}
