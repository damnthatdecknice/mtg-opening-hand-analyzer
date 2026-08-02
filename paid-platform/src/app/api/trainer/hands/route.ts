import { NextRequest, NextResponse } from "next/server";
import {
  createServerAnonSupabaseClient,
  isServerAnonSupabaseConfigured
} from "@/lib/serverSupabase";
import { parseDecklist, type ParsedDeck } from "@/lib/deckParser";
import { type PlayDraw } from "@/lib/analyzer";
import { deterministicIndex, generateSeededOpeningHand } from "@/lib/seededHandGenerator";
import {
  calculateTrainerStats,
  keepTrainerAnalyzerVersion,
  publicTrainerHand,
  trainerAttemptFromRow,
  type TrainerDeckOption
} from "@/lib/keepTrainer";
import { loadTrainerCardPresentation } from "@/lib/serverCardPresentation";

type SavedDeckRow = {
  id: string;
  name: string;
  format: string | null;
  decklist: string;
  parsed_json?: ParsedDeck | null;
  updated_at?: string;
};

type TrainerAttemptRow = {
  selected_answer: "keep" | "mulligan";
  is_correct: boolean;
  rating_before?: number | null;
  rating_after?: number | null;
  attempted_at?: string | null;
};

function isMissingTrainerTableError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "PGRST205" || message.includes("schema cache") || message.includes("does not exist");
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
}

function savedDeckMainCount(deck: SavedDeckRow) {
  if (typeof deck.parsed_json?.mainCount === "number") {
    return deck.parsed_json.mainCount;
  }
  return parseDecklist(deck.decklist).mainCount;
}

function savedDeckOption(deck: SavedDeckRow): TrainerDeckOption {
  return {
    id: deck.id,
    name: deck.name,
    format: deck.format ?? "Unknown",
    mainCount: savedDeckMainCount(deck)
  };
}

async function requireUser(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) {
    return { error: NextResponse.json({ error: "Sign in to use the Keep Trainer." }, { status: 401 }) };
  }
  if (!isServerAnonSupabaseConfigured) {
    return { error: NextResponse.json({ error: "Trainer storage is not configured." }, { status: 503 }) };
  }

  const serviceClient = createServerAnonSupabaseClient(token);
  if (!serviceClient) {
    return { error: NextResponse.json({ error: "Trainer storage is not configured." }, { status: 503 }) };
  }

  const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: NextResponse.json({ error: "Sign in to use the Keep Trainer." }, { status: 401 }) };
  }

  return { user: userData.user, serviceClient };
}

async function loadTrainerAttempts(serviceClient: NonNullable<ReturnType<typeof createServerAnonSupabaseClient>>, userId: string) {
  const { data, error } = await serviceClient
    .from("magic_trainer_attempts")
    .select("selected_answer, is_correct, rating_before, rating_after, attempted_at")
    .eq("user_id", userId)
    .order("attempted_at", { ascending: true });

  if (error) {
    if (isMissingTrainerTableError(error)) {
      return [];
    }
    throw error;
  }

  return ((data ?? []) as TrainerAttemptRow[]).map(trainerAttemptFromRow);
}

export async function GET(request: NextRequest) {
  const context = await requireUser(request);
  if ("error" in context) {
    return context.error;
  }

  const { user, serviceClient } = context;
  const { data: deckData, error: deckError } = await serviceClient
    .from("decks")
    .select("id, name, format, decklist, parsed_json, updated_at")
    .eq("user_id", user.id)
    .eq("is_archived", false)
    .order("updated_at", { ascending: false });

  if (deckError) {
    return NextResponse.json({ error: deckError.message }, { status: 400 });
  }

  const decks = ((deckData ?? []) as SavedDeckRow[]).filter((deck) => savedDeckMainCount(deck) >= 7);
  let trainerAttempts: ReturnType<typeof trainerAttemptFromRow>[] = [];
  try {
    trainerAttempts = await loadTrainerAttempts(serviceClient, user.id);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load Trainer stats." }, { status: 400 });
  }
  const stats = calculateTrainerStats(trainerAttempts);

  return NextResponse.json({
    signedIn: true,
    decks: decks.map(savedDeckOption),
    selectedDeckId: decks[0]?.id ?? "",
    stats,
    currentHand: null
  });
}

export async function POST(request: NextRequest) {
  const context = await requireUser(request);
  if ("error" in context) {
    return context.error;
  }

  const body = (await request.json().catch(() => ({}))) as { deckId?: unknown };
  const deckId = typeof body.deckId === "string" ? body.deckId : "";
  if (!deckId) {
    return NextResponse.json({ error: "Choose a deck before dealing a trainer hand." }, { status: 400 });
  }

  const { user, serviceClient } = context;
  const { data: deckData, error: deckError } = await serviceClient
    .from("decks")
    .select("id, name, format, decklist, parsed_json")
    .eq("id", deckId)
    .eq("user_id", user.id)
    .eq("is_archived", false)
    .maybeSingle();

  if (deckError) {
    return NextResponse.json({ error: deckError.message }, { status: 400 });
  }
  if (!deckData) {
    return NextResponse.json({ error: "Could not find that saved deck." }, { status: 404 });
  }

  const deck = deckData as SavedDeckRow;
  const parsed = parseDecklist(deck.decklist);
  if (parsed.mainCount < 7) {
    return NextResponse.json({ error: "This deck needs at least seven main-deck cards to use the trainer." }, { status: 400 });
  }

  const seed = `${user.id}:${deck.id}:${crypto.randomUUID()}`;
  const hand = generateSeededOpeningHand(deck.decklist, seed).hand;
  if (hand.length !== 7) {
    return NextResponse.json({ error: "Could not deal a complete seven-card hand from this deck." }, { status: 400 });
  }

  const playDraw: PlayDraw = deterministicIndex(`${seed}:play-draw`, 2) === 0 ? "play" : "draw";
  const presentation = await loadTrainerCardPresentation(hand, deck.parsed_json);
  const { data: inserted, error: insertError } = await serviceClient
    .from("magic_trainer_hands")
    .insert({
      user_id: user.id,
      deck_id: deck.id,
      deck_name: deck.name,
      format: deck.format ?? "Unknown",
      decklist_snapshot: deck.decklist,
      seed,
      hand,
      play_draw: playDraw,
      analyzer_version: keepTrainerAnalyzerVersion
    })
    .select("id, deck_id, deck_name, format, hand, play_draw, answered_at, correct_answer, explanation_json")
    .maybeSingle();

  if (insertError) {
    if (isMissingTrainerTableError(insertError)) {
      return NextResponse.json({ error: "Trainer storage is not configured. Apply the Keep Trainer database migration and retry." }, { status: 503 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }
  if (!inserted) {
    return NextResponse.json({ error: "Could not save the trainer hand." }, { status: 400 });
  }

  return NextResponse.json({
    currentHand: publicTrainerHand(inserted as Parameters<typeof publicTrainerHand>[0], undefined, presentation),
    stats: calculateTrainerStats(await loadTrainerAttempts(serviceClient, user.id))
  });
}
