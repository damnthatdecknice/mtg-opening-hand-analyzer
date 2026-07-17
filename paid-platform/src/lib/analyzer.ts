import { parseDecklist, type ParsedDeckCard } from "@/lib/deckParser";

export type PlayDraw = "play" | "draw";

export type CardLookup = {
  name: string;
  manaValue: number;
  typeLine: string;
  oracleText: string;
  colors: string[];
  producedMana: string[];
  isLand: boolean;
};

export type TurnProbability = {
  turn: number;
  naturalDraws: number;
  nextLand: number;
  landDrop: number;
};

export type AnalyzerResult = {
  mainCount: number;
  librarySize: number;
  landsInHand: number;
  landsRemaining: number;
  averageManaValue: number;
  handTextureScore: number;
  handTextureLabel: string;
  turnProbabilities: TurnProbability[];
  landNames: string[];
  missingCards: string[];
  lookupFailures: string[];
  notes: string[];
};

type ScryfallCard = {
  name: string;
  mana_value?: number;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  produced_mana?: string[];
  card_faces?: Array<{
    name?: string;
    mana_value?: number;
    type_line?: string;
    oracle_text?: string;
    colors?: string[];
  }>;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function countsFromCards(cards: ParsedDeckCard[]) {
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (card.section !== "main") {
      continue;
    }
    counts.set(card.name, (counts.get(card.name) ?? 0) + card.qty);
  }
  return counts;
}

function chooseCastableFace(card: ScryfallCard) {
  if (!card.card_faces?.length) {
    return null;
  }
  return (
    card.card_faces.find((face) => !face.type_line?.toLowerCase().includes("land")) ??
    card.card_faces[0]
  );
}

function mapScryfallCard(card: ScryfallCard): CardLookup {
  const castableFace = chooseCastableFace(card);
  const typeLine = card.type_line ?? castableFace?.type_line ?? "";
  return {
    name: card.name,
    manaValue: castableFace?.mana_value ?? card.mana_value ?? 0,
    typeLine,
    oracleText: card.oracle_text ?? castableFace?.oracle_text ?? "",
    colors: card.colors ?? castableFace?.colors ?? [],
    producedMana: card.produced_mana ?? [],
    isLand: typeLine.toLowerCase().includes("land")
  };
}

export async function fetchCardData(cardNames: string[]) {
  const uniqueNames = Array.from(new Set(cardNames.map((name) => name.trim()).filter(Boolean)));
  const lookups = new Map<string, CardLookup>();
  const failures: string[] = [];

  for (let index = 0; index < uniqueNames.length; index += 75) {
    const batch = uniqueNames.slice(index, index + 75);
    const response = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        identifiers: batch.map((name) => ({ name }))
      })
    });

    if (!response.ok) {
      failures.push(...batch);
      continue;
    }

    const payload = (await response.json()) as {
      data?: ScryfallCard[];
      not_found?: Array<{ name?: string }>;
    };

    for (const card of payload.data ?? []) {
      lookups.set(normalizeName(card.name), mapScryfallCard(card));
    }

    for (const missing of payload.not_found ?? []) {
      if (missing.name) {
        failures.push(missing.name);
      }
    }
  }

  return { lookups, failures };
}

function comb(n: number, k: number): number {
  if (k < 0 || k > n) {
    return 0;
  }
  const adjustedK = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= adjustedK; i += 1) {
    result = (result * (n - adjustedK + i)) / i;
  }
  return result;
}

function hypergeometric(population: number, successes: number, draws: number, hits: number) {
  const failures = population - successes;
  if (successes > population || draws > population || hits > successes || draws - hits > failures) {
    return 0;
  }
  return (comb(successes, hits) * comb(failures, draws - hits)) / comb(population, draws);
}

function probabilityAtLeast(
  population: number,
  successes: number,
  draws: number,
  minimumHits: number
) {
  if (minimumHits <= 0) {
    return 1;
  }
  const cappedDraws = Math.min(draws, population);
  let total = 0;
  for (let hits = minimumHits; hits <= Math.min(successes, cappedDraws); hits += 1) {
    total += hypergeometric(population, successes, cappedDraws, hits);
  }
  return total;
}

function drawsByTurn(turn: number, playDraw: PlayDraw) {
  return playDraw === "play" ? Math.max(0, turn - 1) : turn;
}

function textureScore(landsInHand: number, averageManaValue: number, twoDropCount: number) {
  const landScore = Math.max(0, 40 - Math.abs(landsInHand - 3) * 16);
  const curveScore = Math.max(0, 35 - Math.max(0, averageManaValue - 2.7) * 16);
  const earlyScore = Math.min(25, twoDropCount * 8);
  return Math.max(0, Math.min(100, Math.round(landScore + curveScore + earlyScore)));
}

function textureLabel(score: number) {
  if (score >= 78) {
    return "Smooth";
  }
  if (score >= 58) {
    return "Playable";
  }
  if (score >= 40) {
    return "Risky";
  }
  return "Mulligan pressure";
}

export function analyzeOpeningHand(
  decklist: string,
  handNames: string[],
  cardData: Map<string, CardLookup>,
  playDraw: PlayDraw
): AnalyzerResult {
  const parsed = parseDecklist(decklist);
  const mainCounts = countsFromCards(parsed.cards);
  const hand = handNames.map((name) => name.trim()).filter(Boolean);
  const missingCards: string[] = [];
  const notes: string[] = [];

  if (hand.length !== 7) {
    notes.push("Enter exactly seven cards for opening-hand math.");
  }

  const normalizedMain = new Map<string, string>();
  for (const name of Array.from(mainCounts.keys())) {
    normalizedMain.set(normalizeName(name), name);
  }

  const library = new Map(mainCounts);
  for (const rawName of hand) {
    const deckName = normalizedMain.get(normalizeName(rawName));
    if (!deckName) {
      missingCards.push(rawName);
      continue;
    }
    library.set(deckName, (library.get(deckName) ?? 0) - 1);
  }

  for (const [name, qty] of Array.from(library.entries())) {
    if (qty <= 0) {
      library.delete(name);
    }
  }

  const landNames = Array.from(mainCounts.keys()).filter((name) => {
    const card = cardData.get(normalizeName(name));
    return card?.isLand ?? false;
  });
  const landSet = new Set(landNames.map(normalizeName));
  const landsInHand = hand.filter((name) => landSet.has(normalizeName(name))).length;
  const librarySize = Array.from(library.values()).reduce((total, qty) => total + qty, 0);
  const landsRemaining = Array.from(library.entries()).reduce(
    (total, [name, qty]) => total + (landSet.has(normalizeName(name)) ? qty : 0),
    0
  );
  const nonlandCards = hand
    .map((name) => cardData.get(normalizeName(name)))
    .filter((card): card is CardLookup => Boolean(card && !card.isLand));
  const averageManaValue = nonlandCards.length
    ? nonlandCards.reduce((total, card) => total + card.manaValue, 0) / nonlandCards.length
    : 0;
  const twoDropCount = nonlandCards.filter((card) => card.manaValue <= 2).length;
  const handTextureScore = textureScore(landsInHand, averageManaValue, twoDropCount);

  const turnProbabilities = Array.from({ length: 7 }, (_, index) => {
    const turn = index + 2;
    const naturalDraws = drawsByTurn(turn, playDraw);
    const neededForDrop = Math.max(0, turn - landsInHand);
    return {
      turn,
      naturalDraws,
      nextLand: probabilityAtLeast(librarySize, landsRemaining, naturalDraws, 1),
      landDrop: probabilityAtLeast(librarySize, landsRemaining, naturalDraws, neededForDrop)
    };
  });

  if (!landNames.length) {
    notes.push("No lands were identified from card data. Check Scryfall lookup status.");
  }

  return {
    mainCount: parsed.mainCount,
    librarySize,
    landsInHand,
    landsRemaining,
    averageManaValue,
    handTextureScore,
    handTextureLabel: textureLabel(handTextureScore),
    turnProbabilities,
    landNames,
    missingCards,
    lookupFailures: [],
    notes
  };
}
