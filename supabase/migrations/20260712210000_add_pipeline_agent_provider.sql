alter table public.pipeline_runs
  add column if not exists agent_provider text not null default 'claude';

alter table public.pipeline_runs
  drop constraint if exists pipeline_runs_agent_provider_check;

alter table public.pipeline_runs
  add constraint pipeline_runs_agent_provider_check
  check (agent_provider in ('claude', 'openai'));
