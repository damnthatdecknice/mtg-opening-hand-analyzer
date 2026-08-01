alter table public.magic_puzzles
  drop constraint if exists magic_puzzles_puzzle_date_key;

create index if not exists magic_puzzles_puzzle_date_idx
  on public.magic_puzzles (puzzle_date desc);
