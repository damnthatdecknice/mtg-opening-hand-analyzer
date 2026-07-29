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
