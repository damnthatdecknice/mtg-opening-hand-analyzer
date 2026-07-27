import { parseDecklist, type ParsedDeckCard } from "./deckParser";
import type { MetagameDeck } from "./metagame";

export const manaCurveBuckets = ["0", "1", "2", "3", "4", "5", "6", "7+"] as const;
export type ManaCurveBucket = (typeof manaCurveBuckets)[number];

export const cardTypeKeys = [
  "creatures",
  "instants",
  "sorceries",
  "artifacts",
  "enchantments",
  "planeswalkers",
  "battles",
  "lands",
  "other"
] as const;
export type CardTypeKey = (typeof cardTypeKeys)[number];

export type ManaCurveCardData = {
  name: string;
  manaValue: number;
  manaCost?: string;
  typeLine: string;
  colors?: string[];
  faces?: Array<{ name: string; manaCost?: string; manaValue: number; typeLine: string; oracleText?: string }>;
  isLand: boolean;
  legalities?: Record<string, string>;
};

export type ManaCurveRow = {
  manaValue: ManaCurveBucket;
  spells: number;
  types: Record<CardTypeKey, number>;
  cards: Record<CardTypeKey, Array<{ name: string; qty: number }>>;
};

export type ManaCurveObservation = {
  tone: "good" | "neutral" | "bad";
  title: string;
  detail: string;
};

export type ManaCurveSuggestion = {
  cardName: string;
  role: string;
  slot: string;
  reason: string;
  source: "similar-tournament-decks" | "sideboard" | "structural";
};

export type ManaCurveAnalysis = {
  scope: "main" | "main+sideboard" | "sideboard";
  format: string;
  totalCards: number;
  spellCount: number;
  landCount: number;
  averageManaValue: number;
  medianManaValue: number;
  curve: ManaCurveRow[];
  typeBreakdown: Record<CardTypeKey, number>;
  colors: string[];
  oneOfCount: number;
  observations: ManaCurveObservation[];
  suggestions: ManaCurveSuggestion[];
};

type CandidateCard = {
  name: string;
  qty: number;
  source: "similar-tournament-decks" | "sideboard";
  sourceDecks?: number;
};

const formatLegalities: Record<string, string> = {
  standard: "standard",
  pioneer: "pioneer",
  modern: "modern",
  legacy: "legacy",
  vintage: "vintage",
  historic: "historic",
  explorer: "explorer",
  commander: "commander",
  brawl: "brawl",
  "penny dreadful": "penny",
  premodern: "premodern"
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function emptyTypeCounts(): Record<CardTypeKey, number> {
  return {
    creatures: 0,
    instants: 0,
    sorceries: 0,
    artifacts: 0,
    enchantments: 0,
    planeswalkers: 0,
    battles: 0,
    lands: 0,
    other: 0
  };
}

function emptyTypeCards(): Record<CardTypeKey, Array<{ name: string; qty: number }>> {
  return {
    creatures: [],
    instants: [],
    sorceries: [],
    artifacts: [],
    enchantments: [],
    planeswalkers: [],
    battles: [],
    lands: [],
    other: []
  };
}

function addCardToBucket(cards: Array<{ name: string; qty: number }>, name: string, qty: number) {
  const existing = cards.find((card) => normalizeName(card.name) === normalizeName(name));
  if (existing) {
    existing.qty += qty;
    return;
  }
  cards.push({ name, qty });
}

function bucketForManaValue(manaValue: number): ManaCurveBucket {
  if (manaValue >= 7) {
    return "7+";
  }
  const floored = Math.max(0, Math.floor(manaValue));
  return String(Math.min(6, floored)) as ManaCurveBucket;
}

export function primaryCardType(card: Pick<ManaCurveCardData, "typeLine" | "isLand">): CardTypeKey {
  const typeLine = card.typeLine.toLowerCase();
  if (card.isLand || /\bland\b/.test(typeLine)) {
    return "lands";
  }
  if (/\bcreature\b/.test(typeLine)) {
    return "creatures";
  }
  if (/\binstant\b/.test(typeLine)) {
    return "instants";
  }
  if (/\bsorcery\b/.test(typeLine)) {
    return "sorceries";
  }
  if (/\bartifact\b/.test(typeLine)) {
    return "artifacts";
  }
  if (/\benchantment\b/.test(typeLine)) {
    return "enchantments";
  }
  if (/\bplaneswalker\b/.test(typeLine)) {
    return "planeswalkers";
  }
  if (/\bbattle\b/.test(typeLine)) {
    return "battles";
  }
  return "other";
}

function cardColors(card?: ManaCurveCardData) {
  return Array.from(new Set((card?.colors ?? []).map((color) => color.toUpperCase()).filter((color) => "WUBRG".includes(color))));
}

function deckColors(cards: ParsedDeckCard[], cardData: Map<string, ManaCurveCardData>) {
  const colors = new Set<string>();
  for (const entry of cards) {
    const card = cardData.get(normalizeName(entry.name));
    if (!card || card.isLand) {
      continue;
    }
    for (const color of cardColors(card)) {
      colors.add(color);
    }
  }
  return Array.from(colors).sort((a, b) => "WUBRG".indexOf(a) - "WUBRG".indexOf(b));
}

function selectedCards(cards: ParsedDeckCard[], scope: ManaCurveAnalysis["scope"]) {
  return cards.filter((card) => {
    if (scope === "main") {
      return card.section === "main";
    }
    if (scope === "sideboard") {
      return card.section === "sideboard";
    }
    return true;
  });
}

function weightedMedian(values: Array<{ value: number; qty: number }>) {
  const total = values.reduce((sum, row) => sum + row.qty, 0);
  if (!total) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a.value - b.value);
  const firstTarget = (total - 1) / 2;
  const secondTarget = total / 2;
  let seen = 0;
  let first = 0;
  let second = 0;
  for (const row of sorted) {
    const next = seen + row.qty;
    if (seen <= firstTarget && firstTarget < next) {
      first = row.value;
    }
    if (seen <= secondTarget && secondTarget < next) {
      second = row.value;
      break;
    }
    seen = next;
  }
  return total % 2 ? second : (first + second) / 2;
}

function countRows(cards: ParsedDeckCard[]) {
  const counts = new Map<string, { name: string; qty: number }>();
  for (const card of cards) {
    const key = normalizeName(card.name);
    const current = counts.get(key) ?? { name: card.name, qty: 0 };
    counts.set(key, { ...current, qty: current.qty + card.qty });
  }
  return counts;
}

function isLegalInFormat(card: ManaCurveCardData | undefined, format: string) {
  if (!card?.legalities) {
    return true;
  }
  const key = formatLegalities[format.trim().toLowerCase()];
  if (!key) {
    return true;
  }
  const legality = card.legalities[key];
  return !legality || legality === "legal";
}

function maxCopiesForFormat(format: string) {
  return ["commander", "brawl"].includes(format.trim().toLowerCase()) ? 1 : 4;
}

function basicLandName(name: string) {
  return ["plains", "island", "swamp", "mountain", "forest", "wastes"].includes(normalizeName(name));
}

function isColorCompatible(card: ManaCurveCardData | undefined, colors: string[]) {
  const candidateColors = cardColors(card);
  if (!candidateColors.length) {
    return true;
  }
  if (!colors.length) {
    return false;
  }
  return candidateColors.every((color) => colors.includes(color));
}

function cardRole(card: ManaCurveCardData | undefined) {
  if (!card) {
    return "Curve slot";
  }
  const type = primaryCardType(card);
  if (type === "instants" || type === "sorceries") {
    return card.manaValue <= 2 ? "Cheap interaction or velocity" : "Spell slot";
  }
  if (type === "creatures") {
    return card.manaValue <= 2 ? "Early play" : "Threat slot";
  }
  if (type === "planeswalkers") {
    return "Planeswalker slot";
  }
  if (type === "artifacts" || type === "enchantments") {
    return "Engine slot";
  }
  return "Structural slot";
}

function curveEntriesForCard(entry: ParsedDeckCard, card: ManaCurveCardData | undefined) {
  if (!card) {
    return [{ qty: entry.qty, card }];
  }

  const nonlandFaces = (card.faces ?? []).filter((face) => !/\bland\b/i.test(face.typeLine));
  const shouldSplitFaces = nonlandFaces.length >= 2 && !card.isLand;
  if (!shouldSplitFaces) {
    return [{ qty: entry.qty, card }];
  }

  return nonlandFaces.map((face) => ({
    qty: entry.qty,
    card: {
      ...card,
      name: face.name || card.name,
      manaCost: face.manaCost ?? "",
      manaValue: Math.max(0, face.manaValue ?? 0),
      typeLine: face.typeLine || card.typeLine,
      oracleText: face.oracleText ?? ""
    }
  }));
}

function buildObservations(
  mainCards: ParsedDeckCard[],
  analysisCards: ParsedDeckCard[],
  cardData: Map<string, ManaCurveCardData>,
  facts: {
    landCount: number;
    spellCount: number;
    averageManaValue: number;
    oneOfCount: number;
    curve: ManaCurveRow[];
    colors: string[];
  }
) {
  const observations: ManaCurveObservation[] = [];
  const cheapSpells = facts.curve.find((row) => row.manaValue === "1")!.spells + facts.curve.find((row) => row.manaValue === "2")!.spells;
  const expensiveSpells = ["5", "6", "7+"].reduce((sum, bucket) => sum + facts.curve.find((row) => row.manaValue === bucket)!.spells, 0);
  const cheapInteraction = analysisCards.reduce((sum, entry) => {
    const card = cardData.get(normalizeName(entry.name));
    const type = card ? primaryCardType(card) : "other";
    return sum + (card && card.manaValue <= 2 && (type === "instants" || type === "sorceries") ? entry.qty : 0);
  }, 0);
  const coloredPips = mainCards.reduce((sum, entry) => {
    const card = cardData.get(normalizeName(entry.name));
    return sum + (cardColors(card).length >= 2 ? entry.qty : 0);
  }, 0);

  if (cheapSpells < 10) {
    observations.push({
      tone: "bad",
      title: "Too few early plays",
      detail: `Only ${cheapSpells} one- and two-mana spells are in the selected pool, so opening hands may pass early turns too often.`
    });
  }

  if (expensiveSpells > Math.max(7, facts.spellCount * 0.22)) {
    observations.push({
      tone: "bad",
      title: "Too many expensive spells",
      detail: `${expensiveSpells} spells cost five or more, which can make otherwise functional openers clunky.`
    });
  }

  if (facts.landCount < 22 && facts.averageManaValue >= 2.7) {
    observations.push({
      tone: "bad",
      title: "Land count may not fit the curve",
      detail: `${facts.landCount} lands is light for an average spell mana value of ${facts.averageManaValue.toFixed(2)}.`
    });
  } else if (facts.landCount >= 27 && facts.averageManaValue <= 2.3) {
    observations.push({
      tone: "neutral",
      title: "Land count may be high for the curve",
      detail: `${facts.landCount} lands may flood a low-curve deck unless the list has mana sinks, channel lands, or heavy card draw.`
    });
  }

  if (cheapInteraction < 6) {
    observations.push({
      tone: "neutral",
      title: "Limited cheap interaction",
      detail: `Only ${cheapInteraction} cheap instant/sorcery interaction or velocity slots were detected.`
    });
  }

  if (facts.oneOfCount >= 8) {
    observations.push({
      tone: "neutral",
      title: "Many isolated one-of cards",
      detail: `${facts.oneOfCount} main-deck one-ofs can reduce opener consistency unless they are tutors, modal cards, or silver bullets.`
    });
  }

  if (facts.colors.length >= 3 && coloredPips >= 14) {
    observations.push({
      tone: "neutral",
      title: "Colored mana requirements may strain the mana base",
      detail: `${coloredPips} nonland cards have multicolor requirements across ${facts.colors.join("")}, so source quality matters.`
    });
  }

  if (!observations.length) {
    observations.push({
      tone: "good",
      title: "Curve structure looks coherent",
      detail: "No major mana-curve warnings were detected from the current card data."
    });
  }

  return observations;
}

function findSimilarTournamentDecks(mainCards: ParsedDeckCard[], metagameDecks: MetagameDeck[] = []) {
  const savedCards = new Set(mainCards.map((card) => normalizeName(card.name)));
  const savedFaceNames = new Set(
    mainCards
      .flatMap((card) => card.name.split("//").map((name) => normalizeName(name)))
      .filter(Boolean)
  );
  return metagameDecks
    .map((deck) => ({
      deck,
      shared: deck.main.filter((card) => {
        const normalized = normalizeName(card.name);
        if (savedCards.has(normalized)) {
          return true;
        }
        return card.name.split("//").some((face) => savedFaceNames.has(normalizeName(face)));
      }).length
    }))
    .filter((match) => match.shared >= 2)
    .sort((a, b) => {
      const rankA = a.deck.rank ?? 999;
      const rankB = b.deck.rank ?? 999;
      return b.shared - a.shared || rankA - rankB || a.deck.archetype.localeCompare(b.deck.archetype);
    })
    .slice(0, 12);
}

export function extractTournamentCurveCandidateNames(decklist: string, metagameDecks: MetagameDeck[] = []) {
  const parsed = parseDecklist(decklist);
  const mainCards = selectedCards(parsed.cards, "main");
  const savedCounts = countRows(mainCards);
  const similar = findSimilarTournamentDecks(mainCards, metagameDecks);
  const names = new Set<string>();

  for (const match of similar.slice(0, 8)) {
    for (const card of match.deck.main) {
      const current = savedCounts.get(normalizeName(card.name))?.qty ?? 0;
      if (card.qty > current) {
        names.add(card.name);
      }
    }
  }

  return Array.from(names).slice(0, 30);
}

function tournamentCandidates(mainCards: ParsedDeckCard[], metagameDecks: MetagameDeck[] = []) {
  const savedCounts = countRows(mainCards);
  const similar = findSimilarTournamentDecks(mainCards, metagameDecks);
  const sourceDecks = similar.filter((match) => (match.deck.rank ?? 999) <= 16).length >= 2
    ? similar.filter((match) => (match.deck.rank ?? 999) <= 16)
    : similar.slice(0, 6);
  const candidates = new Map<string, CandidateCard>();

  for (const match of sourceDecks) {
    for (const card of match.deck.main) {
      const key = normalizeName(card.name);
      const current = savedCounts.get(key)?.qty ?? 0;
      if (card.qty <= current) {
        continue;
      }
      const row = candidates.get(key) ?? { name: card.name, qty: 0, source: "similar-tournament-decks" as const, sourceDecks: 0 };
      candidates.set(key, {
        ...row,
        qty: Math.max(row.qty, card.qty - current),
        sourceDecks: (row.sourceDecks ?? 0) + 1
      });
    }
  }

  return Array.from(candidates.values()).sort((a, b) => (b.sourceDecks ?? 0) - (a.sourceDecks ?? 0) || a.name.localeCompare(b.name));
}

function sideboardCandidates(sideboardCards: ParsedDeckCard[], mainCards: ParsedDeckCard[]) {
  const mainCounts = countRows(mainCards);
  return sideboardCards
    .filter((card) => !mainCounts.has(normalizeName(card.name)))
    .map((card) => ({ name: card.name, qty: card.qty, source: "sideboard" as const }));
}

function buildSuggestions(
  mainCards: ParsedDeckCard[],
  sideboardCards: ParsedDeckCard[],
  cardData: Map<string, ManaCurveCardData>,
  format: string,
  colors: string[],
  observations: ManaCurveObservation[],
  metagameDecks: MetagameDeck[]
) {
  const mainCounts = countRows(mainCards);
  const maxCopies = maxCopiesForFormat(format);
  const weaknessText = observations.map((observation) => observation.title.toLowerCase()).join(" ");
  const candidatePool = [...tournamentCandidates(mainCards, metagameDecks), ...sideboardCandidates(sideboardCards, mainCards)];
  const suggestions: ManaCurveSuggestion[] = [];

  for (const candidate of candidatePool) {
    const card = cardData.get(normalizeName(candidate.name));
    if (!card || card.isLand || basicLandName(candidate.name)) {
      continue;
    }
    const currentCopies = mainCounts.get(normalizeName(candidate.name))?.qty ?? 0;
    if (currentCopies >= maxCopies || !isLegalInFormat(card, format) || !isColorCompatible(card, colors)) {
      continue;
    }
    const bucket = bucketForManaValue(card.manaValue);
    const role = cardRole(card);
    const reason =
      candidate.source === "similar-tournament-decks"
        ? `Similar recent Challenge shells are using this as a ${role.toLowerCase()}, and it fits your ${colors.join("") || "colorless"} color lens.`
        : `Already in your sideboard, legal for this format, and can be tested as a ${role.toLowerCase()} without changing colors.`;

    suggestions.push({
      cardName: candidate.name,
      role,
      slot: `${bucket}-mana ${primaryCardType(card).replace(/s$/, "")}`,
      reason,
      source: candidate.source
    });
  }

  if (!suggestions.length) {
    if (weaknessText.includes("early plays")) {
      suggestions.push({
        cardName: "Add a one- or two-mana spell in your colors",
        role: "Early play",
        slot: "1-2 mana",
        reason: "The deck needs more early actions; choose a format-legal threat, cantrip, or interactive spell that matches your plan.",
        source: "structural"
      });
    } else if (weaknessText.includes("expensive")) {
      suggestions.push({
        cardName: "Replace a top-end spell with a cheaper role player",
        role: "Curve compression",
        slot: "2-3 mana",
        reason: "The curve is heavy at five-plus mana; a cheaper card in the same role will make more opening hands function.",
        source: "structural"
      });
    } else if (weaknessText.includes("interaction")) {
      suggestions.push({
        cardName: "Add cheap interaction or velocity",
        role: "Cheap interaction",
        slot: "1-2 mana",
        reason: "The list has limited cheap instant/sorcery interaction; pick a legal card in your colors that advances the deck's primary plan.",
        source: "structural"
      });
    }
  }

  return suggestions.slice(0, 6);
}

export function buildManaCurveAnalysis(
  decklist: string,
  cardData: Map<string, ManaCurveCardData>,
  options: {
    format?: string;
    scope?: ManaCurveAnalysis["scope"];
    metagameDecks?: MetagameDeck[];
  } = {}
): ManaCurveAnalysis {
  const format = options.format ?? "Standard";
  const scope = options.scope ?? "main";
  const parsed = parseDecklist(decklist);
  const mainCards = selectedCards(parsed.cards, "main");
  const sideboardCards = selectedCards(parsed.cards, "sideboard");
  const analysisCards = selectedCards(parsed.cards, scope);
  const curveMap = new Map<ManaCurveBucket, ManaCurveRow>(
    manaCurveBuckets.map((manaValue) => [
      manaValue,
      { manaValue, spells: 0, types: emptyTypeCounts(), cards: emptyTypeCards() }
    ])
  );
  const typeBreakdown = emptyTypeCounts();
  const spellValues: Array<{ value: number; qty: number }> = [];
  let totalManaValue = 0;
  let spellCount = 0;
  let landCount = 0;

  for (const entry of analysisCards) {
    const card = cardData.get(normalizeName(entry.name));
    for (const curveEntry of curveEntriesForCard(entry, card)) {
      const curveCard = curveEntry.card;
      const type = curveCard ? primaryCardType(curveCard) : "other";
      typeBreakdown[type] += curveEntry.qty;
      if (type === "lands") {
        landCount += curveEntry.qty;
        continue;
      }

      const manaValue = Math.max(0, curveCard?.manaValue ?? 0);
      const bucket = bucketForManaValue(manaValue);
      const row = curveMap.get(bucket)!;
      row.spells += curveEntry.qty;
      row.types[type] += curveEntry.qty;
      addCardToBucket(row.cards[type], curveCard?.name ?? entry.name, curveEntry.qty);
      spellCount += curveEntry.qty;
      totalManaValue += manaValue * curveEntry.qty;
      spellValues.push({ value: manaValue, qty: curveEntry.qty });
    }
  }

  const colors = deckColors(mainCards, cardData);
  const mainCounts = countRows(mainCards);
  const oneOfCount = Array.from(mainCounts.values()).filter((card) => card.qty === 1).length;
  const curve = manaCurveBuckets.map((bucket) => curveMap.get(bucket)!);
  const facts = {
    landCount,
    spellCount,
    averageManaValue: spellCount ? totalManaValue / spellCount : 0,
    oneOfCount,
    curve,
    colors
  };
  const observations = buildObservations(mainCards, analysisCards, cardData, facts);

  return {
    scope,
    format,
    totalCards: analysisCards.reduce((total, card) => total + card.qty, 0),
    spellCount,
    landCount,
    averageManaValue: facts.averageManaValue,
    medianManaValue: weightedMedian(spellValues),
    curve,
    typeBreakdown,
    colors,
    oneOfCount,
    observations,
    suggestions: buildSuggestions(
      mainCards,
      sideboardCards,
      cardData,
      format,
      colors,
      observations,
      options.metagameDecks ?? []
    )
  };
}
