import puzzleDecksJson from "./puzzleDecks.json";

export type PuzzleDeck = {
  id: string;
  name: string;
  format: string;
  archetype: string;
  decklist: string;
};

export const puzzleDecks = puzzleDecksJson as PuzzleDeck[];
