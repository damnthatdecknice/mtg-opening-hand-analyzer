import { parseDecklist } from "./deckParser";

export type HandValidationSeverity = "error" | "warning" | "info";

export type HandValidationIssue = {
  code: string;
  severity: HandValidationSeverity;
  message: string;
  cardName?: string;
};

export type OpeningHandValidationResult = {
  hand: string[];
  error: string;
  issues: HandValidationIssue[];
};

function normalizeCardInputName(name: string) {
  return name.trim().toLowerCase().replace(/[’`]/g, "'");
}

export function mainDeckNameAliases(decklist: string) {
  const aliases = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const card of parseDecklist(decklist).cards.filter((entry) => entry.section === "main")) {
    counts.set(card.name, (counts.get(card.name) ?? 0) + card.qty);
    aliases.set(normalizeCardInputName(card.name), card.name);
    for (const face of card.name.split("//").map((part) => part.trim()).filter(Boolean)) {
      aliases.set(normalizeCardInputName(face), card.name);
    }
  }
  return { aliases, counts };
}

export function validateOpeningHandAgainstDeck(handRows: string[], decklist: string): OpeningHandValidationResult {
  const rows = handRows.map((row) => row.trim());

  if (rows.length !== 7) {
    const message =
      rows.length < 7
        ? `Confirm exactly seven cards before analyzing. I found ${rows.length}.`
        : `Confirm exactly seven cards before analyzing. I found ${rows.length}; remove the extra card(s).`;
    return {
      hand: [],
      error: message,
      issues: [{ code: "HAND_SIZE_INVALID", severity: "error", message }]
    };
  }

  const blankIndex = rows.findIndex((row) => !row);
  if (blankIndex >= 0) {
    const message = `Card ${blankIndex + 1} is blank. Confirm exactly seven cards before analyzing.`;
    return {
      hand: [],
      error: message,
      issues: [{ code: "BLANK_CARD_SLOT", severity: "error", message }]
    };
  }

  const { aliases, counts } = mainDeckNameAliases(decklist);
  const used = new Map<string, number>();
  const hand: string[] = [];
  for (const rawName of rows) {
    const resolved = aliases.get(normalizeCardInputName(rawName));
    if (!resolved) {
      const message = `${rawName} is not in the main deck.`;
      return {
        hand: [],
        error: message,
        issues: [{ code: "CARD_NOT_IN_MAIN_DECK", severity: "error", message, cardName: rawName }]
      };
    }

    const nextCount = (used.get(resolved) ?? 0) + 1;
    if (nextCount > (counts.get(resolved) ?? 0)) {
      const message = `${resolved} appears more times in this hand than the main deck allows.`;
      return {
        hand: [],
        error: message,
        issues: [{ code: "CARD_COPY_LIMIT_EXCEEDED", severity: "error", message, cardName: resolved }]
      };
    }

    used.set(resolved, nextCount);
    hand.push(resolved);
  }

  return { hand, error: "", issues: [] };
}

export function validatePastedHandRows(handRows: string[], decklist: string) {
  const rows = handRows.map((row) => row.trim()).filter(Boolean);
  const result = validateOpeningHandAgainstDeck(rows, decklist);

  if (result.error && result.issues[0]?.code === "HAND_SIZE_INVALID") {
    return {
      ...result,
      error:
        rows.length < 7
          ? `Paste exactly seven cards. I found ${rows.length}.`
          : `Paste exactly seven cards. I found ${rows.length}; remove the extra row(s).`
    };
  }

  if (result.error && result.issues[0]?.code === "CARD_COPY_LIMIT_EXCEEDED") {
    return {
      ...result,
      error: result.error.replace("this hand", "the pasted hand")
    };
  }

  return result;
}
