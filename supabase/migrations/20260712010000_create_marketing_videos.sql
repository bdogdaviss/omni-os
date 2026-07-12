-- Video jobs for the Marketing Studio.
--
-- A job is a mutable state machine (unlike kits, which are immutable events in
-- activity_events): requested -> responded_no_video | video_ready | failed,
-- and later approved/sent once a real video source exists.
--
-- Dev-test reality, on the record: the current pipeline sends the prompt to a
-- text model, which CANNOT return a video, so every job ends at
-- responded_no_video with the model's text reply stored. video_url stays null
-- until a real producer (the Playwright screen-recording agent) fills it; the
-- UI renders a player and the approve/send flow only when it does.

create table if not exists "public"."marketing_videos" (
    "id" uuid default gen_random_uuid() not null primary key,
    "user_id" uuid default auth.uid() references auth.users(id),
    "client_id" uuid references public.clients(id) on delete set null,
    "kit_event_id" uuid references public.activity_events(id) on delete set null,
    "video_type" text,
    "title" text,
    "prompt" text not null,
    "status" text not null default 'requested',
    "provider" text,
    "model_response" text,
    "video_url" text,
    "approved" boolean not null default false,
    "sent_to_client_at" timestamp with time zone,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);

alter table "public"."marketing_videos" enable row level security;

create policy "Authenticated users can manage their marketing videos"
    on "public"."marketing_videos" to "authenticated"
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

grant all on table "public"."marketing_videos" to "anon";
grant all on table "public"."marketing_videos" to "authenticated";
grant all on table "public"."marketing_videos" to "service_role";
