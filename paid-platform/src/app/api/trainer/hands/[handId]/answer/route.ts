import { NextRequest, NextResponse } from "next/server";
import { type AnalyzerResult, type PlayDraw } from "@/lib/analyzer";
import {
  calculateTrainerStats,
  isTrainerAnswer,
  publicTrainerHand,
  trainerAttemptFromRow,
  trainerRatingDeltaFromAnalysis,
  type TrainerAnswer,
  type TrainerExplanation
} from "@/lib/keepTrainer";
import {
  createServerAnonSupabaseClient,
  isServerAnonSupabaseConfigured
} from "@/lib/serverSupabase";
import {
  prepareTrainerAnalysis,
  uniqueTrainerCardNames,
  type PreparedTrainerAnalysis
} from "@/lib/serverTrainerAnalysis";

export const runtime = "nodejs";

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
  explanation_json?: TrainerExplanation | null;
  analyzer_version?: string | null;
  answered_at?: string | null;
};

type TrainerAttemptRow = {
  selected_answer: TrainerAnswer;
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

function incompleteCardDataResponse(
  handRow: TrainerHandRow,
  selectedAnswer: TrainerAnswer,
  unresolvedCards: string[]
) {
  return NextResponse.json(
    {
      error: {
        code: "CARD_DATA_INCOMPLETE",
        message: "Opening Edge could not reach the card database. Your hand and answer were preserved.",
        retryable: true,
        unresolvedCards: uniqueTrainerCardNames(unresolvedCards).slice(0, 5),
        unresolvedCount: uniqueTrainerCardNames(unresolvedCards).length
      },
      currentHand: publicTrainerHand(handRow, selectedAnswer)
    },
    { status: 503 }
  );
}

function preparedAnalysisFromRow(row: TrainerHandRow): PreparedTrainerAnalysis | null {
  const analysis = row.analysis_json as Partial<AnalyzerResult> | null | undefined;
  if (
    !row.correct_answer ||
    !row.explanation_json ||
    !analysis ||
    typeof analysis.scoringVersion !== "string"
  ) {
    return null;
  }
  return {
    analysis: analysis as AnalyzerResult,
    correctAnswer: row.correct_answer,
    explanation: row.explanation_json
  };
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
  const hand = handArray(handRow.hand);

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

  let prepared = preparedAnalysisFromRow(handRow);
  if (!prepared) {
    const result = await prepareTrainerAnalysis({
      decklistSnapshot: handRow.decklist_snapshot,
      format: handRow.format,
      hand,
      playDraw: handRow.play_draw
    });
    if (!result.ok) {
      return incompleteCardDataResponse(handRow, body.answer, result.unresolvedCards);
    }
    prepared = result;
  }

  const { analysis, correctAnswer, explanation } = prepared;
  const previousAttempts = await loadAttempts(serviceClient, user.id);
  const ratingBefore = calculateTrainerStats(previousAttempts).rating;
  const isCorrect = body.answer === correctAnswer;
  const ratingAfter = Math.max(100, Math.min(2500, ratingBefore + trainerRatingDeltaFromAnalysis(analysis, isCorrect)));

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
        currentHand: publicTrainerHand(handRow, body.answer),
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
    currentHand: publicTrainerHand(updatedHand as Parameters<typeof publicTrainerHand>[0], body.answer),
    stats: calculateTrainerStats(await loadAttempts(serviceClient, user.id))
  });
}
