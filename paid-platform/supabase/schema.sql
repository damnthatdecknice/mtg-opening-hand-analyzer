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

comment on column public.subscription_status.status is
  'Tier/status value. Supported app tiers include free, deck_pro ($5/month), grinder, active/trialing Stripe states, and app-level permanent overrides.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_decks_updated_at on public.decks;
create trigger set_decks_updated_at
  before update on public.decks
  for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_profile_after_signup on auth.users;
create trigger create_profile_after_signup
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.decks enable row level security;
alter table public.rating_entries enable row level security;
alter table public.hand_sessions enable row level security;
alter table public.subscription_status enable row level security;

drop policy if exists "profiles are owned by users" on public.profiles;
create policy "profiles are owned by users"
  on public.profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "decks are owned by users" on public.decks;
create policy "decks are owned by users"
  on public.decks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "rating entries are owned by users" on public.rating_entries;
create policy "rating entries are owned by users"
  on public.rating_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "hand sessions are owned by users" on public.hand_sessions;
create policy "hand sessions are owned by users"
  on public.hand_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "subscription rows are owned by users" on public.subscription_status;
create policy "subscription rows are owned by users"
  on public.subscription_status for select
  using (auth.uid() = user_id);
