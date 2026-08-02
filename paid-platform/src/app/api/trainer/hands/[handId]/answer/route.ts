import { NextRequest, NextResponse } from "next/server";
import { analyzeOpeningHand, fetchCardData, type PlayDraw } from "@/lib/analyzer";
import { parseDecklist, type ParsedDeck } from "@/lib/deckParser";
import {
  calculateTrainerStats,
  isTrainerAnswer,
  keepTrainerAnalyzerVersion,
  keepTrainerScoringSettings,
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
  const { data } = await serviceClient
    .from("magic_trainer_attempts")
    .select("selected_answer, is_correct, rating_before, rating_after, attempted_at")
    .eq("user_id", userId)
    .order("attempted_at", { ascending: true });

  return ((data ?? []) as TrainerAttemptRow[]).map(trainerAttemptFromRow);
}

function handArray(hand: TrainerHandRow["hand"]) {
  return Array.isArray(hand) ? hand : JSON.parse(hand);
}

function mtgoIdsByName(parsed?: ParsedDeck | null) {
  const result: Record<string, number[]> = {};
  for (const identity of parsed?.importMetadata?.cards ?? []) {
    if (!identity.catId) {
      continue;
    }
    result[identity.name] = Array.from(new Set([...(result[identity.name] ?? []), identity.catId]));
  }
  return result;
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
    return NextResponse.json({ error: handError.message }, { status: 400 });
  }
  if (!handData) {
    return NextResponse.json({ error: "Could not find that trainer hand." }, { status: 404 });
  }

  const handRow = handData as TrainerHandRow;
  const existingAttempt = await serviceClient
    .from("magic_trainer_attempts")
    .select("selected_answer, is_correct, rating_before, rating_after, attempted_at")
    .eq("trainer_hand_id", handRow.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (handRow.answered_at || existingAttempt.data) {
    const selected = (existingAttempt.data as TrainerAttemptRow | null)?.selected_answer ?? body.answer;
    return NextResponse.json(
      {
        error: "You already answered this trainer hand.",
        currentHand: publicTrainerHand(handRow, selected),
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

  const { data: deckIdentity } = await serviceClient
    .from("decks")
    .select("parsed_json")
    .eq("id", handRow.deck_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const parsed = parseDecklist(handRow.decklist_snapshot);
  const hand = handArray(handRow.hand);
  const cardNames = Array.from(new Set([...parsed.cards.map((card) => card.name), ...hand]));
  const lookup = await fetchCardData(cardNames, {
    exactMtgoImagesOnly: true,
    mtgoIdsByName: mtgoIdsByName((deckIdentity as SavedDeckIdentityRow | null)?.parsed_json),
    retryFailures: true
  });

  const unresolved = lookup.unresolvedCards?.length ? lookup.unresolvedCards : [];
  if (lookup.operationFailure || lookup.failures.length || unresolved.length) {
    return NextResponse.json(
      {
        error: lookup.operationFailure?.message ?? `Card data could not be loaded for: ${unresolved.join(", ") || lookup.failures[0]}.`
      },
      { status: 502 }
    );
  }

  const analysis = analyzeOpeningHand(handRow.decklist_snapshot, hand, lookup.lookups, handRow.play_draw, {
    format: handRow.format,
    scoringSettings: keepTrainerScoringSettings
  });

  if (analysis.missingCards.length) {
    return NextResponse.json(
      { error: `Card data could not be loaded for: ${analysis.missingCards.join(", ")}.` },
      { status: 422 }
    );
  }

  const correctAnswer = trainerAnswerFromAnalysis(analysis);
  const explanation = trainerExplanationFromAnalysis(analysis, correctAnswer);
  const previousAttempts = await loadAttempts(serviceClient, user.id);
  const ratingBefore = calculateTrainerStats(previousAttempts).rating;
  const isCorrect = body.answer === correctAnswer;
  const ratingAfter = Math.max(100, Math.min(2500, ratingBefore + (isCorrect ? 14 : -11)));

  const { error: updateError } = await serviceClient
    .from("magic_trainer_hands")
    .update({
      correct_answer: correctAnswer,
      analysis_json: analysis,
      explanation_json: explanation,
      answered_at: new Date().toISOString(),
      analyzer_version: analysis.scoringVersion || keepTrainerAnalyzerVersion
    })
    .eq("id", handRow.id)
    .eq("user_id", user.id)
    .is("answered_at", null);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
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
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  return NextResponse.json({
    reveal: {
      correct: isCorrect,
      correctAnswer,
      explanation
    },
    currentHand: {
      ...publicTrainerHand({
        ...handRow,
        correct_answer: correctAnswer,
        explanation_json: explanation,
        answered_at: new Date().toISOString()
      }, body.answer)
    },
    stats: calculateTrainerStats(await loadAttempts(serviceClient, user.id))
  });
}
