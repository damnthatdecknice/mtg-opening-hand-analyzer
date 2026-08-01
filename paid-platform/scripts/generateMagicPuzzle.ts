import { generateMagicPuzzleForDate, magicPuzzleToDatabaseRow } from "../src/lib/magicPuzzles";
import { createServerSupabaseClient } from "../src/lib/serverSupabase";

function readArg(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

async function main() {
  const date = readArg("date") ?? new Date().toISOString().slice(0, 10);
  const dryRun = process.argv.includes("--dry-run");
  const force = process.argv.includes("--force");
  const puzzle = generateMagicPuzzleForDate(date);

  console.log(`Magic puzzle ${dryRun ? "dry run" : "generation"} for ${date}`);
  console.log(`Deck: ${puzzle.deckName} (${puzzle.format})`);
  console.log(`Hand: ${puzzle.hand.join(", ")}`);
  console.log(`Answer: ${puzzle.correctAnswer}`);
  console.log(`Difficulty: ${puzzle.difficulty}`);
  console.log(`Generator: ${puzzle.generatorVersion}`);

  if (dryRun) {
    return;
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    throw new Error("Server Supabase credentials are not configured. Use --dry-run locally or configure SUPABASE_SERVICE_ROLE_KEY.");
  }

  if (!force) {
    const { data: existing, error: lookupError } = await supabase
      .from("magic_puzzles")
      .select("id")
      .eq("puzzle_date", date)
      .maybeSingle();
    if (lookupError) {
      throw lookupError;
    }
    if (existing) {
      console.log(`Puzzle already exists for ${date}: ${existing.id}`);
      return;
    }
  }

  const { error } = await supabase.from("magic_puzzles").upsert(magicPuzzleToDatabaseRow(puzzle), { onConflict: "puzzle_date" });
  if (error) {
    throw error;
  }

  console.log(`Stored puzzle ${puzzle.id}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
