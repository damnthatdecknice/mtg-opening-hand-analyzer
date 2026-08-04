alter table public.magic_trainer_hands
  add column if not exists pending_answer text,
  add column if not exists answer_locked_at timestamptz,
  add column if not exists analysis_status text not null default 'pending',
  add column if not exists analysis_error text,
  add column if not exists deck_metadata_snapshot jsonb;

alter table public.magic_trainer_attempts
  add column if not exists rated boolean not null default true,
  add column if not exists rating_delta integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'magic_trainer_hands_pending_answer_check'
  ) then
    alter table public.magic_trainer_hands
      add constraint magic_trainer_hands_pending_answer_check
      check (pending_answer is null or pending_answer in ('keep', 'mulligan'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'magic_trainer_hands_analysis_status_check'
  ) then
    alter table public.magic_trainer_hands
      add constraint magic_trainer_hands_analysis_status_check
      check (analysis_status in ('pending', 'running', 'ready', 'failed'));
  end if;
end $$;

update public.magic_trainer_hands
set analysis_status = 'ready'
where analysis_status = 'pending'
  and analysis_json is not null
  and explanation_json is not null
  and correct_answer is not null;

create or replace function public.finalize_magic_trainer_attempt(
  p_hand_id uuid,
  p_selected_answer text,
  p_rating_delta integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_hand public.magic_trainer_hands%rowtype;
  v_existing public.magic_trainer_attempts%rowtype;
  v_before integer;
  v_after integer;
  v_correct boolean;
  v_attempt public.magic_trainer_attempts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_selected_answer not in ('keep', 'mulligan') then
    raise exception 'invalid answer' using errcode = '22023';
  end if;

  select * into v_hand
  from public.magic_trainer_hands
  where id = p_hand_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'trainer hand not found' using errcode = 'P0002';
  end if;

  select * into v_existing
  from public.magic_trainer_attempts
  where trainer_hand_id = p_hand_id and user_id = auth.uid();

  if found then
    return jsonb_build_object(
      'status', 'already_finalized',
      'attempt_id', v_existing.id,
      'rating_before', v_existing.rating_before,
      'rating_after', v_existing.rating_after,
      'rating_delta', v_existing.rating_delta,
      'rated', v_existing.rated,
      'is_correct', v_existing.is_correct
    );
  end if;

  if v_hand.answered_at is not null then
    raise exception 'trainer hand already answered' using errcode = 'P0001';
  end if;
  if v_hand.pending_answer is distinct from p_selected_answer then
    raise exception 'answer was not locked on this trainer hand' using errcode = 'P0001';
  end if;
  if v_hand.analysis_status <> 'ready'
     or v_hand.correct_answer is null
     or v_hand.analysis_json is null
     or v_hand.explanation_json is null then
    raise exception 'trainer analysis is not ready' using errcode = '55000';
  end if;

  select coalesce(
    (select rating_after from public.magic_trainer_attempts
     where user_id = auth.uid()
     order by attempted_at desc limit 1),
    1000
  ) into v_before;
  v_correct := p_selected_answer = v_hand.correct_answer;
  v_after := greatest(100, least(2500, v_before + case when v_correct then p_rating_delta else p_rating_delta end));

  update public.magic_trainer_hands
  set answered_at = now(), analysis_error = null
  where id = p_hand_id and user_id = auth.uid();

  insert into public.magic_trainer_attempts (
    trainer_hand_id, user_id, deck_id, selected_answer, is_correct,
    rating_before, rating_after, rated, rating_delta
  ) values (
    p_hand_id, auth.uid(), v_hand.deck_id, p_selected_answer, v_correct,
    v_before, v_after, p_rating_delta <> 0, p_rating_delta
  )
  returning * into v_attempt;

  return jsonb_build_object(
    'status', 'finalized',
    'attempt_id', v_attempt.id,
    'rating_before', v_before,
    'rating_after', v_after,
    'rating_delta', p_rating_delta,
    'rated', p_rating_delta <> 0,
    'is_correct', v_correct
  );
end;
$$;
