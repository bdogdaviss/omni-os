#!/usr/bin/env bash
# Runnable check for the create_intake RPC
# (supabase/migrations/*_create_intake_rpc.sql): proves the client + lead +
# brief inserts are atomic — a failure on any one rolls the others back, so
# intake never leaves orphaned rows.
#
# Self-contained: spins a throwaway Postgres, applies the REAL migration against
# a minimal repro of the three tables, asserts, and cleans up. Needs Docker.
#   bash supabase/tests/create_intake.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MIGRATION=$(ls "$ROOT"/supabase/migrations/*_create_intake_rpc.sql | head -1)
CONTAINER=omni_create_intake_test
IMAGE=postgres:16-alpine

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker run -d --name "$CONTAINER" -e POSTGRES_HOST_AUTH_METHOD=trust "$IMAGE" >/dev/null
# Wait for readiness — docker exec overhead spaces the retries.
for _ in $(seq 1 120); do
  if docker exec "$CONTAINER" pg_isready -U postgres -q 2>/dev/null; then break; fi
done

{
  # Repro: the authenticated role (for the GRANT), an auth.uid() stub, and the
  # three tables with the columns / NOT NULLs / jsonb types from the real schema.
  cat <<'SQL'
\set ON_ERROR_STOP on
do $$ begin
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated;
  end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select '00000000-0000-0000-0000-000000000001'::uuid; $$;
create table public.clients (
  id uuid primary key default gen_random_uuid(), user_id uuid default auth.uid(),
  name text not null, company text, email text, website text,
  created_at timestamptz default now());
create table public.leads (
  id uuid primary key default gen_random_uuid(), user_id uuid default auth.uid(),
  client_id uuid, source text default 'manual', raw_message text not null,
  budget_range text, timeline text, status text default 'new',
  created_at timestamptz default now(), project_id uuid);
create table public.project_briefs (
  id uuid primary key default gen_random_uuid(), user_id uuid default auth.uid(),
  lead_id uuid, client_id uuid, project_type text, problem text,
  mvp_features jsonb default '[]', future_features jsonb default '[]',
  questions_to_ask jsonb default '[]', estimated_complexity text, next_step text,
  approved boolean default false, created_at timestamptz default now(), project_id uuid);
SQL
  # The actual migration under test.
  cat "$MIGRATION"
  # Assertions: happy path inserts + links all three, then a forced 3rd-insert
  # failure must roll the first two back.
  cat <<'SQL'
\set ON_ERROR_STOP on
select public.create_intake('Acme','Acme Inc','a@acme.com','acme.com',
  'we need an app','$5k','2 months','web app','no dashboard',
  '["auth","billing"]'::jsonb,'["reports"]'::jsonb,'["timeline?"]'::jsonb,
  'medium','send proposal');
do $$ begin
  assert (select count(*) from public.clients)=1, 'happy: 1 client';
  assert (select count(*) from public.leads)=1, 'happy: 1 lead';
  assert (select count(*) from public.project_briefs)=1, 'happy: 1 brief';
  assert (select client_id from public.leads)=(select id from public.clients), 'lead links client';
  assert (select lead_id from public.project_briefs)=(select id from public.leads), 'brief links lead';
end $$;
alter table public.project_briefs add constraint test_boom check (estimated_complexity <> 'BOOM');
do $$ begin
  begin
    perform public.create_intake('Beta',null,null,null,'msg',null,null,
      'x','y','[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'BOOM','z');
    assert false, 'expected the failing brief insert to raise';
  exception when check_violation then null; end;
  assert (select count(*) from public.clients)=1, 'rollback: no orphan client';
  assert (select count(*) from public.leads)=1, 'rollback: no orphan lead';
end $$;
\echo 'create_intake atomicity: PASSED'
SQL
} | docker exec -i "$CONTAINER" psql -U postgres -q -v ON_ERROR_STOP=1
