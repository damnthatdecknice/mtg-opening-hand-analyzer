import type { ParsedDeck } from "@/lib/deckParser";

export type SavedDeck = {
  id: string;
  user_id: string;
  name: string;
  format: string | null;
  decklist: string;
  sideboard: string | null;
  parsed_json: ParsedDeck;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type DeckInsert = {
  user_id: string;
  name: string;
  format: string | null;
  decklist: string;
  sideboard: string | null;
  parsed_json: ParsedDeck;
};

export type DeckVersion = {
  id: string;
  deck_id: string;
  user_id: string;
  version_number: number;
  name: string;
  format: string | null;
  decklist: string;
  sideboard: string | null;
  parsed_json: ParsedDeck;
  created_at: string;
};
