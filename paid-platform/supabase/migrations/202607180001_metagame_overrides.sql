create table if not exists public.metagame_archetype_overrides (
  format text not null,
  source_name text not null,
  display_name text not null,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (format, source_name)
);

alter table public.metagame_archetype_overrides enable row level security;

drop policy if exists "metagame archetype overrides are server only" on public.metagame_archetype_overrides;
create policy "metagame archetype overrides are server only"
  on public.metagame_archetype_overrides for all
  using (false)
  with check (false);
