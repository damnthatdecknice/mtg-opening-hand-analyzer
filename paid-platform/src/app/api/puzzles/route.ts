import { NextRequest, NextResponse } from "next/server";
import { OPEN_BETA_ACCESS, tierFromSubscription } from "@/lib/subscriptions";
import {
  createServerAnonSupabaseClient,
  createServerSupabaseClient,
  isServerAnonSupabaseConfigured,
  isServerSupabaseConfigured
} from "@/lib/serverSupabase";
import {
  calculateMagicPuzzleStats,
  canUseMagicPuzzleArchive,
  canUseMagicPuzzles,
  generateMagicPuzzleForDate,
  magicPuzzleAttemptFromDatabaseRow,
  magicPuzzleFromDatabaseRow,
  magicPuzzleToDatabaseRow,
  publicMagicPuzzle,
  type MagicPuzzleAttempt,
  type MagicPuzzleAttemptDatabaseRow,
  type MagicPuzzleDatabaseRow
} from "@/lib/magicPuzzles";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

async function loadEntitlementSnapshot(userId: string) {
  const serviceClient = createServerSupabaseClient();
  if (!serviceClient) {
    return { rank: "basic", tierId: "free", isOpenBeta: OPEN_BETA_ACCESS, isPermanent: false };
  }

  const [profileResponse, subscriptionResponse] = await Promise.all([
    serviceClient.from("profiles").select("rank").eq("id", userId).maybeSingle(),
    serviceClient.from("subscription_status").select("status, price_id").eq("user_id", userId).maybeSingle()
  ]);

  const rank =
    profileResponse.data?.rank === "beta_premium" || profileResponse.data?.rank === "pro"
      ? profileResponse.data.rank
      : "basic";
  const tierId =
    rank === "beta_premium"
      ? "permanent"
      : rank === "pro"
        ? "deck_pro"
        : tierFromSubscription(subscriptionResponse.data?.status, subscriptionResponse.data?.price_id);

  return {
    rank,
    tierId,
    isOpenBeta: OPEN_BETA_ACCESS,
    isPermanent: tierId === "permanent"
  };
}

async function loadTodayPuzzle(puzzleDate: string) {
  const generated = generateMagicPuzzleForDate(puzzleDate);
  if (!isServerSupabaseConfigured) {
    return generated;
  }

  const serviceClient = createServerSupabaseClient();
  if (!serviceClient) {
    return generated;
  }

  const { data: existing } = await serviceClient
    .from("magic_puzzles")
    .select("*")
    .eq("puzzle_date", puzzleDate)
    .maybeSingle();

  if (existing) {
    return magicPuzzleFromDatabaseRow(existing as MagicPuzzleDatabaseRow);
  }

  const { data: inserted } = await serviceClient
    .from("magic_puzzles")
    .upsert(magicPuzzleToDatabaseRow(generated), { onConflict: "puzzle_date" })
    .select("*")
    .maybeSingle();

  return inserted ? magicPuzzleFromDatabaseRow(inserted as MagicPuzzleDatabaseRow) : generated;
}

export async function GET(request: NextRequest) {
  const puzzleDate = todayUtc();
  const puzzle = await loadTodayPuzzle(puzzleDate);
  const token = bearerToken(request);

  if (!token || !isServerAnonSupabaseConfigured) {
    return NextResponse.json({
      signedIn: false,
      preview: true,
      puzzle: publicMagicPuzzle(puzzle),
      stats: calculateMagicPuzzleStats([])
    });
  }

  const authClient = createServerAnonSupabaseClient(token);
  const serviceClient = createServerSupabaseClient();
  if (!authClient || !serviceClient) {
    return NextResponse.json({
      signedIn: false,
      preview: true,
      puzzle: publicMagicPuzzle(puzzle),
      stats: calculateMagicPuzzleStats([])
    });
  }

  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Sign in to play today's puzzle." }, { status: 401 });
  }

  const entitlements = await loadEntitlementSnapshot(userData.user.id);
  if (!canUseMagicPuzzles(entitlements)) {
    return NextResponse.json({ error: "Magic Puzzles are not enabled for this account." }, { status: 403 });
  }

  const { data: attemptsData } = await serviceClient
    .from("magic_puzzle_attempts")
    .select("puzzle_date, selected_answer, is_correct, attempted_at")
    .eq("user_id", userData.user.id)
    .order("puzzle_date", { ascending: true });

  const attempts = ((attemptsData ?? []) as MagicPuzzleAttemptDatabaseRow[]).map(magicPuzzleAttemptFromDatabaseRow);
  const todayAttempt = attempts.find((attempt) => attempt.puzzleDate === puzzle.puzzleDate);
  const archive = canUseMagicPuzzleArchive(entitlements)
    ? attempts.slice(-30).reverse().map((attempt) => ({
        puzzleDate: attempt.puzzleDate,
        completed: true,
        correct: attempt.correct
      }))
    : [];

  return NextResponse.json({
    signedIn: true,
    preview: false,
    puzzle: publicMagicPuzzle(puzzle, todayAttempt),
    stats: calculateMagicPuzzleStats(attempts as MagicPuzzleAttempt[]),
    archive
  });
}
