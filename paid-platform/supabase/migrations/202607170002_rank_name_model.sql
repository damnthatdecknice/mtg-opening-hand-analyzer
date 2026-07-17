alter table public.profiles
  alter column rank set default 'basic';

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

update public.profiles
  set rank = case
    when rank in ('permanent_pro') then 'beta_premium'
    when rank in ('deck_pro', 'grinder') then 'pro'
    when rank in ('free') then 'basic'
    else rank
  end,
  updated_at = now()
  where rank in ('free', 'deck_pro', 'grinder', 'permanent_pro');

update public.profiles p
  set rank = public.rank_from_subscription(s.status, s.price_id, p.email),
      updated_at = now()
  from public.subscription_status s
  where s.user_id = p.id
    and p.rank <> 'beta_premium';
