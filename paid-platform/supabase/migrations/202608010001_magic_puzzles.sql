create table if not exists public.magic_puzzles (
  id text primary key,
  puzzle_date date not null unique,
  puzzle_type text not null default 'opening-hand',
  format text not null,
  deck_name text not null,
  archetype text,
  decklist text not null,
  hand jsonb not null,
  play_draw text not null check (play_draw in ('play', 'draw')),
  correct_answer text not null check (correct_answer in ('keep', 'mulligan')),
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
  lesson_category text not null,
  analysis_json jsonb not null default '{}'::jsonb,
  explanation_json jsonb not null default '{}'::jsonb,
  source_type text not null default 'generated',
  seed text not null,
  generator_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.magic_puzzle_attempts (
  id uuid primary key default gen_random_uuid(),
  puzzle_id text not null references public.magic_puzzles(id) on delete cascade,
  puzzle_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  selected_answer text not null check (selected_answer in ('keep', 'mulligan')),
  is_correct boolean not null,
  attempted_at timestamptz not null default now(),
  unique (puzzle_id, user_id)
);

create index if not exists magic_puzzle_attempts_user_date_idx
  on public.magic_puzzle_attempts (user_id, puzzle_date desc);

create or replace function public.set_magic_puzzles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.magic_puzzles enable row level security;
alter table public.magic_puzzle_attempts enable row level security;

drop policy if exists magic_puzzle_attempts_select_own on public.magic_puzzle_attempts;
create policy magic_puzzle_attempts_select_own
  on public.magic_puzzle_attempts
  for select
  using (auth.uid() = user_id);

drop policy if exists magic_puzzle_attempts_insert_own on public.magic_puzzle_attempts;
create policy magic_puzzle_attempts_insert_own
  on public.magic_puzzle_attempts
  for insert
  with check (auth.uid() = user_id);

drop trigger if exists set_magic_puzzles_updated_at on public.magic_puzzles;
create trigger set_magic_puzzles_updated_at
  before update on public.magic_puzzles
  for each row
  execute function public.set_magic_puzzles_updated_at();
