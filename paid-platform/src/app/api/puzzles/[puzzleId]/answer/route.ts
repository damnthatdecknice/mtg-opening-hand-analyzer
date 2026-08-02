import { NextRequest, NextResponse } from "next/server";
import {
  createServerAnonSupabaseClient,
  createServerSupabaseClient,
  isServerAnonSupabaseConfigured,
  isServerSupabaseConfigured
} from "@/lib/serverSupabase";
import {
  calculateMagicPuzzleStats,
  completeMagicPuzzleAnalysis,
  generateMagicPuzzleForDate,
  isLightweightTrainerPuzzle,
  magicPuzzleAttemptFromDatabaseRow,
  magicPuzzleFromDatabaseRow,
  magicPuzzleToDatabaseRow,
  revealMagicPuzzle,
  type MagicPuzzleAnswer,
  type MagicPuzzleAttemptDatabaseRow,
  type MagicPuzzleDatabaseRow
} from "@/lib/magicPuzzles";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
}

function puzzleDateFromId(puzzleId: string) {
  const parts = puzzleId.split(":");
  return parts[1] && /^\d{4}-\d{2}-\d{2}$/.test(parts[1]) ? parts[1] : new Date().toISOString().slice(0, 10);
}

function isPuzzleAnswer(value: unknown): value is MagicPuzzleAnswer {
  return value === "keep" || value === "mulligan";
}

async function loadPuzzle(puzzleId: string) {
  if (!isServerSupabaseConfigured) {
    return generateMagicPuzzleForDate(puzzleDateFromId(puzzleId));
  }

  const serviceClient = createServerSupabaseClient();
  if (!serviceClient) {
    return generateMagicPuzzleForDate(puzzleDateFromId(puzzleId));
  }

  const { data } = await serviceClient.from("magic_puzzles").select("*").eq("id", puzzleId).maybeSingle();
  return data ? magicPuzzleFromDatabaseRow(data as MagicPuzzleDatabaseRow) : generateMagicPuzzleForDate(puzzleDateFromId(puzzleId));
}

export async function POST(request: NextRequest, context: { params: { puzzleId: string } }) {
  const token = bearerToken(request);
  if (!token || !isServerAnonSupabaseConfigured || !isServerSupabaseConfigured) {
    return NextResponse.json({ error: "Sign in to answer Magic Puzzles." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { answer?: unknown };
  if (!isPuzzleAnswer(body.answer)) {
    return NextResponse.json({ error: "Choose Keep or Mulligan." }, { status: 400 });
  }

  const authClient = createServerAnonSupabaseClient(token);
  const serviceClient = createServerSupabaseClient();
  if (!authClient || !serviceClient) {
    return NextResponse.json({ error: "Puzzle storage is not configured." }, { status: 503 });
  }

  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Sign in to answer Magic Puzzles." }, { status: 401 });
  }

  const loadedPuzzle = await loadPuzzle(context.params.puzzleId);
  let puzzle = loadedPuzzle;
  if (isLightweightTrainerPuzzle(loadedPuzzle)) {
    puzzle = completeMagicPuzzleAnalysis(loadedPuzzle);
    const { error: puzzleUpdateError } = await serviceClient
      .from("magic_puzzles")
      .upsert(magicPuzzleToDatabaseRow(puzzle), { onConflict: "id" });

    if (puzzleUpdateError) {
      return NextResponse.json({ error: puzzleUpdateError.message }, { status: 400 });
    }
  }

  const existingResponse = await serviceClient
    .from("magic_puzzle_attempts")
    .select("puzzle_date, selected_answer, is_correct, attempted_at")
    .eq("puzzle_id", puzzle.id)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (existingResponse.data) {
    const existingAttempt = magicPuzzleAttemptFromDatabaseRow(existingResponse.data as MagicPuzzleAttemptDatabaseRow);
    return NextResponse.json(
      {
        error: "You already answered this puzzle.",
        reveal: revealMagicPuzzle(puzzle, existingAttempt.selectedAnswer)
      },
      { status: 409 }
    );
  }

  const correct = body.answer === puzzle.correctAnswer;
  const { error: insertError } = await serviceClient.from("magic_puzzle_attempts").insert({
    puzzle_id: puzzle.id,
    puzzle_date: puzzle.puzzleDate,
    user_id: userData.user.id,
    selected_answer: body.answer,
    is_correct: correct
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  const { data: attemptsData } = await serviceClient
    .from("magic_puzzle_attempts")
    .select("puzzle_date, selected_answer, is_correct, attempted_at")
    .eq("user_id", userData.user.id)
    .order("puzzle_date", { ascending: true })
    .order("attempted_at", { ascending: true });

  return NextResponse.json({
    reveal: revealMagicPuzzle(puzzle, body.answer),
    stats: calculateMagicPuzzleStats(((attemptsData ?? []) as MagicPuzzleAttemptDatabaseRow[]).map(magicPuzzleAttemptFromDatabaseRow))
  });
}
