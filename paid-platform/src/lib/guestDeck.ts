import type { DeckImportMetadata, ParsedDeck } from "./deckParser";

export const guestDeckStorageKey = "opening-edge:guest-deck";
const guestDeckMaxAgeMs = 7 * 24 * 60 * 60 * 1000;

export type GuestDeck = {
  name: string;
  format: string;
  decklist: string;
  parsedMainCount: number;
  parsedSideboardCount: number;
  importMetadata?: DeckImportMetadata;
  createdAt: number;
};

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): BrowserStorage | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.sessionStorage;
}

export function guestDeckFromParsed({
  decklist,
  format,
  importMetadata,
  name,
  parsed,
  now = Date.now()
}: {
  name: string;
  format: string;
  decklist: string;
  parsed: ParsedDeck;
  importMetadata?: DeckImportMetadata;
  now?: number;
}): GuestDeck {
  const deck: GuestDeck = {
    name: name.trim() || "Guest Deck",
    format: format.trim() || "Standard",
    decklist,
    parsedMainCount: parsed.mainCount,
    parsedSideboardCount: parsed.sideboardCount,
    createdAt: now
  };
  if (importMetadata) {
    deck.importMetadata = importMetadata;
  }
  return deck;
}

export function serializeGuestDeck(deck: GuestDeck) {
  return JSON.stringify(deck);
}

export function parseGuestDeck(value: string | null, now = Date.now()): GuestDeck | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<GuestDeck>;
    if (
      typeof parsed.name !== "string" ||
      typeof parsed.format !== "string" ||
      typeof parsed.decklist !== "string" ||
      typeof parsed.parsedMainCount !== "number" ||
      typeof parsed.parsedSideboardCount !== "number" ||
      typeof parsed.createdAt !== "number"
    ) {
      return null;
    }

    if (now - parsed.createdAt > guestDeckMaxAgeMs) {
      return null;
    }

    return parsed as GuestDeck;
  } catch {
    return null;
  }
}

export function saveGuestDeck(deck: GuestDeck) {
  storage()?.setItem(guestDeckStorageKey, serializeGuestDeck(deck));
}

export function loadGuestDeck(now = Date.now()) {
  const stored = storage()?.getItem(guestDeckStorageKey) ?? null;
  const parsed = parseGuestDeck(stored, now);
  if (!parsed && stored) {
    clearGuestDeck();
  }
  return parsed;
}

export function clearGuestDeck() {
  storage()?.removeItem(guestDeckStorageKey);
}
