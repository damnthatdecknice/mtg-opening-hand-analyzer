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
  generateFastMagicPuzzleForDeck,
  generateMagicPuzzleForDate,
  magicPuzzleAttemptFromDatabaseRow,
  magicPuzzleFromDatabaseRow,
  magicPuzzleToDatabaseRow,
  publicMagicPuzzle,
  type MagicPuzzleAttempt,
  type MagicPuzzleAttemptDatabaseRow,
  type MagicPuzzleDatabaseRow,
  type MagicPuzzleDeckOption
} from "@/lib/magicPuzzles";
import { parseDecklist } from "@/lib/deckParser";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

type SavedDeckRow = {
  id: string;
  name: string;
  format: string | null;
  decklist: string;
  parsed_json?: unknown;
};

function savedDeckMainCount(deck: SavedDeckRow) {
  const parsed = deck.parsed_json as { mainCount?: unknown } | null;
  if (typeof parsed?.mainCount === "number") {
    return parsed.mainCount;
  }
  return parseDecklist(deck.decklist).mainCount;
}

function savedDeckOption(deck: SavedDeckRow): MagicPuzzleDeckOption {
  return {
    id: deck.id,
    name: deck.name,
    format: deck.format ?? "Unknown",
    mainCount: savedDeckMainCount(deck)
  };
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
    .eq("id", generated.id)
    .maybeSingle();

  if (existing) {
    return magicPuzzleFromDatabaseRow(existing as MagicPuzzleDatabaseRow);
  }

  const { data: inserted } = await serviceClient
    .from("magic_puzzles")
    .upsert(magicPuzzleToDatabaseRow(generated), { onConflict: "id" })
    .select("*")
    .maybeSingle();

  return inserted ? magicPuzzleFromDatabaseRow(inserted as MagicPuzzleDatabaseRow) : generated;
}

export async function GET(request: NextRequest) {
  const token = bearerToken(request);

  if (!token || !isServerAnonSupabaseConfigured) {
    const puzzle = await loadTodayPuzzle(todayUtc());
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
    const puzzle = await loadTodayPuzzle(todayUtc());
    return NextResponse.json({
      signedIn: false,
      preview: true,
      puzzle: publicMagicPuzzle(puzzle),
      stats: calculateMagicPuzzleStats([])
    });
  }

  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Sign in to use the Keep Trainer." }, { status: 401 });
  }

  const entitlements = await loadEntitlementSnapshot(userData.user.id);
  if (!canUseMagicPuzzles(entitlements)) {
    return NextResponse.json({ error: "Magic Puzzles are not enabled for this account." }, { status: 403 });
  }

  const { data: deckData } = await serviceClient
    .from("decks")
    .select("id, name, format, decklist, parsed_json")
    .eq("user_id", userData.user.id)
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });

  const decks = ((deckData ?? []) as SavedDeckRow[]).filter((deck) => savedDeckMainCount(deck) >= 7);
  const deckOptions = decks.map(savedDeckOption);
  const requestedDeckId = request.nextUrl.searchParams.get("deckId") ?? "";
  const selectedDeck = decks.find((deck) => deck.id === requestedDeckId) ?? decks[0];

  const { data: attemptsData } = await serviceClient
    .from("magic_puzzle_attempts")
    .select("puzzle_date, selected_answer, is_correct, attempted_at")
    .eq("user_id", userData.user.id)
    .order("puzzle_date", { ascending: true })
    .order("attempted_at", { ascending: true });

  const attempts = ((attemptsData ?? []) as MagicPuzzleAttemptDatabaseRow[]).map(magicPuzzleAttemptFromDatabaseRow);
  const archive = canUseMagicPuzzleArchive(entitlements)
    ? attempts.slice(-30).reverse().map((attempt) => ({
        puzzleDate: attempt.puzzleDate,
        completed: true,
        correct: attempt.correct
      }))
    : [];

  if (!selectedDeck) {
    return NextResponse.json({
      signedIn: true,
      preview: false,
      puzzle: null,
      decks: deckOptions,
      stats: calculateMagicPuzzleStats(attempts as MagicPuzzleAttempt[]),
      archive
    });
  }

  const trainerPuzzle = generateFastMagicPuzzleForDeck(
    {
      id: selectedDeck.id,
      name: selectedDeck.name,
      format: selectedDeck.format,
      decklist: selectedDeck.decklist
    },
    `${userData.user.id}:${selectedDeck.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`
  );

  const { data: inserted, error: insertError } = await serviceClient
    .from("magic_puzzles")
    .upsert(magicPuzzleToDatabaseRow(trainerPuzzle), { onConflict: "id" })
    .select("*")
    .maybeSingle();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  const puzzleForResponse = inserted ? magicPuzzleFromDatabaseRow(inserted as MagicPuzzleDatabaseRow) : trainerPuzzle;

  return NextResponse.json({
    signedIn: true,
    preview: false,
    puzzle: publicMagicPuzzle(puzzleForResponse),
    decks: deckOptions,
    selectedDeckId: selectedDeck.id,
    stats: calculateMagicPuzzleStats(attempts as MagicPuzzleAttempt[]),
    archive
  });
}
