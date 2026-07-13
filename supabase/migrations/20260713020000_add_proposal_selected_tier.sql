alter table public.proposals
  add column if not exists selected_tier text;

alter table public.proposals
  drop constraint if exists proposals_selected_tier_check;

alter table public.proposals
  add constraint proposals_selected_tier_check
  check (selected_tier is null or selected_tier in ('lean_mvp', 'core_build', 'full_launch'));
