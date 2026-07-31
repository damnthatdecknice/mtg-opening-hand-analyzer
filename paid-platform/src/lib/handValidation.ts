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
  return name
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[â€™‘’`]/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s*\/\/\s*/g, " // ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function fuzzyKey(name: string) {
  return normalizeCardInputName(name)
    .replace(/\/\/.*$/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

function editDistance(a: string, b: string) {
  if (a === b) {
    return 0;
  }
  if (!a.length) {
    return b.length;
  }
  if (!b.length) {
    return a.length;
  }

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let aIndex = 1; aIndex <= a.length; aIndex += 1) {
    current[0] = aIndex;
    for (let bIndex = 1; bIndex <= b.length; bIndex += 1) {
      const cost = a[aIndex - 1] === b[bIndex - 1] ? 0 : 1;
      current[bIndex] = Math.min(current[bIndex - 1]! + 1, previous[bIndex]! + 1, previous[bIndex - 1]! + cost);
    }
    for (let index = 0; index < previous.length; index += 1) {
      previous[index] = current[index]!;
    }
  }

  return previous[b.length]!;
}

function resolveFuzzyAlias(rawName: string, aliases: Map<string, string>) {
  const inputKey = fuzzyKey(rawName);
  if (inputKey.length < 5) {
    return "";
  }

  const rankedByResolved = new Map<string, { resolved: string; distance: number; similarity: number }>();
  for (const entry of Array.from(aliases.entries())
    .map(([alias, resolved]) => {
      const aliasKey = fuzzyKey(alias);
      if (!aliasKey || Math.abs(aliasKey.length - inputKey.length) > Math.max(3, Math.ceil(inputKey.length * 0.35))) {
        return null;
      }
      const distance = editDistance(inputKey, aliasKey);
      const similarity = 1 - distance / Math.max(inputKey.length, aliasKey.length);
      return { resolved, distance, similarity };
    })
    .filter((entry): entry is { resolved: string; distance: number; similarity: number } => Boolean(entry))) {
    const existing = rankedByResolved.get(entry.resolved);
    if (!existing || entry.similarity > existing.similarity || (entry.similarity === existing.similarity && entry.distance < existing.distance)) {
      rankedByResolved.set(entry.resolved, entry);
    }
  }

  const ranked = Array.from(rankedByResolved.values())
    .sort((a, b) => b.similarity - a.similarity || a.distance - b.distance);

  const best = ranked[0];
  const second = ranked[1];
  if (!best) {
    return "";
  }

  const maxDistance = Math.max(2, Math.ceil(inputKey.length * 0.26));
  const clearBest = !second || best.similarity - second.similarity >= 0.08 || best.distance + 2 <= second.distance;
  return best.distance <= maxDistance && best.similarity >= 0.72 && clearBest ? best.resolved : "";
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
    const resolved = aliases.get(normalizeCardInputName(rawName)) ?? resolveFuzzyAlias(rawName, aliases);
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
