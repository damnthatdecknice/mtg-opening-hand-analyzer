import { NextRequest, NextResponse } from "next/server";
import { type PlayDraw } from "@/lib/analyzer";
import {
  createServerAnonSupabaseClient,
  isServerAnonSupabaseConfigured
} from "@/lib/serverSupabase";
import { prepareTrainerAnalysis } from "@/lib/serverTrainerAnalysis";
import { type TrainerAnswer, type TrainerExplanation } from "@/lib/keepTrainer";

export const runtime = "nodejs";

type TrainerHandRow = {
  id: string;
  user_id: string;
  decklist_snapshot: string;
  hand: string[] | string;
  format: string;
  play_draw: PlayDraw;
  correct_answer?: TrainerAnswer | null;
  analysis_json?: unknown;
  explanation_json?: TrainerExplanation | null;
  analysis_status?: "pending" | "running" | "ready" | "failed" | null;
  analysis_error?: string | null;
};

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
}

function handArray(hand: TrainerHandRow["hand"]) {
  return Array.isArray(hand) ? hand : JSON.parse(hand);
}

function isPrepared(row: TrainerHandRow) {
  return Boolean(row.correct_answer && row.analysis_json && row.explanation_json);
}

function isAbortError(error: unknown) {
  return (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError");
}

export async function POST(
  request: NextRequest,
  context: { params: { handId: string } }
) {
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Sign in to use the Keep Trainer." }, { status: 401 });
  }
  if (!isServerAnonSupabaseConfigured) {
    return NextResponse.json({ error: "Trainer storage is not configured." }, { status: 503 });
  }

  const serviceClient = createServerAnonSupabaseClient(token);
  if (!serviceClient) {
    return NextResponse.json({ error: "Trainer storage is not configured." }, { status: 503 });
  }
  const { data: userData, error: userError } = await serviceClient.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Sign in to use the Keep Trainer." }, { status: 401 });
  }

  const { data, error } = await serviceClient
    .from("magic_trainer_hands")
    .select("id, user_id, decklist_snapshot, hand, format, play_draw, correct_answer, analysis_json, explanation_json, analysis_status, analysis_error")
    .eq("id", context.params.handId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: "Could not find that trainer hand." }, { status: 404 });
  }

  const handRow = data as TrainerHandRow;
  if (isPrepared(handRow)) {
    await serviceClient
      .from("magic_trainer_hands")
      .update({ analysis_status: "ready", analysis_error: null })
      .eq("id", handRow.id)
      .eq("user_id", userData.user.id)
      .is("answered_at", null);
    return NextResponse.json({ status: "ready" });
  }

  const { error: runningError } = await serviceClient
    .from("magic_trainer_hands")
    .update({ analysis_status: "running", analysis_error: null })
    .eq("id", handRow.id)
    .eq("user_id", userData.user.id)
    .is("answered_at", null);
  if (runningError) {
    return NextResponse.json({ error: runningError.message }, { status: 400 });
  }

  let prepared;
  try {
    prepared = await prepareTrainerAnalysis({
      decklistSnapshot: handRow.decklist_snapshot,
      format: handRow.format,
      hand: handArray(handRow.hand),
      playDraw: handRow.play_draw,
      signal: request.signal
    });
  } catch (error) {
    if (request.signal.aborted || isAbortError(error)) {
      return new NextResponse(null, { status: 499 });
    }
    const message = error instanceof Error ? error.message : "Opening Edge could not finish card lookup.";
    await serviceClient
      .from("magic_trainer_hands")
      .update({ analysis_status: "failed", analysis_error: message })
      .eq("id", handRow.id)
      .eq("user_id", userData.user.id)
      .is("answered_at", null);
    return NextResponse.json({ error: { code: "TRAINER_ANALYSIS_FAILED", message, retryable: true } }, { status: 503 });
  }
  if (!prepared.ok) {
    await serviceClient
      .from("magic_trainer_hands")
      .update({ analysis_status: "failed", analysis_error: prepared.message })
      .eq("id", handRow.id)
      .eq("user_id", userData.user.id)
      .is("answered_at", null);
    return NextResponse.json(
      {
        error: {
          code: "CARD_DATA_INCOMPLETE",
          message: prepared.message,
          retryable: true,
          unresolvedCards: prepared.unresolvedCards.slice(0, 5),
          unresolvedCount: prepared.unresolvedCards.length
        }
      },
      { status: 503 }
    );
  }

  const { error: updateError } = await serviceClient
    .from("magic_trainer_hands")
    .update({
      correct_answer: prepared.correctAnswer,
      analysis_json: prepared.analysis,
      explanation_json: prepared.explanation,
      analyzer_version: prepared.analysis.scoringVersion,
      analysis_status: "ready",
      analysis_error: null
    })
    .eq("id", handRow.id)
    .eq("user_id", userData.user.id)
    .is("answered_at", null);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  // The verdict remains server-side until the player commits to Keep or Mulligan.
  return NextResponse.json({ status: "ready" });
}
