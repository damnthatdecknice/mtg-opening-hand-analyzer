create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  rank text not null default 'basic',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists rank text not null default 'basic';

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

create or replace function public.update_deck_with_version(
  p_deck_id uuid,
  p_name text,
  p_format text,
  p_decklist text,
  p_sideboard text,
  p_parsed_json jsonb
)
returns public.decks
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_deck public.decks%rowtype;
  updated_deck public.decks%rowtype;
  next_version integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in before saving a deck.' using errcode = '28000';
  end if;

  select *
    into current_deck
    from public.decks
    where id = p_deck_id
      and user_id = auth.uid()
    for update;

  if not found then
    raise exception 'Deck not found or access denied.' using errcode = 'P0002';
  end if;

  select coalesce(max(version_number), 0) + 1
    into next_version
    from public.deck_versions
    where deck_id = p_deck_id;

  insert into public.deck_versions (
    deck_id,
    user_id,
    version_number,
    name,
    format,
    decklist,
    sideboard,
    parsed_json
  )
  values (
    current_deck.id,
    current_deck.user_id,
    next_version,
    current_deck.name,
    current_deck.format,
    current_deck.decklist,
    current_deck.sideboard,
    current_deck.parsed_json
  );

  update public.decks
    set name = coalesce(nullif(trim(p_name), ''), current_deck.name),
        format = nullif(trim(coalesce(p_format, '')), ''),
        decklist = p_decklist,
        sideboard = p_sideboard,
        parsed_json = coalesce(p_parsed_json, '{}'::jsonb),
        updated_at = now()
    where id = current_deck.id
      and user_id = current_deck.user_id
    returning *
    into updated_deck;

  return updated_deck;
end;
$$;

grant execute on function public.update_deck_with_version(uuid, text, text, text, text, jsonb) to authenticated;

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
  'Tier/status value. Rank integration maps free to basic, paid/active/pro states to pro, and preserves admin-set beta_premium.';

create table if not exists public.rank_integration_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  provider text not null default 'unknown',
  external_user_id text,
  resolved_rank text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.metagame_archetype_overrides (
  format text not null,
  source_name text not null,
  display_name text not null,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (format, source_name)
);

create table if not exists public.metagame_signature_rules (
  id uuid primary key default gen_random_uuid(),
  format text not null,
  card_name text not null,
  archetype_name text not null,
  required_colors text[] not null default '{}'::text[],
  priority integer not null default 100,
  is_active boolean not null default true,
  notes text,
  updated_at timestamptz not null default now()
);

create index if not exists metagame_signature_rules_format_active_priority_idx
  on public.metagame_signature_rules (format, is_active, priority desc);

create unique index if not exists metagame_signature_rules_unique_rule_idx
  on public.metagame_signature_rules (format, card_name, archetype_name, required_colors);

create or replace function public.rank_from_subscription(status text, price_id text, email text default null)
returns text
language plpgsql
immutable
as $$
declare
  normalized_status text := lower(coalesce(status, ''));
  normalized_price text := lower(coalesce(price_id, ''));
  normalized_email text := lower(coalesce(email, ''));
  email_handle text := split_part(normalized_email, '@', 1);
begin
  if normalized_email = 'gotthisforsoi@gmail.com' or email_handle = 'gotthisforsoi' then
    return 'beta_premium';
  end if;

  if normalized_status in ('pro', 'deck_pro', 'active', 'trialing', 'paid')
    or normalized_price like '%pro%'
    or normalized_price like '%deck%'
    or normalized_price like '%5%' then
    return 'pro';
  end if;

  return 'basic';
end;
$$;

create or replace function public.sync_profile_rank_from_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_email text;
  current_rank text;
begin
  select email, rank into profile_email, current_rank from public.profiles where id = new.user_id;

  if current_rank = 'beta_premium' then
    return new;
  end if;

  update public.profiles
    set rank = public.rank_from_subscription(new.status, new.price_id, profile_email),
        updated_at = now()
    where id = new.user_id;

  return new;
end;
$$;

drop trigger if exists sync_profile_rank_after_subscription_change on public.subscription_status;
create trigger sync_profile_rank_after_subscription_change
  after insert or update of status, price_id on public.subscription_status
  for each row execute function public.sync_profile_rank_from_subscription();

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
  insert into public.profiles (id, email, display_name, rank)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    public.rank_from_subscription('basic', null, new.email)
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
alter table public.deck_versions enable row level security;
alter table public.rating_entries enable row level security;
alter table public.hand_sessions enable row level security;
alter table public.subscription_status enable row level security;
alter table public.rank_integration_checks enable row level security;
alter table public.metagame_archetype_overrides enable row level security;
alter table public.metagame_signature_rules enable row level security;

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

drop policy if exists "deck versions are owned by users" on public.deck_versions;
create policy "deck versions are owned by users"
  on public.deck_versions for all
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

drop policy if exists "rank integration checks are server only" on public.rank_integration_checks;
create policy "rank integration checks are server only"
  on public.rank_integration_checks for all
  using (false)
  with check (false);

drop policy if exists "metagame archetype overrides are server only" on public.metagame_archetype_overrides;
drop policy if exists "metagame archetype overrides are public readable" on public.metagame_archetype_overrides;
drop policy if exists "metagame archetype overrides are admin editable" on public.metagame_archetype_overrides;

create policy "metagame archetype overrides are public readable"
  on public.metagame_archetype_overrides for select
  using (true);

drop policy if exists "metagame signature rules are public readable" on public.metagame_signature_rules;
drop policy if exists "metagame signature rules are admin editable" on public.metagame_signature_rules;

create policy "metagame signature rules are public readable"
  on public.metagame_signature_rules for select
  using (true);
