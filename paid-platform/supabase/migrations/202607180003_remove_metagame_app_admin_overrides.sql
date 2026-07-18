drop policy if exists "metagame archetype overrides are admin editable" on public.metagame_archetype_overrides;
drop policy if exists "metagame signature rules are admin editable" on public.metagame_signature_rules;

notify pgrst, 'reload schema';
