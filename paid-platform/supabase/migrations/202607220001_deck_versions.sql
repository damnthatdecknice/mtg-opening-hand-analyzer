create table if not exists public.deck_versions (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.decks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version_number integer not null,
  name text not null,
  format text,
  decklist text not null,
  sideboard text,
  parsed_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (deck_id, version_number)
);

create index if not exists deck_versions_deck_id_version_idx
  on public.deck_versions (deck_id, version_number desc);

alter table public.deck_versions enable row level security;

drop policy if exists "Users can read their deck versions" on public.deck_versions;
create policy "Users can read their deck versions"
  on public.deck_versions
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their deck versions" on public.deck_versions;
create policy "Users can insert their deck versions"
  on public.deck_versions
  for insert
  with check (auth.uid() = user_id);
