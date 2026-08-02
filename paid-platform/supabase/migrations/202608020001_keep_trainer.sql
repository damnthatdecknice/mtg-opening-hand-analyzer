create extension if not exists pgcrypto;

create table if not exists public.magic_trainer_hands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id uuid not null references public.saved_decks(id) on delete cascade,
  deck_name text not null,
  format text not null default 'Unknown',
  decklist_snapshot text not null,
  seed text not null,
  hand jsonb not null,
  play_draw text not null check (play_draw in ('play', 'draw')),
  correct_answer text check (correct_answer in ('keep', 'mulligan')),
  analysis_json jsonb,
  explanation_json jsonb,
  analyzer_version text not null,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.magic_trainer_attempts (
  id uuid primary key default gen_random_uuid(),
  trainer_hand_id uuid not null references public.magic_trainer_hands(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id uuid not null references public.saved_decks(id) on delete cascade,
  selected_answer text not null check (selected_answer in ('keep', 'mulligan')),
  is_correct boolean not null,
  rating_before integer not null default 1000,
  rating_after integer not null default 1000,
  attempted_at timestamptz not null default now(),
  constraint magic_trainer_attempts_hand_user_unique unique (trainer_hand_id, user_id)
);

create index if not exists magic_trainer_hands_user_created_idx
  on public.magic_trainer_hands (user_id, created_at desc);

create index if not exists magic_trainer_hands_deck_created_idx
  on public.magic_trainer_hands (deck_id, created_at desc);

create index if not exists magic_trainer_attempts_user_attempted_idx
  on public.magic_trainer_attempts (user_id, attempted_at desc);

alter table public.magic_trainer_hands enable row level security;
alter table public.magic_trainer_attempts enable row level security;

drop policy if exists "Users can read own trainer hands" on public.magic_trainer_hands;
create policy "Users can read own trainer hands"
  on public.magic_trainer_hands
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own trainer hands" on public.magic_trainer_hands;
create policy "Users can insert own trainer hands"
  on public.magic_trainer_hands
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own trainer hands" on public.magic_trainer_hands;
create policy "Users can update own trainer hands"
  on public.magic_trainer_hands
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own trainer attempts" on public.magic_trainer_attempts;
create policy "Users can read own trainer attempts"
  on public.magic_trainer_attempts
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own trainer attempts" on public.magic_trainer_attempts;
create policy "Users can insert own trainer attempts"
  on public.magic_trainer_attempts
  for insert
  with check (auth.uid() = user_id);
