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

function decodeXmlAttribute(value: string) {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function xmlAttribute(tag: string, attribute: string) {
  const match = tag.match(new RegExp(`${attribute}="([^"]*)"`, "i"));
  return match ? decodeXmlAttribute(match[1] ?? "") : "";
}

export function convertDekToDecklist(dekText: string) {
  const main = new Map<string, number>();
  const sideboard = new Map<string, number>();
  const cardTags = Array.from(dekText.matchAll(/<Cards\b[^>]*\/?>/gi)).map((match) => match[0] ?? "");

  for (const tag of cardTags) {
    const name = xmlAttribute(tag, "Name").trim();
    const qty = Number(xmlAttribute(tag, "Quantity") || 0);
    const isSideboard = xmlAttribute(tag, "Sideboard").toLowerCase() === "true";
    if (!name || !qty) {
      continue;
    }
    const target = isSideboard ? sideboard : main;
    target.set(name, (target.get(name) ?? 0) + qty);
  }

  const lines = ["Deck"];
  for (const [name, qty] of Array.from(main.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`${qty} ${name}`);
  }

  if (sideboard.size) {
    lines.push("", "Sideboard");
    for (const [name, qty] of Array.from(sideboard.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`${qty} ${name}`);
    }
  }

  return lines.join("\n");
}

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
