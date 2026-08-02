do $$
begin
  if to_regclass('public.magic_trainer_hands') is not null then
    alter table public.magic_trainer_hands
      drop constraint if exists magic_trainer_hands_deck_id_fkey;

    alter table public.magic_trainer_hands
      add constraint magic_trainer_hands_deck_id_fkey
      foreign key (deck_id) references public.decks(id) on delete cascade;
  end if;

  if to_regclass('public.magic_trainer_attempts') is not null then
    alter table public.magic_trainer_attempts
      drop constraint if exists magic_trainer_attempts_deck_id_fkey;

    alter table public.magic_trainer_attempts
      add constraint magic_trainer_attempts_deck_id_fkey
      foreign key (deck_id) references public.decks(id) on delete cascade;
  end if;
end $$;
