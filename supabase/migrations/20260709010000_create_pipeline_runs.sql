-- Pipeline runs: the state machine behind the automated build pipeline.
--
-- One row per approved build. The queue is the dependency-ordered list of
-- build_task ids; position points at the task currently dispatched to the
-- coding agent. State advances from the GitHub webhook (PR check green ->
-- merge -> next task), so this table is what survives between serverless
-- invocations.
--
-- status: running  -> a task is dispatched (or about to be)
--         blocked  -> a task failed (agent died, CI red, merge conflict);
--                     nothing advances until a human intervenes
--         completed / canceled -> terminal

create table if not exists "public"."pipeline_runs" (
    "id" uuid default gen_random_uuid() not null primary key,
    "user_id" uuid default auth.uid() references auth.users(id),
    "proposal_id" uuid references public.proposals(id) on delete cascade,
    "repository_id" uuid references public.github_repositories(id) on delete set null,
    "status" text not null default 'running',
    "task_queue" jsonb not null default '[]'::jsonb,
    "position" integer not null default 0,
    "last_error" text,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);

alter table "public"."pipeline_runs" enable row level security;

create policy "Authenticated users can manage their pipeline runs"
    on "public"."pipeline_runs" to "authenticated"
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

grant all on table "public"."pipeline_runs" to "anon";
grant all on table "public"."pipeline_runs" to "authenticated";
grant all on table "public"."pipeline_runs" to "service_role";

-- One live run per proposal; finished runs keep their history.
create unique index if not exists pipeline_runs_one_active_per_proposal
    on "public"."pipeline_runs" (proposal_id)
    where status in ('running', 'blocked');
