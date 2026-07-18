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

alter table public.metagame_signature_rules enable row level security;

drop policy if exists "metagame signature rules are public readable" on public.metagame_signature_rules;
drop policy if exists "metagame signature rules are admin editable" on public.metagame_signature_rules;

create policy "metagame signature rules are public readable"
  on public.metagame_signature_rules for select
  using (true);

create policy "metagame signature rules are admin editable"
  on public.metagame_signature_rules for all
  using (lower(auth.jwt() ->> 'email') = 'gotthisforsoi@gmail.com')
  with check (lower(auth.jwt() ->> 'email') = 'gotthisforsoi@gmail.com');

insert into public.metagame_signature_rules
  (format, card_name, archetype_name, required_colors, priority, notes)
values
  ('Modern', 'Thought-Knot Seer', 'GR Eldrazi', array['G','R'], 120, 'Color-sensitive Eldrazi label.'),
  ('Modern', 'Thought-Knot Seer', 'G Eldrazi', array['G'], 110, 'Fallback for green Eldrazi shells.'),
  ('Modern', 'Goryo''s Vengeance', 'Goryo''s Vengeance', array[]::text[], 120, 'Named combo shell.'),
  ('Modern', 'Galvanic Discharge', 'Boros Energy', array[]::text[], 110, 'Energy shell signal.'),
  ('Modern', 'Pinnacle Emissary', 'Affinity', array[]::text[], 110, 'Artifact shell signal.')
on conflict do nothing;
