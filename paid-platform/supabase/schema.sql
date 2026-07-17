create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  format text,
  decklist text not null,
  sideboard text,
  parsed_json jsonb not null default '{}'::jsonb,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rating_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null,
  result text check (result in ('win', 'loss', 'draw', 'unknown')),
  format text,
  deck_id uuid references public.decks(id) on delete set null,
  note text,
  played_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.hand_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id uuid references public.decks(id) on delete set null,
  source text not null default 'manual',
  confirmed_hand jsonb not null,
  analysis_json jsonb not null default '{}'::jsonb,
  screenshot_metadata jsonb not null default '{}'::jsonb,
  decision text check (decision in ('keep', 'mulligan', 'close', 'unknown')) default 'unknown',
  created_at timestamptz not null default now()
);

create table if not exists public.subscription_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text not null default 'free',
  price_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.decks enable row level security;
alter table public.rating_entries enable row level security;
alter table public.hand_sessions enable row level security;
alter table public.subscription_status enable row level security;

create policy "profiles are owned by users"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "decks are owned by users"
  on public.decks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "rating entries are owned by users"
  on public.rating_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "hand sessions are owned by users"
  on public.hand_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "subscription rows are owned by users"
  on public.subscription_status for select
  using (auth.uid() = user_id);

