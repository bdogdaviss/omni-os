alter table proposals
add column if not exists sent boolean default false;

alter table proposals
add column if not exists sent_at timestamp with time zone;

alter table proposals
add column if not exists sent_method text;

notify pgrst, 'reload schema';
