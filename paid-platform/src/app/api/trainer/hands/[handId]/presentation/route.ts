import { NextResponse } from "next/server";
import { createServerAnonSupabaseClient, isServerAnonSupabaseConfigured } from "@/lib/serverSupabase";
import { publicTrainerHand, type TrainerAnswer, type TrainerExplanation } from "@/lib/keepTrainer";
import { loadTrainerCardPresentation } from "@/lib/serverCardPresentation";
import type { ParsedDeck } from "@/lib/deckParser";

export const runtime = "nodejs";

type TrainerHandRow = {
  id: string;
  user_id: string;
  deck_id: string;
  deck_name: string;
  format: string;
  hand: unknown;
  play_draw: "play" | "draw";
  answered_at: string | null;
  pending_answer: TrainerAnswer | null;
  analysis_status: "pending" | "running" | "ready" | "failed" | null;
  analysis_error: string | null;
  deck_metadata_snapshot: ParsedDeck | null;
  correct_answer: TrainerAnswer | null;
  explanation_json: TrainerExplanation | null;
};

function isAbortError(error: unknown) {
  return (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError");
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ handId: string }> }
) {
  if (!isServerAnonSupabaseConfigured) {
    return NextResponse.json({ error: "Trainer storage is not configured." }, { status: 503 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  if (!accessToken) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { handId } = await params;
  const userClient = createServerAnonSupabaseClient(accessToken);
  if (!userClient) {
    return NextResponse.json({ error: "Trainer storage is not configured." }, { status: 503 });
  }
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Session expired. Sign in again." }, { status: 401 });
  }

  const serviceClient = userClient;
  const { data: handRow, error: handError } = await serviceClient
    .from("magic_trainer_hands")
    .select("id,user_id,deck_id,deck_name,format,hand,play_draw,answered_at,pending_answer,analysis_status,analysis_error,deck_metadata_snapshot,correct_answer,explanation_json")
    .eq("id", handId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (handError) {
    return NextResponse.json({ error: handError.message }, { status: 500 });
  }
  if (!handRow) {
    return NextResponse.json({ error: "Trainer hand not found." }, { status: 404 });
  }

  try {
    const hand = Array.isArray(handRow.hand)
      ? handRow.hand.map(String)
      : typeof handRow.hand === "string"
        ? JSON.parse(handRow.hand).map(String)
        : [];
    let parsedDeck = handRow.deck_metadata_snapshot ?? null;
    if (!parsedDeck) {
      const { data: deckRow, error: deckError } = await serviceClient
        .from("decks")
        .select("parsed_json")
        .eq("id", handRow.deck_id)
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (deckError) {
        return NextResponse.json({ error: deckError.message }, { status: 500 });
      }
      parsedDeck = (deckRow?.parsed_json as ParsedDeck | null | undefined) ?? null;
    }
    const presentation = await loadTrainerCardPresentation(
      hand,
      parsedDeck,
      { signal: request.signal }
    );

    return NextResponse.json({
      currentHand: publicTrainerHand(
        { ...handRow, hand } as Omit<TrainerHandRow, "hand"> & { hand: string[] },
        undefined,
        presentation
      )
    });
  } catch (error) {
    if (request.signal.aborted || isAbortError(error)) {
      return new NextResponse(null, { status: 499 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load card images." },
      { status: 502 }
    );
  }
}
