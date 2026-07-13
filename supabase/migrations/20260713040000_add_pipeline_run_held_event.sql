-- A green PR check that arrives while automation is paused is HELD, not
-- dropped: the event's coordinates land here and resuming automation replays
-- the merge + next dispatch. Null on every run blocked by a real failure.

alter table "public"."pipeline_runs"
    add column if not exists "held_event" jsonb;
