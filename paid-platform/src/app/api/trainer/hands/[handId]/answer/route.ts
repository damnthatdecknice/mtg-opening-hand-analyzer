import { NextRequest, NextResponse } from "next/server";
import { analyzeOpeningHand, fetchCardData, type PlayDraw } from "@/lib/analyzer";
import { parseDecklist, type ParsedDeck } from "@/lib/deckParser";
import {
  calculateTrainerStats,
  isTrainerAnswer,
  publicTrainerHand,
  trainerAnswerFromAnalysis,
  trainerAttemptFromRow,
  trainerExplanationFromAnalysis,
  type TrainerAnswer
} from "@/lib/keepTrainer";
import {
  createServerAnonSupabaseClient,
  isServerAnonSupabaseConfigured
} from "@/lib/serverSupabase";
import { loadTrainerCardPresentation } from "@/lib/serverCardPresentation";

type TrainerHandRow = {
  id: string;
  user_id: string;
  deck_id: string;
  deck_name: string;
  format: string;
  decklist_snapshot: string;
  hand: string[] | string;
  play_draw: PlayDraw;
  correct_answer?: TrainerAnswer | null;
  analysis_json?: unknown;
  explanation_json?: ReturnType<typeof trainerExplanationFromAnalysis> | null;
  answered_at?: string | null;
};

type TrainerAttemptRow = {
  selected_answer: TrainerAnswer;
  is_correct: boolean;
  rating_before?: number | null;
  rating_after?: number | null;
  attempted_at?: string | null;
};

type SavedDeckIdentityRow = {
  parsed_json?: ParsedDeck | null;
};

function isMissingTrainerTableError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "PGRST205" || message.includes("schema cache") || message.includes("does not exist");
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
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

async function loadAttempts(serviceClient: NonNullable<ReturnType<typeof createServerAnonSupabaseClient>>, userId: string) {
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

function handArray(hand: TrainerHandRow["hand"]) {
  return Array.isArray(hand) ? hand : JSON.parse(hand);
}

function uniqueCardNames(names: string[]) {
  return Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
}

function incompleteCardDataResponse(
  handRow: TrainerHandRow,
  selectedAnswer: TrainerAnswer,
  unresolvedCards: string[],
  presentation: Awaited<ReturnType<typeof loadTrainerCardPresentation>>
) {
  return NextResponse.json(
    {
      error: {
        code: "CARD_DATA_INCOMPLETE",
        message: "Opening Edge could not load the full model for this hand.",
        retryable: true,
        unresolvedCards: uniqueCardNames(unresolvedCards)
      },
      currentHand: publicTrainerHand(handRow, selectedAnswer, presentation)
    },
    { status: 503 }
  );
}

export async function POST(request: NextRequest, context: { params: { handId: string } }) {
  const authContext = await requireUser(request);
  if ("error" in authContext) {
    return authContext.error;
  }

  const body = (await request.json().catch(() => ({}))) as { answer?: unknown };
  if (!isTrainerAnswer(body.answer)) {
    return NextResponse.json({ error: "Choose Keep or Mulligan." }, { status: 400 });
  }

  const { user, serviceClient } = authContext;
  const { data: handData, error: handError } = await serviceClient
    .from("magic_trainer_hands")
    .select("*")
    .eq("id", context.params.handId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (handError) {
    if (isMissingTrainerTableError(handError)) {
      return NextResponse.json({ error: "Trainer storage is not configured. Apply the Keep Trainer database migration and retry." }, { status: 503 });
    }
    return NextResponse.json({ error: handError.message }, { status: 400 });
  }
  if (!handData) {
    return NextResponse.json({ error: "Could not find that trainer hand." }, { status: 404 });
  }

  const handRow = handData as TrainerHandRow;
  const { data: deckIdentity } = await serviceClient
    .from("decks")
    .select("parsed_json")
    .eq("id", handRow.deck_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const hand = handArray(handRow.hand);
  const presentation = await loadTrainerCardPresentation(hand, (deckIdentity as SavedDeckIdentityRow | null)?.parsed_json);

  const { data: existingAttempt, error: existingAttemptError } = await serviceClient
    .from("magic_trainer_attempts")
    .select("selected_answer, is_correct, rating_before, rating_after, attempted_at")
    .eq("trainer_hand_id", handRow.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingAttemptError && !isMissingTrainerTableError(existingAttemptError)) {
    return NextResponse.json({ error: existingAttemptError.message }, { status: 400 });
  }

  if (handRow.answered_at || existingAttempt) {
    const selected = ((existingAttempt as TrainerAttemptRow | null)?.selected_answer ?? body.answer) as TrainerAnswer;
    return NextResponse.json(
      {
        error: "You already answered this trainer hand.",
        currentHand: publicTrainerHand(handRow, selected, presentation),
        reveal:
          handRow.correct_answer && handRow.explanation_json
            ? {
                correct: selected === handRow.correct_answer,
                correctAnswer: handRow.correct_answer,
                explanation: handRow.explanation_json
              }
            : undefined,
        stats: calculateTrainerStats(await loadAttempts(serviceClient, user.id))
      },
      { status: 409 }
    );
  }

  const parsed = parseDecklist(handRow.decklist_snapshot);
  const cardNames = uniqueCardNames([...parsed.cards.map((card) => card.name), ...hand]);
  const lookup = await fetchCardData(cardNames, { retryFailures: true }).catch((error) => ({
    lookups: new Map(),
    failures: cardNames,
    unresolvedCards: cardNames,
    operationFailure: {
      kind: "network" as const,
      message: error instanceof Error ? error.message : "Opening Edge could not load card data.",
      retryable: true
    }
  }));

  const unresolvedCards = uniqueCardNames([
    ...(lookup.unresolvedCards ?? []),
    ...lookup.failures,
    ...(lookup.operationFailure ? cardNames.filter((name) => !lookup.lookups.has(name)) : [])
  ]);
  if (lookup.operationFailure || unresolvedCards.length) {
    return incompleteCardDataResponse(handRow, body.answer, unresolvedCards, presentation);
  }

  const analysis = analyzeOpeningHand(handRow.decklist_snapshot, hand, lookup.lookups, handRow.play_draw, {
    format: handRow.format
  });
  if (analysis.missingCards.length) {
    return incompleteCardDataResponse(handRow, body.answer, analysis.missingCards, presentation);
  }

  const correctAnswer = trainerAnswerFromAnalysis(analysis);
  const explanation = trainerExplanationFromAnalysis(analysis, correctAnswer);
  const previousAttempts = await loadAttempts(serviceClient, user.id);
  const ratingBefore = calculateTrainerStats(previousAttempts).rating;
  const isCorrect = body.answer === correctAnswer;
  const ratingAfter = Math.max(100, Math.min(2500, ratingBefore + (isCorrect ? 14 : -11)));

  const { data: updatedHand, error: updateError } = await serviceClient
    .from("magic_trainer_hands")
    .update({
      correct_answer: correctAnswer,
      analysis_json: analysis,
      explanation_json: explanation,
      answered_at: new Date().toISOString(),
      analyzer_version: analysis.scoringVersion
    })
    .eq("id", handRow.id)
    .eq("user_id", user.id)
    .is("answered_at", null)
    .select("id, deck_id, deck_name, format, hand, play_draw, answered_at, correct_answer, explanation_json")
    .maybeSingle();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }
  if (!updatedHand) {
    return NextResponse.json(
      {
        error: "You already answered this trainer hand.",
        currentHand: publicTrainerHand(handRow, body.answer, presentation),
        stats: calculateTrainerStats(await loadAttempts(serviceClient, user.id))
      },
      { status: 409 }
    );
  }

  const { error: insertError } = await serviceClient.from("magic_trainer_attempts").insert({
    trainer_hand_id: handRow.id,
    user_id: user.id,
    deck_id: handRow.deck_id,
    selected_answer: body.answer,
    is_correct: isCorrect,
    rating_before: ratingBefore,
    rating_after: ratingAfter
  });

  if (insertError) {
    if (isMissingTrainerTableError(insertError)) {
      return NextResponse.json({ error: "Trainer storage is not configured. Apply the Keep Trainer database migration and retry." }, { status: 503 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({
    reveal: {
      correct: isCorrect,
      correctAnswer,
      explanation
    },
    currentHand: publicTrainerHand(updatedHand as Parameters<typeof publicTrainerHand>[0], body.answer, presentation),
    stats: calculateTrainerStats(await loadAttempts(serviceClient, user.id))
  });
}
