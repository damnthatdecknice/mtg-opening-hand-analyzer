export type ParsedDeckCard = {
  qty: number;
  name: string;
  section: "main" | "sideboard";
};

export type ParsedDeck = {
  mainCount: number;
  sideboardCount: number;
  cards: ParsedDeckCard[];
};

const sectionHeaders = new Set(["deck", "main", "maindeck"]);

export function parseDecklist(decklist: string): ParsedDeck {
  let section: ParsedDeckCard["section"] = "main";
  const cards: ParsedDeckCard[] = [];

  for (const rawLine of decklist.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const lower = line.toLowerCase();
    if (sectionHeaders.has(lower)) {
      section = "main";
      continue;
    }

    if (lower === "sideboard") {
      section = "sideboard";
      continue;
    }

    const match = line.match(/^(\d+)\s+(.+?)\s*(?:\([^)]+\)\s*\d*)?$/);
    if (!match) {
      continue;
    }

    cards.push({
      qty: Number(match[1]),
      name: match[2].trim(),
      section
    });
  }

  return {
    mainCount: cards
      .filter((card) => card.section === "main")
      .reduce((total, card) => total + card.qty, 0),
    sideboardCount: cards
      .filter((card) => card.section === "sideboard")
      .reduce((total, card) => total + card.qty, 0),
    cards
  };
}

export function inferDeckName(decklist: string) {
  const firstCard = parseDecklist(decklist).cards[0]?.name;
  return firstCard ? `${firstCard} Deck` : "Untitled Deck";
}
