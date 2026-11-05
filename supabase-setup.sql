-- Run once in Supabase SQL Editor. Keep the service role key on the server only.
create table if not exists public.marketplace_state (
  id integer primary key check (id = 1),
  state jsonb not null default '{"vehicles": [], "preferences": {"name": "Mercedes", "closing": "Come see me to always get the Wright deal!"}, "lastSync": null}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.marketplace_state (id) values (1) on conflict (id) do nothing;
-- Block browser/public access; app server uses the service role secret.
alter table public.marketplace_state enable row level security;
revoke all on public.marketplace_state from anon, authenticated;
