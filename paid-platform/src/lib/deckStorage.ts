import { inferDeckName, parseDecklist, type ParsedDeck } from "./deckParser";
import type { DeckInsert } from "./decks";
import { supabase } from "./supabase";

export type SaveDeckInput = {
  name: string;
  format: string;
  decklist: string;
  parsedJson: ParsedDeck;
};

function sideboardText(parsed: ParsedDeck) {
  return parsed.cards
    .filter((card) => card.section === "sideboard")
    .map((card) => `${card.qty} ${card.name}`)
    .join("\n");
}

export async function saveDeckForCurrentUser(
  input: SaveDeckInput
): Promise<{ deckId: string; error: string }> {
  if (!supabase) {
    return { deckId: "", error: "Supabase is not configured yet." };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { deckId: "", error: "Sign in before saving a deck." };
  }

  const parsed = input.parsedJson.mainCount ? input.parsedJson : parseDecklist(input.decklist);
  if (parsed.mainCount === 0) {
    return { deckId: "", error: "Paste a decklist with at least one main-deck card." };
  }

  const deck: DeckInsert = {
    user_id: userData.user.id,
    name: input.name.trim() || inferDeckName(input.decklist),
    format: input.format.trim() || null,
    decklist: input.decklist,
    sideboard: sideboardText(parsed),
    parsed_json: input.parsedJson
  };

  const { data, error } = await supabase.from("decks").insert(deck).select("id").single();
  return {
    deckId: typeof data?.id === "string" ? data.id : "",
    error: error?.message ?? ""
  };
}
