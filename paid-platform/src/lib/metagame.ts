export type MetagameFormat = "Standard" | "Pioneer" | "Modern" | "Legacy";

export type MetagameCardCount = {
  name: string;
  count: number;
  decks: number;
  share: number;
};

export type MetagameDeck = {
  player: string;
  eventName: string;
  eventDate: string;
  format: MetagameFormat;
  archetype: string;
  colors: string[];
  rank?: number;
  sourceUrl: string;
  main: Array<{ name: string; qty: number }>;
  sideboard: Array<{ name: string; qty: number }>;
};

export type MetagameEvent = {
  name: string;
  date: string;
  url: string;
  deckCount: number;
};

export type MetagameArchetype = {
  name: string;
  decks: number;
  share: number;
  topCards: MetagameCardCount[];
};

export type MetagameResponse = {
  format: MetagameFormat;
  generatedAt: string;
  source: string;
  windowDays: number;
  deckCount: number;
  eventCount: number;
  events: MetagameEvent[];
  archetypes: MetagameArchetype[];
  topCards: MetagameCardCount[];
  decks: MetagameDeck[];
  warnings: string[];
};

export const metagameFormats: MetagameFormat[] = ["Standard", "Pioneer", "Modern", "Legacy"];

export function isMetagameFormat(value: string | null): value is MetagameFormat {
  return metagameFormats.includes(value as MetagameFormat);
}
