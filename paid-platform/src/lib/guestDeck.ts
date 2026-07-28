import type { DeckImportMetadata, ParsedDeck } from "./deckParser";

export const guestDeckStorageKey = "opening-edge:guest-deck";
export const guestDeckIntentStorageKey = "opening-edge:guest-deck-intent";
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

export type GuestDeckIntent = {
  action: "save-after-auth";
  createdAt: number;
  returnPath: string;
};

type BrowserStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storage(): BrowserStorage | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}

export function safeInternalReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
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

export function serializeGuestDeckIntent(intent: GuestDeckIntent) {
  return JSON.stringify({
    ...intent,
    returnPath: safeInternalReturnPath(intent.returnPath)
  });
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

export function parseGuestDeckIntent(value: string | null, now = Date.now()): GuestDeckIntent | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<GuestDeckIntent>;
    if (
      parsed.action !== "save-after-auth" ||
      typeof parsed.createdAt !== "number" ||
      typeof parsed.returnPath !== "string"
    ) {
      return null;
    }

    if (now - parsed.createdAt > guestDeckMaxAgeMs) {
      return null;
    }

    return {
      action: "save-after-auth",
      createdAt: parsed.createdAt,
      returnPath: safeInternalReturnPath(parsed.returnPath)
    };
  } catch {
    return null;
  }
}

export function saveGuestDeck(deck: GuestDeck) {
  storage()?.setItem(guestDeckStorageKey, serializeGuestDeck(deck));
}

export function saveGuestDeckIntent(intent: Omit<GuestDeckIntent, "createdAt"> & { createdAt?: number }) {
  storage()?.setItem(
    guestDeckIntentStorageKey,
    serializeGuestDeckIntent({
      ...intent,
      createdAt: intent.createdAt ?? Date.now()
    })
  );
}

export function loadGuestDeck(now = Date.now()) {
  const stored = storage()?.getItem(guestDeckStorageKey) ?? null;
  const parsed = parseGuestDeck(stored, now);
  if (!parsed && stored) {
    clearGuestDeck();
  }
  return parsed;
}

export function loadGuestDeckIntent(now = Date.now()) {
  const stored = storage()?.getItem(guestDeckIntentStorageKey) ?? null;
  const parsed = parseGuestDeckIntent(stored, now);
  if (!parsed && stored) {
    clearGuestDeckIntent();
  }
  return parsed;
}

export function clearGuestDeck() {
  storage()?.removeItem(guestDeckStorageKey);
}

export function clearGuestDeckIntent() {
  storage()?.removeItem(guestDeckIntentStorageKey);
}

export function clearGuestDeckMigrationState() {
  clearGuestDeck();
  clearGuestDeckIntent();
}
