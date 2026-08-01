import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient, isServerSupabaseConfigured } from "@/lib/serverSupabase";
import {
  generateMagicPuzzleForDate,
  magicPuzzleFromDatabaseRow,
  magicPuzzleToDatabaseRow,
  type MagicPuzzleDatabaseRow
} from "@/lib/magicPuzzles";

function dateFromRequest(body: { date?: unknown }) {
  return typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : new Date().toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.MAGIC_PUZZLE_GENERATION_SECRET;
  const suppliedSecret = request.headers.get("x-opening-edge-puzzle-secret") ?? "";
  if (!configuredSecret || suppliedSecret !== configuredSecret) {
    return NextResponse.json({ error: "Unauthorized puzzle generation request." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { date?: unknown; force?: unknown };
  const puzzleDate = dateFromRequest(body);
  const force = body.force === true;
  const generated = generateMagicPuzzleForDate(puzzleDate);

  if (!isServerSupabaseConfigured) {
    return NextResponse.json({
      stored: false,
      puzzle: {
        id: generated.id,
        puzzleDate: generated.puzzleDate,
        deckName: generated.deckName,
        seed: generated.seed,
        hand: generated.hand,
        playDraw: generated.playDraw,
        answer: generated.correctAnswer,
        source: generated.source
      }
    });
  }

  const serviceClient = createServerSupabaseClient();
  if (!serviceClient) {
    return NextResponse.json({ error: "Puzzle storage is not configured." }, { status: 503 });
  }

  const { data: existing } = await serviceClient
    .from("magic_puzzles")
    .select("*")
    .eq("puzzle_date", puzzleDate)
    .maybeSingle();

  if (existing && !force) {
    const puzzle = magicPuzzleFromDatabaseRow(existing as MagicPuzzleDatabaseRow);
    return NextResponse.json({
      stored: true,
      existing: true,
      puzzle: {
        id: puzzle.id,
        puzzleDate: puzzle.puzzleDate,
        deckName: puzzle.deckName,
        seed: puzzle.seed
      }
    });
  }

  const { data: saved, error } = await serviceClient
    .from("magic_puzzles")
    .upsert(magicPuzzleToDatabaseRow(generated), { onConflict: "puzzle_date" })
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const puzzle = saved ? magicPuzzleFromDatabaseRow(saved as MagicPuzzleDatabaseRow) : generated;
  return NextResponse.json({
    stored: true,
    existing: false,
    puzzle: {
      id: puzzle.id,
      puzzleDate: puzzle.puzzleDate,
      deckName: puzzle.deckName,
      seed: puzzle.seed,
      source: puzzle.source
    }
  });
}
