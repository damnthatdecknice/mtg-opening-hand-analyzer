import { parseDecklist, type ParsedDeckCard } from "@/lib/deckParser";

export type PlayDraw = "play" | "draw";

export type CardLookup = {
  name: string;
  manaValue: number;
  typeLine: string;
  oracleText: string;
  colors: string[];
  producedMana: string[];
  faces: Array<{ name: string; typeLine: string; oracleText: string }>;
  isLand: boolean;
  isMultiface: boolean;
};

export type SourceNote = {
  cardName: string;
  sourceType: string;
  timing: string;
  text: string;
};

export type CastabilityRow = {
  cardName: string;
  manaValue: number;
  turn1: number;
  turn2: number;
  turn3: number;
};

export type TurnProbability = {
  turn: number;
  naturalDraws: number;
  extraLooks: number;
  nextLandNatural: number;
  nextLandWithDraw: number;
  landDropNatural: number;
  landDropWithDraw: number;
  effectiveLandDrop: number;
};

export type CurveRow = {
  manaValue: string;
  spells: number;
};

export type MulliganSummary = {
  average: number;
  median: number;
  better: number;
  p25: number;
  p75: number;
};

export type AnalyzerResult = {
  mainCount: number;
  librarySize: number;
  landsInHand: number;
  effectiveLandsInHand: number;
  landsRemaining: number;
  effectiveLandsRemaining: number;
  averageManaValue: number;
  handTextureScore: number;
  handTextureLabel: string;
  recommendation: string;
  recommendationTone: "good" | "neutral" | "bad";
  turnProbabilities: TurnProbability[];
  castability: CastabilityRow[];
  curve: CurveRow[];
  drawSources: SourceNote[];
  rampSources: SourceNote[];
  landEquivalentSources: SourceNote[];
  tags: Array<{ label: string; tone: "good" | "neutral" | "bad" }>;
  watchouts: string[];
  mulligan: MulliganSummary | null;
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

function countsFromCards(cards: ParsedDeckCard[], includeSideboard = false) {
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (!includeSideboard && card.section !== "main") {
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

function allText(card: CardLookup) {
  return [card.oracleText, ...card.faces.map((face) => face.oracleText)].join(" ").toLowerCase();
}

function allTypeText(card: CardLookup) {
  return [card.typeLine, ...card.faces.map((face) => face.typeLine)].join(" ");
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
    faces:
      card.card_faces?.map((face) => ({
        name: face.name ?? "",
        typeLine: face.type_line ?? "",
        oracleText: face.oracle_text ?? ""
      })) ?? [],
    isLand: typeLine.toLowerCase().includes("land"),
    isMultiface: Boolean(card.card_faces?.length)
  };
}

export async function fetchCardData(cardNames: string[]) {
  const uniqueNames = Array.from(new Set(cardNames.map((name) => name.trim()).filter(Boolean)));
  const lookups = new Map<string, CardLookup>();
  const failures: string[] = [];

  for (let index = 0; index < uniqueNames.length; index += 75) {
    const batch = uniqueNames.slice(index, index + 75);
    let response: Response | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      response = await fetch("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) })
      });
      if (response.ok) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }

    if (!response?.ok) {
      failures.push(...batch);
      continue;
    }

    const payload = (await response.json()) as {
      data?: ScryfallCard[];
      not_found?: Array<{ name?: string }>;
    };

    for (const card of payload.data ?? []) {
      const mapped = mapScryfallCard(card);
      lookups.set(normalizeName(mapped.name), mapped);
      for (const face of mapped.faces) {
        if (face.name) {
          lookups.set(normalizeName(face.name), mapped);
        }
      }
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

function probabilityAtLeast(population: number, successes: number, draws: number, minimumHits: number) {
  if (minimumHits <= 0) {
    return 1;
  }
  const cappedDraws = Math.max(0, Math.min(draws, population));
  let total = 0;
  for (let hits = minimumHits; hits <= Math.min(successes, cappedDraws); hits += 1) {
    total += hypergeometric(population, successes, cappedDraws, hits);
  }
  return Math.max(0, Math.min(1, total));
}

function probabilityWithFractionalLooks(
  population: number,
  successes: number,
  naturalDraws: number,
  extraLooks: number,
  minimumHits: number
) {
  const lower = Math.floor(extraLooks);
  const fraction = extraLooks - lower;
  const low = probabilityAtLeast(population, successes, naturalDraws + lower, minimumHits);
  const high = probabilityAtLeast(population, successes, naturalDraws + lower + 1, minimumHits);
  return low * (1 - fraction) + high * fraction;
}

function drawsByTurn(turn: number, playDraw: PlayDraw) {
  return playDraw === "play" ? Math.max(0, turn - 1) : turn;
}

function numberWord(raw: string) {
  const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
  return /^\d+$/.test(raw) ? Number(raw) : words[raw.toLowerCase()] ?? 0;
}

function drawDepth(card: CardLookup) {
  const text = allText(card);
  if (text.includes("each player draws") || text.includes("target player draws")) {
    return { drawn: 0, seen: 0 };
  }
  const drawMatches = Array.from(text.matchAll(/\bdraw\s+(a|an|one|two|three|four|five|\d+)\s+cards?\b/g));
  const selectionMatches = [
    ...Array.from(text.matchAll(/\bscry\s+(\d+|one|two|three|four|five)\b/g)),
    ...Array.from(text.matchAll(/\bsurveil\s+(\d+|one|two|three|four|five)\b/g)),
    ...Array.from(text.matchAll(/\blook at the top\s+(\d+|one|two|three|four|five)\s+cards?\b/g))
  ];
  const drawn = Math.max(0, ...drawMatches.map((match) => numberWord(match[1] ?? "0")));
  const selected = Math.max(0, ...selectionMatches.map((match) => numberWord(match[1] ?? "0")));
  return { drawn, seen: drawn + selected };
}

function rampSource(card: CardLookup): SourceNote | null {
  if (card.isLand) {
    return null;
  }
  const text = allText(card);
  const typeText = allTypeText(card);
  if (text.includes("treasure token")) {
    return { cardName: card.name, sourceType: "Treasure", timing: "temporary mana", text: card.oracleText };
  }
  if (text.includes("search your library") && text.includes("land") && text.includes("battlefield")) {
    return { cardName: card.name, sourceType: "Land ramp", timing: "extra land source", text: card.oracleText };
  }
  if (text.includes("add one mana") || text.includes("add mana") || text.includes("add {")) {
    const permanent = ["Creature", "Artifact", "Enchantment"].some((kind) => typeText.includes(kind));
    return {
      cardName: card.name,
      sourceType: permanent ? "Mana permanent" : "Mana burst",
      timing: permanent ? "repeatable mana" : "temporary mana",
      text: card.oracleText
    };
  }
  if (text.includes("costs {1} less") || text.includes("costs one less")) {
    return { cardName: card.name, sourceType: "Cost reduction", timing: "virtual mana", text: card.oracleText };
  }
  return null;
}

function landEquivalent(card: CardLookup): SourceNote | null {
  if (card.isLand) {
    return null;
  }
  const landFace = card.faces.find((face) => face.typeLine.includes("Land"));
  if (landFace) {
    return {
      cardName: card.name,
      sourceType: "MDFC land face",
      timing: "uses land drop",
      text: `Can be played as ${landFace.name || "a land face"}.`
    };
  }
  const ramp = rampSource(card);
  if (!ramp) {
    return null;
  }
  if ((ramp.sourceType === "Mana permanent" || ramp.sourceType === "Treasure") && card.manaValue <= 1) {
    return { ...ramp, sourceType: ramp.sourceType === "Treasure" ? "Temporary source" : "Castable mana source" };
  }
  return null;
}

function castabilityEstimate(card: CardLookup, landsInHand: number, effectiveLandsInHand: number) {
  if (card.isLand) {
    return null;
  }
  const mv = Math.max(0, Math.ceil(card.manaValue));
  const estimate = (turn: number) => {
    const sources = Math.max(effectiveLandsInHand, Math.min(turn, landsInHand + turn - 1));
    if (mv <= sources) {
      return 1;
    }
    if (mv === sources + 1) {
      return 0.45;
    }
    return 0;
  };
  return {
    cardName: card.name,
    manaValue: card.manaValue,
    turn1: estimate(1),
    turn2: estimate(2),
    turn3: estimate(3)
  };
}

function textureScore(landsInHand: number, effectiveLandsInHand: number, averageManaValue: number, earlySpellCount: number) {
  const landScore = Math.max(0, 44 - Math.abs(effectiveLandsInHand - 3) * 15);
  const curveScore = Math.max(0, 32 - Math.max(0, averageManaValue - 2.8) * 14);
  const earlyScore = Math.min(24, earlySpellCount * 8);
  const floodPenalty = landsInHand >= 5 ? 10 : 0;
  return Math.max(0, Math.min(100, Math.round(landScore + curveScore + earlyScore - floodPenalty)));
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

function recommendation(score: number, lands: number, landTurn3: number) {
  if (lands === 0 || lands >= 6 || score < 42) {
    return { label: "Mulligan Pressure", tone: "bad" as const };
  }
  if (score >= 72 && (lands >= 3 || landTurn3 >= 0.58)) {
    return { label: "Keep Lean", tone: "good" as const };
  }
  return { label: "Context-Dependent", tone: "neutral" as const };
}

function scoreSeven(cards: string[], cardData: Map<string, CardLookup>) {
  const lands = cards.filter((name) => cardData.get(normalizeName(name))?.isLand).length;
  const nonlands = cards
    .map((name) => cardData.get(normalizeName(name)))
    .filter((card): card is CardLookup => Boolean(card && !card.isLand));
  const avgMv = nonlands.length ? nonlands.reduce((total, card) => total + card.manaValue, 0) / nonlands.length : 0;
  const early = nonlands.filter((card) => card.manaValue <= 2).length;
  return textureScore(lands, lands, avgMv, early);
}

function mulliganSummary(mainCounts: Map<string, number>, cardData: Map<string, CardLookup>, currentScore: number): MulliganSummary | null {
  const deckCards = Array.from(mainCounts.entries()).flatMap(([name, qty]) => Array.from({ length: qty }, () => name));
  if (deckCards.length < 7) {
    return null;
  }
  let seed = 20260717;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const scores: number[] = [];
  for (let sample = 0; sample < 600; sample += 1) {
    const shuffled = [...deckCards];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const seven = shuffled.slice(0, 7);
    const sixScores = seven.map((_card, index) => scoreSeven(seven.filter((__, cardIndex) => cardIndex !== index), cardData));
    scores.push(Math.max(...sixScores));
  }
  scores.sort((a, b) => a - b);
  const average = scores.reduce((total, score) => total + score, 0) / scores.length;
  return {
    average,
    median: scores[Math.floor(scores.length / 2)] ?? 0,
    better: scores.filter((score) => score > currentScore).length / scores.length,
    p25: scores[Math.floor(scores.length * 0.25)] ?? 0,
    p75: scores[Math.floor(scores.length * 0.75)] ?? 0
  };
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

  const landNames = Array.from(mainCounts.keys()).filter((name) => cardData.get(normalizeName(name))?.isLand);
  const landSet = new Set(landNames.map(normalizeName));
  const landEquivalentSources = hand
    .map((name) => cardData.get(normalizeName(name)))
    .filter((card): card is CardLookup => Boolean(card))
    .map(landEquivalent)
    .filter((source): source is SourceNote => Boolean(source));
  const effectiveLandSet = new Set([
    ...Array.from(landSet),
    ...landEquivalentSources.map((source) => normalizeName(source.cardName))
  ]);
  const landsInHand = hand.filter((name) => landSet.has(normalizeName(name))).length;
  const effectiveLandsInHand = hand.filter((name) => effectiveLandSet.has(normalizeName(name))).length;
  const librarySize = Array.from(library.values()).reduce((total, qty) => total + qty, 0);
  const landsRemaining = Array.from(library.entries()).reduce(
    (total, [name, qty]) => total + (landSet.has(normalizeName(name)) ? qty : 0),
    0
  );
  const effectiveLandsRemaining = Array.from(library.entries()).reduce(
    (total, [name, qty]) => total + (effectiveLandSet.has(normalizeName(name)) ? qty : 0),
    0
  );

  const handCards = hand
    .map((name) => cardData.get(normalizeName(name)))
    .filter((card): card is CardLookup => Boolean(card));
  const nonlands = handCards.filter((card) => !card.isLand);
  const averageManaValue = nonlands.length
    ? nonlands.reduce((total, card) => total + card.manaValue, 0) / nonlands.length
    : 0;
  const earlySpellCount = nonlands.filter((card) => card.manaValue <= 2).length;
  const handTextureScore = textureScore(landsInHand, effectiveLandsInHand, averageManaValue, earlySpellCount);
  const castability = nonlands
    .map((card) => castabilityEstimate(card, landsInHand, effectiveLandsInHand))
    .filter((row): row is CastabilityRow => Boolean(row));
  const drawSources = handCards
    .map((card) => ({ card, depth: drawDepth(card) }))
    .filter(({ depth }) => depth.drawn > 0 || depth.seen > 0)
    .map(({ card, depth }) => ({
      cardName: card.name,
      sourceType: depth.drawn > 0 ? `Draw ${depth.drawn}` : "Selection",
      timing: `sees ${depth.seen} card(s)`,
      text: card.oracleText
    }));
  const rampSources = handCards.map(rampSource).filter((source): source is SourceNote => Boolean(source));

  const extraLooksByTurn = (turn: number) =>
    drawSources.reduce((total, source) => {
      const castRow = castability.find((row) => row.cardName === source.cardName);
      const castChance = turn <= 2 ? castRow?.turn1 ?? 0 : turn === 3 ? castRow?.turn2 ?? 0 : castRow?.turn3 ?? 0;
      const seen = Number(source.timing.match(/\d+/)?.[0] ?? 0);
      return total + seen * castChance;
    }, 0);

  const turnProbabilities = Array.from({ length: 7 }, (_, index) => {
    const turn = index + 2;
    const naturalDraws = drawsByTurn(turn, playDraw);
    const extraLooks = extraLooksByTurn(turn);
    const neededForDrop = Math.max(0, turn - landsInHand);
    const neededForEffectiveDrop = Math.max(0, turn - effectiveLandsInHand);
    return {
      turn,
      naturalDraws,
      extraLooks,
      nextLandNatural: probabilityAtLeast(librarySize, landsRemaining, naturalDraws, 1),
      nextLandWithDraw: probabilityWithFractionalLooks(librarySize, landsRemaining, naturalDraws, extraLooks, 1),
      landDropNatural: probabilityAtLeast(librarySize, landsRemaining, naturalDraws, neededForDrop),
      landDropWithDraw: probabilityWithFractionalLooks(librarySize, landsRemaining, naturalDraws, extraLooks, neededForDrop),
      effectiveLandDrop: probabilityAtLeast(librarySize, effectiveLandsRemaining, naturalDraws, neededForEffectiveDrop)
    };
  });

  const curveBuckets = new Map<string, number>();
  for (const [name, qty] of Array.from(mainCounts.entries())) {
    const card = cardData.get(normalizeName(name));
    if (!card || card.isLand) {
      continue;
    }
    const bucket = card.manaValue >= 7 ? "7+" : String(Math.floor(card.manaValue));
    curveBuckets.set(bucket, (curveBuckets.get(bucket) ?? 0) + qty);
  }
  const curve = ["0", "1", "2", "3", "4", "5", "6", "7+"].map((manaValue) => ({
    manaValue,
    spells: curveBuckets.get(manaValue) ?? 0
  }));

  const turn3 = turnProbabilities.find((row) => row.turn === 3)?.landDropWithDraw ?? 0;
  const rec = recommendation(handTextureScore, landsInHand, turn3);
  const mulligan = mulliganSummary(mainCounts, cardData, handTextureScore);
  const tags: AnalyzerResult["tags"] = [
    {
      label: landsInHand >= 2 && landsInHand <= 4 ? "normal land count" : "land count concern",
      tone: landsInHand >= 2 && landsInHand <= 4 ? "good" : "bad"
    },
    {
      label: drawSources.length ? "has card selection" : "no card selection",
      tone: drawSources.length ? "good" : "neutral"
    },
    {
      label: rampSources.length ? "has ramp" : "no ramp",
      tone: rampSources.length ? "good" : "neutral"
    },
    {
      label: castability.some((row) => row.manaValue <= 2 && row.turn2 < 0.55) ? "castability concern" : "early spells castable",
      tone: castability.some((row) => row.manaValue <= 2 && row.turn2 < 0.55) ? "bad" : "good"
    }
  ];
  const watchouts = [
    landsInHand < 2 ? "Low land count: this hand needs help quickly." : "",
    landsInHand > 4 ? "High land count: this hand may flood without card velocity." : "",
    turn3 < 0.55 && landsInHand < 3 ? "Third land by turn 3 is not especially reliable." : "",
    drawSources.length ? `Draw/look spells add about ${extraLooksByTurn(3).toFixed(1)} card(s) of expected depth by turn 3.` : "",
    landEquivalentSources.length ? `Land-equivalent source counted: ${landEquivalentSources.map((source) => source.cardName).join(", ")}.` : "",
    mulligan && mulligan.better >= 0.45 ? `A fresh seven then bottom one scores better about ${Math.round(mulligan.better * 100)}% of the time.` : ""
  ].filter(Boolean);

  if (!landNames.length) {
    notes.push("No lands were identified from card data. Check Scryfall lookup status.");
  }
  if (hand.length !== 7) {
    notes.push("Enter exactly seven cards for opening-hand math.");
  }

  return {
    mainCount: parsed.mainCount,
    librarySize,
    landsInHand,
    effectiveLandsInHand,
    landsRemaining,
    effectiveLandsRemaining,
    averageManaValue,
    handTextureScore,
    handTextureLabel: textureLabel(handTextureScore),
    recommendation: rec.label,
    recommendationTone: rec.tone,
    turnProbabilities,
    castability,
    curve,
    drawSources,
    rampSources,
    landEquivalentSources,
    tags,
    watchouts,
    mulligan,
    landNames,
    missingCards,
    lookupFailures: [],
    notes
  };
}
