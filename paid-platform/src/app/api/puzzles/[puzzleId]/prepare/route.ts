import { NextRequest, NextResponse } from "next/server";
import {
  createServerAnonSupabaseClient,
  createServerSupabaseClient,
  isServerAnonSupabaseConfigured,
  isServerSupabaseConfigured
} from "@/lib/serverSupabase";
import {
  completeMagicPuzzleAnalysis,
  isLightweightTrainerPuzzle,
  magicPuzzleFromDatabaseRow,
  magicPuzzleToDatabaseRow,
  type MagicPuzzleDatabaseRow
} from "@/lib/magicPuzzles";

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
}

export async function POST(request: NextRequest, context: { params: { puzzleId: string } }) {
  const token = bearerToken(request);
  if (!token || !isServerAnonSupabaseConfigured || !isServerSupabaseConfigured) {
    return NextResponse.json({ error: "Sign in to prepare trainer analysis." }, { status: 401 });
  }

  const authClient = createServerAnonSupabaseClient(token);
  const serviceClient = createServerSupabaseClient();
  if (!authClient || !serviceClient) {
    return NextResponse.json({ error: "Trainer storage is not configured." }, { status: 503 });
  }

  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Sign in to prepare trainer analysis." }, { status: 401 });
  }

  const { data } = await serviceClient
    .from("magic_puzzles")
    .select("*")
    .eq("id", context.params.puzzleId)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ error: "Trainer hand was not found." }, { status: 404 });
  }

  const puzzle = magicPuzzleFromDatabaseRow(data as MagicPuzzleDatabaseRow);
  if (!isLightweightTrainerPuzzle(puzzle)) {
    return NextResponse.json({ ready: true });
  }

  const completedPuzzle = completeMagicPuzzleAnalysis(puzzle);
  const { error } = await serviceClient
    .from("magic_puzzles")
    .upsert(magicPuzzleToDatabaseRow(completedPuzzle), { onConflict: "id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ready: true });
}
