import { NextResponse } from "next/server";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  proposalId: z.string().uuid("A valid proposal ID is required"),
});

type ProposalRecord = {
  id: string;
  project_brief_id: string | null;
  client_id: string | null;
  proposal_summary: string | null;
  approved: boolean | null;
};

type ClientRecord = {
  id: string;
  name: string | null;
  company: string | null;
};

type BriefRecord = {
  id: string;
  project_type: string | null;
  problem: string | null;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

function buildProjectName(
  client: ClientRecord | null,
  brief: BriefRecord | null,
  proposal: ProposalRecord,
) {
  const owner =
    client?.company?.trim() || client?.name?.trim() || "Client";
  const descriptor =
    brief?.project_type?.trim() ||
    proposal.proposal_summary?.trim() ||
    "Project";
  const trimmedDescriptor =
    descriptor.length > 80 ? `${descriptor.slice(0, 80).trimEnd()}…` : descriptor;

  return `${owner} - ${trimmedDescriptor}`;
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Create project from proposal API route is working",
  });
}

export async function POST(req: Request) {
  try {
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
    const { proposalId } = requestSchema.parse(body);

    const { data: proposalData, error: proposalError } = await supabase
      .from("proposals")
      .select(
        "id, project_brief_id, client_id, proposal_summary, approved",
      )
      .eq("id", proposalId)
      .eq("user_id", user.id)
      .single();

    if (proposalError || !proposalData) {
      return NextResponse.json(
        {
          success: false,
          error: "Proposal not found",
          details: proposalError?.message,
        },
        { status: 404 },
      );
    }

    const proposal = proposalData as ProposalRecord;

    if (!proposal.approved) {
      return NextResponse.json(
        {
          success: false,
          error: "Proposal must be approved before creating a project.",
        },
        { status: 400 },
      );
    }

    // Return the existing project instead of creating a duplicate.
    const { data: existingProject, error: existingError } = await supabase
      .from("projects")
      .select("*")
      .eq("proposal_id", proposal.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingError && existingError.code !== "PGRST116") {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to check for existing project",
          details: existingError.message,
        },
        { status: 500 },
      );
    }

    if (existingProject) {
      return NextResponse.json({
        success: true,
        project: existingProject,
      });
    }

    let client: ClientRecord | null = null;

    if (proposal.client_id) {
      const { data: clientData } = await supabase
        .from("clients")
        .select("id, name, company")
        .eq("id", proposal.client_id)
        .eq("user_id", user.id)
        .maybeSingle();

      client = (clientData as ClientRecord | null) ?? null;
    }

    let brief: BriefRecord | null = null;

    if (proposal.project_brief_id) {
      const { data: briefData } = await supabase
        .from("project_briefs")
        .select("id, project_type, problem")
        .eq("id", proposal.project_brief_id)
        .eq("user_id", user.id)
        .maybeSingle();

      brief = (briefData as BriefRecord | null) ?? null;
    }

    const projectName = buildProjectName(client, brief, proposal);
    const projectDescription =
      proposal.proposal_summary?.trim() || brief?.problem?.trim() || null;

    const { data: createdProject, error: createError } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        client_id: proposal.client_id,
        proposal_id: proposal.id,
        project_brief_id: proposal.project_brief_id,
        name: projectName,
        description: projectDescription,
        status: "planning",
        priority: "medium",
      })
      .select()
      .single();

    if (createError || !createdProject) {
      console.error("Project insert error:", createError);

      return NextResponse.json(
        {
          success: false,
          error: "Failed to create project",
          details: createError?.message,
        },
        { status: 500 },
      );
    }

    const projectId = createdProject.id as string;

    // Link related records to the new project. Each update is best-effort and
    // scoped to this user; a missing project_id column degrades gracefully.
    await supabase
      .from("proposals")
      .update({ project_id: projectId })
      .eq("id", proposal.id)
      .eq("user_id", user.id);

    if (proposal.project_brief_id) {
      await supabase
        .from("project_briefs")
        .update({ project_id: projectId })
        .eq("id", proposal.project_brief_id)
        .eq("user_id", user.id);
    }

    const relatedByProposal = [
      "build_tasks",
      "github_issue_drafts",
      "launch_checklists",
      "launch_checklist_items",
    ];

    for (const table of relatedByProposal) {
      await supabase
        .from(table)
        .update({ project_id: projectId })
        .eq("proposal_id", proposal.id)
        .eq("user_id", user.id);
    }

    return NextResponse.json({
      success: true,
      project: createdProject,
    });
  } catch (error: unknown) {
    console.error("Create project from proposal error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid create project request",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to create project",
        details: getErrorMessage(error),
      },
      { status: 500 },
    );
  }
}
