-- Automation settings: the global pause switch.
--
-- One row per operator. When paused = true, the pipeline stops acting on its
-- own: the webhook holds green PR checks (the run flips to blocked with a
-- "paused" reason instead of merging/dispatching) and new runs cannot start.
-- Records keep mirroring external state (issue closed -> task done) — pause
-- stops actions, not bookkeeping.

create table if not exists "public"."automation_settings" (
    "user_id" uuid not null primary key references auth.users(id) on delete cascade,
    "paused" boolean not null default false,
    "updated_at" timestamp with time zone default now()
);

alter table "public"."automation_settings" enable row level security;

create policy "Authenticated users can manage their automation settings"
    on "public"."automation_settings" to "authenticated"
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

grant all on table "public"."automation_settings" to "anon";
grant all on table "public"."automation_settings" to "authenticated";
grant all on table "public"."automation_settings" to "service_role";
