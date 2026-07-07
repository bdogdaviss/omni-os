create table if not exists proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) default auth.uid(),
  project_brief_id uuid references project_briefs(id) on delete cascade,
  client_id uuid references clients(id) on delete cascade,
  proposal_summary text,
  lean_mvp jsonb default '{}'::jsonb,
  core_build jsonb default '{}'::jsonb,
  full_launch jsonb default '{}'::jsonb,
  assumptions jsonb default '[]'::jsonb,
  out_of_scope jsonb default '[]'::jsonb,
  follow_up_message text,
  approved boolean default false,
  created_at timestamp with time zone default now()
);

alter table proposals enable row level security;

drop policy if exists "Authenticated users can manage their proposals"
on proposals;

create policy "Authenticated users can manage their proposals"
on proposals
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
