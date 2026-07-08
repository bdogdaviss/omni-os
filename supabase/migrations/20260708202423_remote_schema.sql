


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";





SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activity_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "client_id" "uuid",
    "project_id" "uuid",
    "event_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."activity_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."build_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "proposal_id" "uuid",
    "client_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "priority" "text" DEFAULT 'medium'::"text",
    "estimated_effort" "text",
    "acceptance_criteria" "jsonb" DEFAULT '[]'::"jsonb",
    "dependencies" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'draft'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid",
    "owner" "text",
    "due_date" "date",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."build_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."client_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "client_id" "uuid",
    "note" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."client_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "name" "text" NOT NULL,
    "company" "text",
    "email" "text",
    "website" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."github_integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "integration_type" "text" DEFAULT 'github_app'::"text",
    "installation_id" "text",
    "account_login" "text",
    "account_type" "text",
    "connected" boolean DEFAULT false,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."github_integrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."github_issue_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "task_id" "uuid",
    "client_id" "uuid",
    "proposal_id" "uuid",
    "title" "text" NOT NULL,
    "body" "text" NOT NULL,
    "labels" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'draft'::"text",
    "copied" boolean DEFAULT false,
    "copied_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid",
    "github_repo" "text",
    "github_issue_number" integer,
    "github_issue_url" "text",
    "published_to_github" boolean DEFAULT false,
    "published_at" timestamp with time zone,
    "publish_status" "text" DEFAULT 'draft'::"text",
    "publish_error" "text",
    "selected_repository_id" "uuid"
);


ALTER TABLE "public"."github_issue_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."github_issue_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "issue_draft_id" "uuid",
    "task_id" "uuid",
    "project_id" "uuid",
    "client_id" "uuid",
    "repository_id" "uuid",
    "repository_full_name" "text" NOT NULL,
    "issue_number" integer,
    "issue_url" "text",
    "status" "text" DEFAULT 'planned'::"text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."github_issue_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."github_repositories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "integration_id" "uuid",
    "github_repo_id" "text",
    "installation_id" "text",
    "owner" "text" NOT NULL,
    "name" "text" NOT NULL,
    "full_name" "text" NOT NULL,
    "private" boolean DEFAULT true,
    "selected" boolean DEFAULT true,
    "default_for_projects" boolean DEFAULT false,
    "synced_from_github" boolean DEFAULT false,
    "has_issues" boolean DEFAULT true,
    "archived" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."github_repositories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."launch_checklist_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "checklist_id" "uuid",
    "client_id" "uuid",
    "proposal_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "priority" "text" DEFAULT 'medium'::"text",
    "status" "text" DEFAULT 'not_started'::"text",
    "verification_steps" "jsonb" DEFAULT '[]'::"jsonb",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid"
);


ALTER TABLE "public"."launch_checklist_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."launch_checklists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "client_id" "uuid",
    "proposal_id" "uuid",
    "title" "text" NOT NULL,
    "summary" "text",
    "overall_status" "text" DEFAULT 'draft'::"text",
    "readiness_score" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid"
);


ALTER TABLE "public"."launch_checklists" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "client_id" "uuid",
    "source" "text" DEFAULT 'manual'::"text",
    "raw_message" "text" NOT NULL,
    "budget_range" "text",
    "timeline" "text",
    "status" "text" DEFAULT 'new'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid"
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_briefs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "lead_id" "uuid",
    "client_id" "uuid",
    "project_type" "text",
    "problem" "text",
    "mvp_features" "jsonb" DEFAULT '[]'::"jsonb",
    "future_features" "jsonb" DEFAULT '[]'::"jsonb",
    "questions_to_ask" "jsonb" DEFAULT '[]'::"jsonb",
    "estimated_complexity" "text",
    "next_step" "text",
    "approved" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "project_id" "uuid"
);


ALTER TABLE "public"."project_briefs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "project_id" "uuid",
    "note" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."project_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "client_id" "uuid",
    "proposal_id" "uuid",
    "project_brief_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'planning'::"text",
    "priority" "text" DEFAULT 'medium'::"text",
    "target_launch_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."proposals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" DEFAULT "auth"."uid"(),
    "project_brief_id" "uuid",
    "client_id" "uuid",
    "proposal_summary" "text",
    "lean_mvp" "jsonb" DEFAULT '{}'::"jsonb",
    "core_build" "jsonb" DEFAULT '{}'::"jsonb",
    "full_launch" "jsonb" DEFAULT '{}'::"jsonb",
    "assumptions" "jsonb" DEFAULT '[]'::"jsonb",
    "out_of_scope" "jsonb" DEFAULT '[]'::"jsonb",
    "follow_up_message" "text",
    "approved" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "sent" boolean DEFAULT false,
    "sent_at" timestamp with time zone,
    "sent_method" "text",
    "project_id" "uuid"
);


ALTER TABLE "public"."proposals" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_events"
    ADD CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."build_tasks"
    ADD CONSTRAINT "build_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."client_notes"
    ADD CONSTRAINT "client_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."github_integrations"
    ADD CONSTRAINT "github_integrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."github_issue_drafts"
    ADD CONSTRAINT "github_issue_drafts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."github_issue_links"
    ADD CONSTRAINT "github_issue_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."github_repositories"
    ADD CONSTRAINT "github_repositories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."launch_checklist_items"
    ADD CONSTRAINT "launch_checklist_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."launch_checklists"
    ADD CONSTRAINT "launch_checklists_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_briefs"
    ADD CONSTRAINT "project_briefs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_notes"
    ADD CONSTRAINT "project_notes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "github_repositories_user_full_name_unique" ON "public"."github_repositories" USING "btree" ("user_id", "full_name");



ALTER TABLE ONLY "public"."activity_events"
    ADD CONSTRAINT "activity_events_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activity_events"
    ADD CONSTRAINT "activity_events_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activity_events"
    ADD CONSTRAINT "activity_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."build_tasks"
    ADD CONSTRAINT "build_tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."build_tasks"
    ADD CONSTRAINT "build_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."build_tasks"
    ADD CONSTRAINT "build_tasks_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."build_tasks"
    ADD CONSTRAINT "build_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."client_notes"
    ADD CONSTRAINT "client_notes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."client_notes"
    ADD CONSTRAINT "client_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."github_integrations"
    ADD CONSTRAINT "github_integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."github_issue_drafts"
    ADD CONSTRAINT "github_issue_drafts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."github_issue_drafts"
    ADD CONSTRAINT "github_issue_drafts_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."github_issue_drafts"
    ADD CONSTRAINT "github_issue_drafts_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."github_issue_drafts"
    ADD CONSTRAINT "github_issue_drafts_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."build_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."github_issue_drafts"
    ADD CONSTRAINT "github_issue_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."github_issue_links"
    ADD CONSTRAINT "github_issue_links_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."github_issue_links"
    ADD CONSTRAINT "github_issue_links_issue_draft_id_fkey" FOREIGN KEY ("issue_draft_id") REFERENCES "public"."github_issue_drafts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."github_issue_links"
    ADD CONSTRAINT "github_issue_links_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."github_issue_links"
    ADD CONSTRAINT "github_issue_links_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "public"."github_repositories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."github_issue_links"
    ADD CONSTRAINT "github_issue_links_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."build_tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."github_issue_links"
    ADD CONSTRAINT "github_issue_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."github_repositories"
    ADD CONSTRAINT "github_repositories_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "public"."github_integrations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."github_repositories"
    ADD CONSTRAINT "github_repositories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."launch_checklist_items"
    ADD CONSTRAINT "launch_checklist_items_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "public"."launch_checklists"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."launch_checklist_items"
    ADD CONSTRAINT "launch_checklist_items_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."launch_checklist_items"
    ADD CONSTRAINT "launch_checklist_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."launch_checklist_items"
    ADD CONSTRAINT "launch_checklist_items_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."launch_checklist_items"
    ADD CONSTRAINT "launch_checklist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."launch_checklists"
    ADD CONSTRAINT "launch_checklists_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."launch_checklists"
    ADD CONSTRAINT "launch_checklists_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."launch_checklists"
    ADD CONSTRAINT "launch_checklists_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."launch_checklists"
    ADD CONSTRAINT "launch_checklists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."project_briefs"
    ADD CONSTRAINT "project_briefs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_briefs"
    ADD CONSTRAINT "project_briefs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_briefs"
    ADD CONSTRAINT "project_briefs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."project_briefs"
    ADD CONSTRAINT "project_briefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."project_notes"
    ADD CONSTRAINT "project_notes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_notes"
    ADD CONSTRAINT "project_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_project_brief_id_fkey" FOREIGN KEY ("project_brief_id") REFERENCES "public"."project_briefs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_proposal_id_fkey" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_project_brief_id_fkey" FOREIGN KEY ("project_brief_id") REFERENCES "public"."project_briefs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."proposals"
    ADD CONSTRAINT "proposals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



CREATE POLICY "Authenticated users can manage their activity events" ON "public"."activity_events" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can manage their build tasks" ON "public"."build_tasks" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can manage their client notes" ON "public"."client_notes" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can manage their clients" ON "public"."clients" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can manage their github integrations" ON "public"."github_integrations" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can manage their github issue drafts" ON "public"."github_issue_drafts" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can manage their github issue links" ON "public"."github_issue_links" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can manage their github repositories" ON "public"."github_repositories" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can manage their launch checklist items" ON "public"."launch_checklist_items" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can manage their launch checklists" ON "public"."launch_checklists" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can manage their leads" ON "public"."leads" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can manage their project briefs" ON "public"."project_briefs" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can manage their project notes" ON "public"."project_notes" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can manage their projects" ON "public"."projects" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can manage their proposals" ON "public"."proposals" TO "authenticated" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."activity_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."build_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."client_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."github_integrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."github_issue_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."github_issue_links" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."github_repositories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."launch_checklist_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."launch_checklists" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_briefs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."proposals" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";





































































































































































GRANT ALL ON TABLE "public"."activity_events" TO "anon";
GRANT ALL ON TABLE "public"."activity_events" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_events" TO "service_role";



GRANT ALL ON TABLE "public"."build_tasks" TO "anon";
GRANT ALL ON TABLE "public"."build_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."build_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."client_notes" TO "anon";
GRANT ALL ON TABLE "public"."client_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."client_notes" TO "service_role";



GRANT ALL ON TABLE "public"."clients" TO "anon";
GRANT ALL ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT ALL ON TABLE "public"."github_integrations" TO "anon";
GRANT ALL ON TABLE "public"."github_integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."github_integrations" TO "service_role";



GRANT ALL ON TABLE "public"."github_issue_drafts" TO "anon";
GRANT ALL ON TABLE "public"."github_issue_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."github_issue_drafts" TO "service_role";



GRANT ALL ON TABLE "public"."github_issue_links" TO "anon";
GRANT ALL ON TABLE "public"."github_issue_links" TO "authenticated";
GRANT ALL ON TABLE "public"."github_issue_links" TO "service_role";



GRANT ALL ON TABLE "public"."github_repositories" TO "anon";
GRANT ALL ON TABLE "public"."github_repositories" TO "authenticated";
GRANT ALL ON TABLE "public"."github_repositories" TO "service_role";



GRANT ALL ON TABLE "public"."launch_checklist_items" TO "anon";
GRANT ALL ON TABLE "public"."launch_checklist_items" TO "authenticated";
GRANT ALL ON TABLE "public"."launch_checklist_items" TO "service_role";



GRANT ALL ON TABLE "public"."launch_checklists" TO "anon";
GRANT ALL ON TABLE "public"."launch_checklists" TO "authenticated";
GRANT ALL ON TABLE "public"."launch_checklists" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."project_briefs" TO "anon";
GRANT ALL ON TABLE "public"."project_briefs" TO "authenticated";
GRANT ALL ON TABLE "public"."project_briefs" TO "service_role";



GRANT ALL ON TABLE "public"."project_notes" TO "anon";
GRANT ALL ON TABLE "public"."project_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."project_notes" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."proposals" TO "anon";
GRANT ALL ON TABLE "public"."proposals" TO "authenticated";
GRANT ALL ON TABLE "public"."proposals" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































