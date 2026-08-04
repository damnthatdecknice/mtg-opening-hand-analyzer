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
import { createServerAnonSupabaseClient, isServerAnonSupabaseConfigured } from "@/lib/serverSupabase";
import { prepareTrainerAnalysis, type PreparedTrainerAnalysis } from "@/lib/serverTrainerAnalysis";

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
  pending_answer?: TrainerAnswer | null;
  answer_locked_at?: string | null;
  analysis_status?: "pending" | "running" | "ready" | "failed" | null;
  analysis_error?: string | null;
};

type TrainerAttemptRow = {
  selected_answer: TrainerAnswer;
  is_correct: boolean;
  rating_before?: number | null;
  rating_after?: number | null;
  rated?: boolean | null;
  rating_delta?: number | null;
  attempted_at?: string | null;
};

function isMissingTrainerTableError(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message ?? "";
  return error?.code === "PGRST205" || message.includes("schema cache") || message.includes("does not exist");
}

function isAbortError(error: unknown) {
  return (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError");
}

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
}

async function requireUser(request: NextRequest) {
  const token = bearerToken(request);
  if (!token) return { error: NextResponse.json({ error: "Sign in to use the Keep Trainer." }, { status: 401 }) };
  if (!isServerAnonSupabaseConfigured) return { error: NextResponse.json({ error: "Trainer storage is not configured." }, { status: 503 }) };
  const serviceClient = createServerAnonSupabaseClient(token);
  if (!serviceClient) return { error: NextResponse.json({ error: "Trainer storage is not configured." }, { status: 503 }) };
  const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
  if (userError || !userData.user) return { error: NextResponse.json({ error: "Sign in to use the Keep Trainer." }, { status: 401 }) };
  return { user: userData.user, serviceClient };
}

async function loadAttempts(serviceClient: NonNullable<ReturnType<typeof createServerAnonSupabaseClient>>, userId: string) {
  const { data, error } = await serviceClient
    .from("magic_trainer_attempts")
    .select("selected_answer, is_correct, rating_before, rating_after, rated, rating_delta, attempted_at")
    .eq("user_id", userId)
    .order("attempted_at", { ascending: true });
  if (error) {
    if (isMissingTrainerTableError(error)) return [];
    throw error;
  }
  return ((data ?? []) as TrainerAttemptRow[]).map(trainerAttemptFromRow);
}

function handArray(hand: TrainerHandRow["hand"]) {
  return Array.isArray(hand) ? hand : JSON.parse(hand) as string[];
}

function preparedAnalysisFromRow(row: TrainerHandRow): PreparedTrainerAnalysis | null {
  const analysis = row.analysis_json as Partial<AnalyzerResult> | null | undefined;
  if (!row.correct_answer || !row.explanation_json || !analysis || typeof analysis.scoringVersion !== "string") return null;
  return { analysis: analysis as AnalyzerResult, correctAnswer: row.correct_answer, explanation: row.explanation_json };
}

function retryableResponse(row: TrainerHandRow, answer: TrainerAnswer, message: string, status = 503) {
  return NextResponse.json({
    error: { code: "TRAINER_ANALYSIS_FAILED", message, retryable: true },
    currentHand: publicTrainerHand(row, answer)
  }, { status });
}

async function reloadHand(serviceClient: NonNullable<ReturnType<typeof createServerAnonSupabaseClient>>, handId: string, userId: string) {
  const { data, error } = await serviceClient
    .from("magic_trainer_hands")
    .select("*")
    .eq("id", handId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data as TrainerHandRow;
}

export async function POST(request: NextRequest, context: { params: { handId: string } }) {
  const authContext = await requireUser(request);
  if ("error" in authContext) return authContext.error;
  const body = (await request.json().catch(() => ({}))) as { answer?: unknown };
  if (!isTrainerAnswer(body.answer)) return NextResponse.json({ error: "Choose Keep or Mulligan." }, { status: 400 });

  const { user, serviceClient } = authContext;
  let handRow = await reloadHand(serviceClient, context.params.handId, user.id);
  if (!handRow) return NextResponse.json({ error: "Could not find that trainer hand." }, { status: 404 });
  const answer = body.answer;

  const { data: existingAttempt, error: existingAttemptError } = await serviceClient
    .from("magic_trainer_attempts")
    .select("selected_answer, is_correct, rating_before, rating_after, rated, rating_delta, attempted_at")
    .eq("trainer_hand_id", handRow.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingAttemptError && !isMissingTrainerTableError(existingAttemptError)) {
    return NextResponse.json({ error: existingAttemptError.message }, { status: 400 });
  }
  if (handRow.answered_at || existingAttempt) {
    const selected = ((existingAttempt as TrainerAttemptRow | null)?.selected_answer ?? handRow.pending_answer ?? answer) as TrainerAnswer;
    return NextResponse.json({
      error: "You already answered this trainer hand.",
      currentHand: publicTrainerHand(handRow, selected),
      reveal: handRow.correct_answer && handRow.explanation_json ? {
        correct: selected === handRow.correct_answer,
        correctAnswer: handRow.correct_answer,
        explanation: handRow.explanation_json
      } : undefined,
      stats: calculateTrainerStats(await loadAttempts(serviceClient, user.id))
    }, { status: 409 });
  }

  if (handRow.pending_answer && handRow.pending_answer !== answer) {
    return NextResponse.json({ error: "This hand already has an answer locked in.", currentHand: publicTrainerHand(handRow, handRow.pending_answer) }, { status: 409 });
  }

  if (!handRow.pending_answer) {
    const { data: locked, error: lockError } = await serviceClient
      .from("magic_trainer_hands")
      .update({ pending_answer: answer, answer_locked_at: new Date().toISOString(), analysis_status: "running", analysis_error: null })
      .eq("id", handRow.id)
      .eq("user_id", user.id)
      .is("answered_at", null)
      .is("pending_answer", null)
      .select("*")
      .maybeSingle();
    if (lockError) return NextResponse.json({ error: lockError.message }, { status: 400 });
    if (locked) handRow = locked as TrainerHandRow;
    else handRow = (await reloadHand(serviceClient, handRow.id, user.id)) ?? handRow;
  }

  let prepared = preparedAnalysisFromRow(handRow);
  if (!prepared) {
    try {
      prepared = await prepareTrainerAnalysis({
        decklistSnapshot: handRow.decklist_snapshot,
        format: handRow.format,
        hand: handArray(handRow.hand),
        playDraw: handRow.play_draw,
        signal: request.signal
      }).then((result) => result.ok ? result : null);
    } catch (error) {
      if (request.signal.aborted || isAbortError(error)) return new NextResponse(null, { status: 499 });
      const message = error instanceof Error ? error.message : "Opening Edge could not finish card lookup.";
      await serviceClient.from("magic_trainer_hands").update({ analysis_status: "failed", analysis_error: message }).eq("id", handRow.id).eq("user_id", user.id).is("answered_at", null);
      const failed = (await reloadHand(serviceClient, handRow.id, user.id)) ?? handRow;
      return retryableResponse(failed, answer, message);
    }
    if (!prepared) {
      const message = "Opening Edge could not finish card lookup. Retry full analysis.";
      await serviceClient.from("magic_trainer_hands").update({ analysis_status: "failed", analysis_error: message }).eq("id", handRow.id).eq("user_id", user.id).is("answered_at", null);
      const failed = (await reloadHand(serviceClient, handRow.id, user.id)) ?? handRow;
      return retryableResponse(failed, answer, message);
    }
    const { error: preparedError } = await serviceClient
      .from("magic_trainer_hands")
      .update({ correct_answer: prepared.correctAnswer, analysis_json: prepared.analysis, explanation_json: prepared.explanation, analyzer_version: prepared.analysis.scoringVersion, analysis_status: "ready", analysis_error: null })
      .eq("id", handRow.id)
      .eq("user_id", user.id)
      .is("answered_at", null);
    if (preparedError) return retryableResponse(handRow, answer, preparedError.message);
    handRow = (await reloadHand(serviceClient, handRow.id, user.id)) ?? handRow;
  }

  const isCorrect = answer === prepared.correctAnswer;
  const ratingDelta = trainerRatingDeltaFromAnalysis(prepared.analysis, isCorrect);
  const { data: finalized, error: finalizeError } = await serviceClient.rpc("finalize_magic_trainer_attempt", {
    p_hand_id: handRow.id,
    p_selected_answer: answer,
    p_rating_delta: ratingDelta
  });
  if (finalizeError) {
    const message = finalizeError.message || "Opening Edge could not finalize this answer.";
    return retryableResponse(handRow, answer, message);
  }

  const finalRow = (await reloadHand(serviceClient, handRow.id, user.id)) ?? handRow;
  return NextResponse.json({
    reveal: { correct: isCorrect, correctAnswer: prepared.correctAnswer, explanation: prepared.explanation },
    rated: Boolean((finalized as { rated?: boolean } | null)?.rated ?? ratingDelta !== 0),
    ratingDelta: Number((finalized as { rating_delta?: number } | null)?.rating_delta ?? ratingDelta),
    currentHand: publicTrainerHand(finalRow, answer),
    stats: calculateTrainerStats(await loadAttempts(serviceClient, user.id))
  });
}
