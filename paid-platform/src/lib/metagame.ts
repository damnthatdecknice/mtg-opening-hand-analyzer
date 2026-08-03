export type MetagameFormat = "Standard" | "Pioneer" | "Modern" | "Legacy";
export type MetagameWindowDays = 7 | 14 | 30;

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
  main: Array<{ name: string; qty: number; cardType?: string; colors?: string[] }>;
  sideboard: Array<{ name: string; qty: number; cardType?: string; colors?: string[] }>;
};

export type MetagameEvent = {
  name: string;
  date: string;
  url: string;
  deckCount: number;
};

export type MetagameArchetype = {
  name: string;
  sourceName: string;
  decks: number;
  share: number;
  previousShare: number;
  change: number;
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
export const metagameWindowOptions: MetagameWindowDays[] = [7, 14, 30];

const dayMs = 24 * 60 * 60 * 1000;

/**
 * MTGO's main decklists page only contains the current calendar month. Return
 * every archive page needed for the selected window and its equally sized
 * comparison window, newest first.
 */
export function buildMetagameArchivePaths(nowMs: number, windowDays: MetagameWindowDays) {
  const current = new Date(nowMs);
  const earliest = new Date(nowMs - windowDays * 2 * dayMs);
  const currentMonthIndex = current.getUTCFullYear() * 12 + current.getUTCMonth();
  const earliestMonthIndex = earliest.getUTCFullYear() * 12 + earliest.getUTCMonth();
  const paths: string[] = [];

  for (let monthIndex = currentMonthIndex; monthIndex >= earliestMonthIndex; monthIndex -= 1) {
    const year = Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    paths.push(`/decklists/${year}/${String(month).padStart(2, "0")}`);
  }

  return paths;
}

export function isMetagameFormat(value: string | null): value is MetagameFormat {
  return metagameFormats.includes(value as MetagameFormat);
}

export function isMetagameWindowDays(value: number): value is MetagameWindowDays {
  return metagameWindowOptions.includes(value as MetagameWindowDays);
}

export function isMatchingMetagameEventName(name: string, format: MetagameFormat) {
  return new RegExp(`(^|[^a-z])${format.toLowerCase()}([^a-z]|$)`, "i").test(name);
}
