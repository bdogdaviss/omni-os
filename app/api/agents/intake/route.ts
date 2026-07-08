import { NextResponse } from "next/server";
import { z } from "zod";

import { generateAgentText } from "@/lib/ai/generate";
import {
  isDuplicateDatabaseError,
  normalizeText,
} from "@/lib/duplicates/normalize";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  clientName: z.string().min(1, "Client name is required"),
  company: z.string().optional().default(""),
  email: z.string().optional().default(""),
  website: z.string().optional().default(""),
  rawMessage: z.string().min(10, "Client message is too short"),
  budgetRange: z.string().optional().default(""),
  timeline: z.string().optional().default(""),
});

const intakeAgentPrompt = `
You are Omni Strive's Client Intake Agent.

Omni Strive builds mobile apps, web platforms, AI integrations, dashboards, automations, and software products for clients.

Your job is to turn messy client information into a clean internal project brief.

Rules:
1. Be practical.
2. Do not overbuild.
3. Separate MVP features from future features.
4. Identify missing questions before a proposal is made.
5. Estimate complexity as low, medium, or high.
6. Do not promise final pricing.
7. Return only valid JSON.
8. Do not include markdown.
9. Do not wrap the JSON in triple backticks.

Return this exact JSON shape:

{
  "project_type": "",
  "problem": "",
  "mvp_features": [],
  "future_features": [],
  "questions_to_ask": [],
  "estimated_complexity": "low",
  "next_step": ""
}
`;

function cleanJsonText(text: string) {
  return text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: "Intake API route is working",
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
        { status: 500 }
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
        { status: 401 }
      );
    }

    const body = await req.json();
    const data = requestSchema.parse(body);

    // Duplicate client check — before creating anything and before calling
    // Claude, so duplicate submissions never waste tokens.
    const normalizedName = normalizeText(data.clientName);
    const normalizedEmail = normalizeText(data.email);

    const { data: existingClients, error: existingClientsError } =
      await supabase
        .from("clients")
        .select("id, name, email, company")
        .eq("user_id", user.id);

    if (existingClientsError) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to check for existing clients",
          details: existingClientsError.message,
        },
        { status: 500 }
      );
    }

    const duplicateByName = (existingClients ?? []).find(
      (existing) => normalizeText(existing.name) === normalizedName
    );

    if (duplicateByName) {
      return NextResponse.json(
        {
          success: false,
          error: "Duplicate client",
          details: "A client with this name already exists.",
          existingClientId: duplicateByName.id,
        },
        { status: 409 }
      );
    }

    if (normalizedEmail) {
      const duplicateByEmail = (existingClients ?? []).find(
        (existing) => normalizeText(existing.email) === normalizedEmail
      );

      if (duplicateByEmail) {
        return NextResponse.json(
          {
            success: false,
            error: "Duplicate client",
            details: "A client with this email already exists.",
            existingClientId: duplicateByEmail.id,
          },
          { status: 409 }
        );
      }
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .insert({
        user_id: user.id,
        name: data.clientName,
        company: data.company || null,
        email: data.email || null,
        website: data.website || null,
      })
      .select()
      .single();

    if (clientError || !client) {
      console.error("Client insert error:", clientError);

      if (isDuplicateDatabaseError(clientError)) {
        return NextResponse.json(
          {
            success: false,
            error: "Duplicate client",
            details: "A client with this name or email already exists.",
          },
          { status: 409 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: "Failed to create client",
          details: clientError?.message,
        },
        { status: 500 }
      );
    }

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .insert({
        user_id: user.id,
        client_id: client.id,
        source: "manual",
        raw_message: data.rawMessage,
        budget_range: data.budgetRange || null,
        timeline: data.timeline || null,
        status: "new",
      })
      .select()
      .single();

    if (leadError || !lead) {
      console.error("Lead insert error:", leadError);

      return NextResponse.json(
        {
          success: false,
          error: "Failed to create lead",
          details: leadError?.message,
        },
        { status: 500 }
      );
    }

    const { text } = await generateAgentText({
      system: intakeAgentPrompt,
      maxTokens: 1200,
      user: `
Client name: ${data.clientName}
Company: ${data.company}
Email: ${data.email}
Website: ${data.website}
Budget range: ${data.budgetRange}
Timeline: ${data.timeline}

Raw client message:
${data.rawMessage}
          `,
    });

    const cleanedText = cleanJsonText(text);
    const brief = JSON.parse(cleanedText);

    const { data: savedBrief, error: briefError } = await supabase
      .from("project_briefs")
      .insert({
        user_id: user.id,
        lead_id: lead.id,
        client_id: client.id,
        project_type: brief.project_type,
        problem: brief.problem,
        mvp_features: brief.mvp_features,
        future_features: brief.future_features,
        questions_to_ask: brief.questions_to_ask,
        estimated_complexity: brief.estimated_complexity,
        next_step: brief.next_step,
        approved: false,
      })
      .select()
      .single();

    if (briefError || !savedBrief) {
      console.error("Project brief insert error:", briefError);

      return NextResponse.json(
        {
          success: false,
          error: "Failed to save project brief",
          details: briefError?.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      client,
      lead,
      brief: savedBrief,
    });
  } catch (error: any) {
    console.error("Intake agent error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to generate project brief",
        details: error?.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
