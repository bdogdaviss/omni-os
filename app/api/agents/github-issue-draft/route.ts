import { NextResponse } from "next/server";
import { z } from "zod";

import { generateAgentText } from "@/lib/ai/generate";
import { isDuplicateDatabaseError } from "@/lib/duplicates/normalize";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  taskId: z.string().uuid("A valid task ID is required"),
});

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

const issueDraftSchema = z.object({
  title: z.string().min(1, "Issue title is required"),
  body: z.string().min(1, "Issue body is required"),
  labels: labelsSchema,
});

const issueDraftAgentPrompt = `
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

type TaskRecord = {
  id: string;
  proposal_id: string | null;
  client_id: string | null;
  title: string | null;
  description: string | null;
  category: string | null;
  priority: string | null;
  estimated_effort: string | null;
  acceptance_criteria: unknown;
  dependencies: unknown;
  status: string | null;
};

type ClientRecord = {
  id: string;
  name: string | null;
  company: string | null;
  website: string | null;
};

type ProposalRecord = {
  id: string;
  project_brief_id: string | null;
  proposal_summary: string | null;
  approved: boolean | null;
};

type BriefRecord = {
  id: string;
  project_type: string | null;
  problem: string | null;
  mvp_features: unknown;
  estimated_complexity: string | null;
};

function cleanJsonText(text: string) {
  return text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "GitHub Issue Draft API route is working",
  });
}

export async function POST(req: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No AI provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.",
        },
        { status: 500 },
      );
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: "Not authenticated. Please log in first.",
        },
        { status: 401 },
      );
    }

    const body: unknown = await req.json();
    const { taskId } = requestSchema.parse(body);

    const { data: taskData, error: taskError } = await supabase
      .from("build_tasks")
      .select(
        "id, proposal_id, client_id, title, description, category, priority, estimated_effort, acceptance_criteria, dependencies, status",
      )
      .eq("id", taskId)
      .eq("user_id", user.id)
      .single();

    if (taskError || !taskData) {
      return NextResponse.json(
        {
          success: false,
          error: "Build task not found",
          details: taskError?.message,
        },
        { status: 404 },
      );
    }

    const task = taskData as TaskRecord;

    // Duplicate draft check — before calling Claude so no tokens are wasted.
    // One issue draft per build task.
    const { data: existingDrafts, error: existingDraftError } = await supabase
      .from("github_issue_drafts")
      .select("id")
      .eq("user_id", user.id)
      .eq("task_id", task.id)
      .limit(1);

    if (existingDraftError) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to check for existing issue draft",
          details: existingDraftError.message,
        },
        { status: 500 },
      );
    }

    if (existingDrafts && existingDrafts.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Duplicate issue draft",
          details: "Issue draft already exists for this task.",
          existingDraftId: existingDrafts[0].id,
        },
        { status: 409 },
      );
    }

    let client: ClientRecord | null = null;

    if (task.client_id) {
      const { data: clientData } = await supabase
        .from("clients")
        .select("id, name, company, website")
        .eq("id", task.client_id)
        .eq("user_id", user.id)
        .maybeSingle();

      client = (clientData as ClientRecord | null) ?? null;
    }

    let proposal: ProposalRecord | null = null;

    if (task.proposal_id) {
      const { data: proposalData } = await supabase
        .from("proposals")
        .select("id, project_brief_id, proposal_summary, approved")
        .eq("id", task.proposal_id)
        .eq("user_id", user.id)
        .maybeSingle();

      proposal = (proposalData as ProposalRecord | null) ?? null;
    }

    let brief: BriefRecord | null = null;

    if (proposal?.project_brief_id) {
      const { data: briefData } = await supabase
        .from("project_briefs")
        .select("id, project_type, problem, mvp_features, estimated_complexity")
        .eq("id", proposal.project_brief_id)
        .eq("user_id", user.id)
        .maybeSingle();

      brief = (briefData as BriefRecord | null) ?? null;
    }

    const { text } = await generateAgentText({
      system: issueDraftAgentPrompt,
      maxTokens: 2500,
      user: `
Build task:
${JSON.stringify(task, null, 2)}

Client:
${JSON.stringify(client, null, 2)}

Proposal:
${JSON.stringify(proposal, null, 2)}

Project brief:
${JSON.stringify(brief, null, 2)}
          `,
    });

    const cleanedText = cleanJsonText(text);
    const issueDraft = issueDraftSchema.parse(JSON.parse(cleanedText));

    const { data: savedDraft, error: insertError } = await supabase
      .from("github_issue_drafts")
      .insert({
        user_id: user.id,
        task_id: task.id,
        client_id: task.client_id,
        proposal_id: task.proposal_id,
        title: issueDraft.title,
        body: issueDraft.body,
        labels: issueDraft.labels.slice(0, 6),
        status: "draft",
        copied: false,
      })
      .select()
      .single();

    if (insertError || !savedDraft) {
      console.error("Issue draft insert error:", insertError);

      if (isDuplicateDatabaseError(insertError)) {
        return NextResponse.json(
          {
            success: false,
            error: "Duplicate issue draft",
            details: "Issue draft already exists for this task.",
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: "Failed to save issue draft",
          details: insertError?.message,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      issueDraft: savedDraft,
    });
  } catch (error: unknown) {
    console.error("GitHub issue draft agent error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid issue draft request or response",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate issue draft",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
