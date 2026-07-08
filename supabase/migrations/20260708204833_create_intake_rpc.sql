-- Atomic intake: create the client, lead, and project brief in one transaction.
--
-- A plpgsql function body runs inside a single transaction, so if any of the
-- three inserts fails the whole thing rolls back — no orphaned client + lead
-- rows left behind with no brief. Replaces three sequential inserts from the
-- API route, which had no rollback between them.
--
-- SECURITY INVOKER (the default) so the caller's RLS still applies; user_id is
-- pinned to auth.uid(), which every table's policy checks. search_path is
-- pinned empty and every reference is schema-qualified (Supabase lint / CVE
-- hardening).

create or replace function "public"."create_intake"(
  "p_client_name" text,
  "p_company" text,
  "p_email" text,
  "p_website" text,
  "p_raw_message" text,
  "p_budget_range" text,
  "p_timeline" text,
  "p_project_type" text,
  "p_problem" text,
  "p_mvp_features" jsonb,
  "p_future_features" jsonb,
  "p_questions_to_ask" jsonb,
  "p_estimated_complexity" text,
  "p_next_step" text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_client public.clients;
  v_lead public.leads;
  v_brief public.project_briefs;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.clients (user_id, name, company, email, website)
  values (v_user, p_client_name, p_company, p_email, p_website)
  returning * into v_client;

  insert into public.leads
    (user_id, client_id, source, raw_message, budget_range, timeline, status)
  values
    (v_user, v_client.id, 'manual', p_raw_message, p_budget_range, p_timeline, 'new')
  returning * into v_lead;

  insert into public.project_briefs
    (user_id, lead_id, client_id, project_type, problem,
     mvp_features, future_features, questions_to_ask,
     estimated_complexity, next_step, approved)
  values
    (v_user, v_lead.id, v_client.id, p_project_type, p_problem,
     p_mvp_features, p_future_features, p_questions_to_ask,
     p_estimated_complexity, p_next_step, false)
  returning * into v_brief;

  return jsonb_build_object(
    'client', to_jsonb(v_client),
    'lead', to_jsonb(v_lead),
    'brief', to_jsonb(v_brief)
  );
end;
$$;

-- Only authenticated users run intake; the anon role gets nothing.
grant execute on function "public"."create_intake"(
  text, text, text, text, text, text, text,
  text, text, jsonb, jsonb, jsonb, text, text
) to "authenticated";

notify pgrst, 'reload schema';
