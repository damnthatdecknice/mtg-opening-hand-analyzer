import { parseDecklist } from "./deckParser";

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

export function validatePastedHandRows(handRows: string[], decklist: string) {
  const rows = handRows.map((row) => row.trim()).filter(Boolean);
  if (rows.length !== 7) {
    return {
      hand: [] as string[],
      error: rows.length < 7 ? `Paste exactly seven cards. I found ${rows.length}.` : `Paste exactly seven cards. I found ${rows.length}; remove the extra row(s).`
    };
  }

  const { aliases, counts } = mainDeckNameAliases(decklist);
  const used = new Map<string, number>();
  const hand: string[] = [];
  for (const rawName of rows) {
    const resolved = aliases.get(normalizeCardInputName(rawName));
    if (!resolved) {
      return { hand: [] as string[], error: `${rawName} is not in the main deck.` };
    }
    const nextCount = (used.get(resolved) ?? 0) + 1;
    if (nextCount > (counts.get(resolved) ?? 0)) {
      return { hand: [] as string[], error: `${resolved} appears more times in the pasted hand than the main deck allows.` };
    }
    used.set(resolved, nextCount);
    hand.push(resolved);
  }

  return { hand, error: "" };
}

