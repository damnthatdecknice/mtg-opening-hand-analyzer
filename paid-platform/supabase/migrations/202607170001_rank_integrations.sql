alter table public.profiles
  add column if not exists rank text not null default 'free';

create table if not exists public.rank_integration_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  provider text not null default 'unknown',
  external_user_id text,
  resolved_rank text not null,
  created_at timestamptz not null default now()
);

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
    return 'permanent_pro';
  end if;

  if normalized_status in ('grinder', 'premium', 'enterprise') or normalized_price like '%grinder%' then
    return 'grinder';
  end if;

  if normalized_status in ('deck_pro', 'pro', 'active', 'trialing', 'paid')
    or normalized_price like '%deck%'
    or normalized_price like '%5%' then
    return 'deck_pro';
  end if;

  return 'free';
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
begin
  select email into profile_email from public.profiles where id = new.user_id;

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

update public.profiles p
  set rank = public.rank_from_subscription(s.status, s.price_id, p.email),
      updated_at = now()
  from public.subscription_status s
  where s.user_id = p.id;

update public.profiles
  set rank = public.rank_from_subscription('free', null, email),
      updated_at = now()
  where rank = 'free';

alter table public.rank_integration_checks enable row level security;

drop policy if exists "rank integration checks are server only" on public.rank_integration_checks;
create policy "rank integration checks are server only"
  on public.rank_integration_checks for all
  using (false)
  with check (false);
