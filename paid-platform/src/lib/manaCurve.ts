import { parseDecklist, type ParsedDeckCard } from "./deckParser";
import { validateDeckForManaCurve, type DeckValidationResult } from "./deckValidation";
import { formatLegalities } from "./formats";
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
  oracleText?: string;
  colors?: string[];
  producedMana?: string[];
  layout?: string;
  faces?: Array<{ name: string; manaCost?: string; manaValue: number; typeLine: string; oracleText?: string; colors?: string[] }>;
  isLand: boolean;
  legalities?: Record<string, string>;
};

export type ManaCurveRow = {
  manaValue: ManaCurveBucket;
  spells: number;
  types: Record<CardTypeKey, number>;
  cards: Record<CardTypeKey, Array<{ name: string; qty: number }>>;
};

export type ManaCurveObservationCode =
  | "LOW_ONE_MANA_PLAYS"
  | "LOW_EARLY_ACTION"
  | "LOW_EARLY_THREATS"
  | "LOW_CHEAP_INTERACTION"
  | "LOW_CARD_FLOW"
  | "LOW_RAMP"
  | "LOW_RAMP_PAYOFFS"
  | "HEAVY_TOP_END"
  | "LOW_FINISHERS"
  | "LOW_SWEEPERS"
  | "LOW_COMBO_PIECES"
  | "LAND_COUNT_LOW"
  | "LAND_COUNT_HIGH"
  | "HIGH_COLOR_STRAIN"
  | "MANY_ONE_OFS"
  | "INCOMPLETE_DECK"
  | "NO_MAJOR_WARNING";

export type ManaCurveObservation = {
  code: ManaCurveObservationCode;
  tone: "good" | "neutral" | "bad";
  title: string;
  detail: string;
  measuredValue?: number;
  expectedRange?: {
    min?: number;
    max?: number;
  };
  confidence: "low" | "medium" | "high";
  evidence: string[];
};

export type DeckPosture = "aggro" | "tempo" | "midrange" | "control" | "ramp" | "combo" | "unknown";

export type DeckPostureResult = {
  posture: DeckPosture;
  confidence: "low" | "medium" | "high";
  evidence: string[];
};

export type FunctionalCardRole =
  | "threat"
  | "removal"
  | "countermagic"
  | "discard"
  | "burn_reach"
  | "card_draw"
  | "card_selection"
  | "pump"
  | "protection"
  | "ramp"
  | "tutor"
  | "board_wipe"
  | "graveyard_interaction"
  | "artifact_enchantment_interaction"
  | "combo_enabler"
  | "combo_payoff"
  | "finisher"
  | "utility"
  | "unknown";

export type ManaCurveSuggestion = {
  cardName: string;
  suggestedQuantity: number;
  role: string;
  slot: string;
  problemAddressed: string;
  reason: string;
  supportingDeckCount: number;
  similarityConfidence: DeckSimilarity["confidence"];
  formatLegality: "legal" | "unknown";
  colorCompatibility: "fits" | "off-color" | "colorless";
  possibleCuts: CutCandidate[];
  source: "similar-tournament-decks" | "sideboard" | "structural";
};

export type CutCandidate = {
  cardName: string;
  reason: string;
  confidence: "low" | "medium" | "high";
};

export type DeckSimilarity = {
  score: number;
  sharedWeightedCopies: number;
  sharedDistinctCards: number;
  supportingDeckCount: number;
  confidence: "low" | "medium" | "high";
  colorSimilarity: number;
  curveSimilarity: number;
  archetypeAgreement: boolean;
};

export type ManaColor = "W" | "U" | "B" | "R" | "G";
export type ManaSourceConfidence = "low" | "medium" | "high";
export type LandAvailability = "untapped" | "tapped" | "conditional" | "unknown";

export type ManaDemandRequirement =
  | {
      kind: "fixed";
      colors: ManaColor[];
      count: number;
    }
  | {
      kind: "hybrid";
      colors: ManaColor[];
      count: number;
    }
  | {
      kind: "numeric_hybrid";
      color: ManaColor;
      genericAlternative: number;
      count: number;
    }
  | {
      kind: "phyrexian";
      colors: ManaColor[];
      count: number;
    };

export type ManaDemandSummary = {
  pips: Record<ManaColor, number>;
  flexiblePips: Record<ManaColor, number>;
  numericHybrid: Record<ManaColor, number>;
  phyrexian: Record<ManaColor, number>;
  requirements: ManaDemandRequirement[];
  cards: Record<ManaColor, Array<{ name: string; qty: number; pips: number }>>;
  totalColoredPips: number;
};

export type ManaSourceSummary = {
  sources: Record<ManaColor, number>;
  confidence: ManaSourceConfidence;
  unknownSourceCount: number;
  approximateSourceCount: number;
  availability: Record<LandAvailability, number>;
  untappedByTurn: Array<{ turn: number; sources: Record<ManaColor, number>; confidence: ManaSourceConfidence; note: string }>;
};

export type CurveComparisonRange = {
  bucket: ManaCurveBucket;
  count: number;
  share: number;
  typicalLow: number;
  typicalHigh: number;
  label: string;
};

export type ManaCurveAnalysis = {
  scope: "main" | "main+sideboard" | "sideboard";
  format: string;
  totalCards: number;
  physicalSpellCount: number;
  spellCount: number;
  landCount: number;
  castModeCount: number;
  averageManaValue: number;
  medianManaValue: number;
  averageManaValueBasis: "physical-lowest-castable-mode";
  medianManaValueBasis: "physical-lowest-castable-mode";
  castModeAverageManaValue: number;
  castModeMedianManaValue: number;
  curve: ManaCurveRow[];
  castModeCurve: ManaCurveRow[];
  physicalCurve: ManaCurveRow[];
  physicalTypeBreakdown: Record<CardTypeKey, number>;
  typeBreakdown: Record<CardTypeKey, number>;
  manaDemand: ManaDemandSummary;
  manaSources: ManaSourceSummary;
  contextualRanges: CurveComparisonRange[];
  modalSourceCount: number;
  colors: string[];
  oneOfCount: number;
  posture: DeckPostureResult;
  observations: ManaCurveObservation[];
  suggestions: ManaCurveSuggestion[];
  validation: DeckValidationResult;
};

type CandidateCard = {
  name: string;
  qty: number;
  source: "similar-tournament-decks" | "sideboard";
  sourceDecks?: number;
  similarity?: DeckSimilarity;
  evidenceDecks?: MetagameDeck[];
};

type StructureMetricKey =
  | "oneManaPlays"
  | "earlyPlays"
  | "earlyThreats"
  | "cheapInteraction"
  | "drawSelection"
  | "landCount"
  | "rampCount"
  | "rampPayoffs"
  | "expensiveSpells"
  | "finishers"
  | "oneOfCards"
  | "comboPieces"
  | "boardWipes";

type StructureMetricRange = {
  min?: number;
  max?: number;
  label: string;
};

type StructuralMetrics = Record<StructureMetricKey, number> & {
  spellCount: number;
  averageManaValue: number;
  colors: string[];
};

const constructedRanges: Record<DeckPosture, Partial<Record<StructureMetricKey, StructureMetricRange>>> = {
  aggro: {
    oneManaPlays: { min: 8, label: "one-mana plays" },
    earlyPlays: { min: 20, label: "one- and two-mana plays" },
    earlyThreats: { min: 10, label: "cheap threats" },
    cheapInteraction: { min: 6, label: "cheap interaction or reach" },
    landCount: { min: 18, max: 24, label: "lands" },
    expensiveSpells: { max: 5, label: "five-plus mana spells" },
    oneOfCards: { max: 7, label: "isolated one-ofs" }
  },
  tempo: {
    oneManaPlays: { min: 6, label: "one-mana plays" },
    earlyPlays: { min: 18, label: "one- and two-mana plays" },
    earlyThreats: { min: 5, label: "cheap threats" },
    cheapInteraction: { min: 8, label: "cheap interaction" },
    drawSelection: { min: 4, label: "draw or selection" },
    landCount: { min: 18, max: 24, label: "lands" },
    expensiveSpells: { max: 6, label: "five-plus mana spells" },
    oneOfCards: { max: 8, label: "isolated one-ofs" }
  },
  midrange: {
    earlyPlays: { min: 12, label: "one- and two-mana plays" },
    cheapInteraction: { min: 6, label: "cheap interaction" },
    landCount: { min: 23, max: 27, label: "lands" },
    expensiveSpells: { max: 8, label: "five-plus mana spells" },
    finishers: { max: 7, label: "finishers" },
    oneOfCards: { max: 9, label: "isolated one-ofs" }
  },
  control: {
    earlyPlays: { min: 10, label: "early interaction and setup" },
    cheapInteraction: { min: 8, label: "cheap interaction" },
    drawSelection: { min: 6, label: "draw or selection" },
    landCount: { min: 25, max: 29, label: "lands" },
    boardWipes: { min: 2, label: "sweepers" },
    finishers: { min: 2, max: 8, label: "finishers" },
    oneOfCards: { max: 11, label: "isolated one-ofs" }
  },
  ramp: {
    rampCount: { min: 6, label: "ramp pieces" },
    landCount: { min: 24, max: 30, label: "lands" },
    expensiveSpells: { min: 5, max: 14, label: "payoffs and top-end spells" },
    rampPayoffs: { min: 4, max: 12, label: "ramp payoffs" },
    finishers: { min: 3, label: "finishers" },
    earlyPlays: { min: 8, label: "early setup" },
    oneOfCards: { max: 10, label: "isolated one-ofs" }
  },
  combo: {
    comboPieces: { min: 6, label: "combo pieces" },
    drawSelection: { min: 6, label: "draw, selection, or tutors" },
    earlyPlays: { min: 12, label: "early setup" },
    landCount: { min: 18, max: 25, label: "lands" },
    oneOfCards: { max: 12, label: "isolated one-ofs" }
  },
  unknown: {
    landCount: { min: 20, max: 28, label: "lands" },
    earlyPlays: { min: 10, label: "one- and two-mana plays" },
    expensiveSpells: { max: 12, label: "five-plus mana spells" }
  }
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

function manaValueFromCost(cost = "") {
  const symbols = Array.from(cost.matchAll(/\{([^}]+)\}/g)).map((match) => match[1] ?? "");
  return symbols.reduce((total, symbol) => {
    if (/^\d+$/.test(symbol)) {
      return total + Number(symbol);
    }
    if (symbol.toUpperCase() === "X") {
      return total;
    }
    return total + 1;
  }, 0);
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

function emptyManaColors(): Record<ManaColor, number> {
  return { W: 0, U: 0, B: 0, R: 0, G: 0 };
}

function parseColoredPips(cost = "") {
  const pips = emptyManaColors();
  for (const match of Array.from(cost.matchAll(/\{([^}]+)\}/g))) {
    const symbol = (match[1] ?? "").toUpperCase();
    for (const color of ["W", "U", "B", "R", "G"] as ManaColor[]) {
      if (symbol.split("/").includes(color)) {
        pips[color] += 1;
        break;
      }
    }
  }
  return pips;
}

function parseManaDemandRequirements(cost = ""): ManaDemandRequirement[] {
  const merged = new Map<string, ManaDemandRequirement>();
  const add = (requirement: ManaDemandRequirement) => {
    const key =
      requirement.kind === "numeric_hybrid"
        ? `${requirement.kind}:${requirement.color}:${requirement.genericAlternative}`
        : `${requirement.kind}:${[...requirement.colors].sort().join("")}`;
    const current = merged.get(key);
    if (current) {
      current.count += requirement.count;
    } else {
      merged.set(key, { ...requirement });
    }
  };

  for (const match of Array.from(cost.matchAll(/\{([^}]+)\}/g))) {
    const symbol = (match[1] ?? "").toUpperCase();
    const parts = symbol.split("/");
    const colors = parts.filter((part): part is ManaColor => (["W", "U", "B", "R", "G"] as string[]).includes(part));
    if (parts.includes("P") && colors.length) {
      add({ kind: "phyrexian", colors: Array.from(new Set(colors)), count: 1 });
    } else if (colors.length > 1) {
      add({ kind: "hybrid", colors: Array.from(new Set(colors)), count: 1 });
    } else if (colors.length === 1 && parts.some((part) => /^\d+$/.test(part))) {
      add({ kind: "numeric_hybrid", color: colors[0], genericAlternative: Number(parts.find((part) => /^\d+$/.test(part)) ?? 2), count: 1 });
    } else if (colors.length === 1) {
      add({ kind: "fixed", colors, count: 1 });
    }
  }

  return Array.from(merged.values());
}

function mergePips(target: Record<ManaColor, number>, source: Record<ManaColor, number>, qty: number) {
  for (const color of ["W", "U", "B", "R", "G"] as ManaColor[]) {
    target[color] += source[color] * qty;
  }
}

function buildManaDemand(cards: ParsedDeckCard[], cardData: Map<string, ManaCurveCardData>): ManaDemandSummary {
  const pips = emptyManaColors();
  const flexiblePips = emptyManaColors();
  const numericHybrid = emptyManaColors();
  const phyrexian = emptyManaColors();
  const requirements: ManaDemandRequirement[] = [];
  const cardRows: ManaDemandSummary["cards"] = { W: [], U: [], B: [], R: [], G: [] };

  for (const entry of cards) {
    const card = cardData.get(normalizeName(entry.name));
    if (!card || card.isLand) {
      continue;
    }
    const entries = castModeEntriesForCard(entry, card);
    for (const curveEntry of entries) {
      const curveCard = curveEntry.card;
      const costRequirements = parseManaDemandRequirements(curveCard?.manaCost);
      const costPips = emptyManaColors();
      for (const requirement of costRequirements) {
        requirements.push({ ...requirement, count: requirement.count * curveEntry.qty });
        if (requirement.kind === "fixed") {
          for (const color of requirement.colors) {
            costPips[color] += requirement.count;
          }
        } else if (requirement.kind === "hybrid") {
          for (const color of requirement.colors) {
            flexiblePips[color] += requirement.count * curveEntry.qty;
          }
        } else if (requirement.kind === "numeric_hybrid") {
          numericHybrid[requirement.color] += requirement.count * curveEntry.qty;
        } else if (requirement.kind === "phyrexian") {
          for (const color of requirement.colors) {
            phyrexian[color] += requirement.count * curveEntry.qty;
          }
        }
      }
      if (!costRequirements.length && !Object.values(costPips).some(Boolean)) {
        for (const color of cardColors(curveCard).filter((color): color is ManaColor => (["W", "U", "B", "R", "G"] as string[]).includes(color))) {
          costPips[color as ManaColor] += 1;
        }
      }
      mergePips(pips, costPips, curveEntry.qty);
      for (const color of ["W", "U", "B", "R", "G"] as ManaColor[]) {
        if (costPips[color]) {
          cardRows[color].push({ name: curveCard?.name ?? entry.name, qty: curveEntry.qty, pips: costPips[color] });
        }
      }
    }
  }

  return {
    pips,
    flexiblePips,
    numericHybrid,
    phyrexian,
    requirements,
    cards: cardRows,
    totalColoredPips: Object.values(pips).reduce((sum, count) => sum + count, 0)
  };
}

const landTypeColors: Record<string, ManaColor> = {
  plains: "W",
  island: "U",
  swamp: "B",
  mountain: "R",
  forest: "G"
};

function landText(card: ManaCurveCardData | undefined) {
  if (!card) {
    return "";
  }
  return [
    card.oracleText ?? "",
    ...(card.faces ?? []).filter((face) => /\bland\b/i.test(face.typeLine)).map((face) => face.oracleText ?? "")
  ].join(" ");
}

function colorsFromProducedMana(card: ManaCurveCardData | undefined) {
  return Array.from(
    new Set(
      (card?.producedMana ?? [])
        .map((color) => color.toUpperCase())
        .filter((color): color is ManaColor => (["W", "U", "B", "R", "G"] as string[]).includes(color))
    )
  );
}

function colorsFromLandTypes(card: ManaCurveCardData | undefined) {
  const colors = new Set<ManaColor>();
  const typeText = `${card?.typeLine ?? ""} ${(card?.faces ?? []).filter((face) => /\bland\b/i.test(face.typeLine)).map((face) => face.typeLine).join(" ")}`.toLowerCase();
  for (const [landType, color] of Object.entries(landTypeColors)) {
    if (new RegExp(`\\b${landType}\\b`, "i").test(typeText)) {
      colors.add(color);
    }
  }
  return Array.from(colors);
}

function colorsFromAddOracleText(text: string) {
  const colors = new Set<ManaColor>();
  const lower = text.toLowerCase();
  if (/\badd (?:one mana of )?any color\b|\badd (?:one mana of )?any one color\b/i.test(lower)) {
    for (const color of ["W", "U", "B", "R", "G"] as ManaColor[]) {
      colors.add(color);
    }
  }
  for (const match of Array.from(text.matchAll(/\badd\b[^.]*?(\{[^}]+\}|white|blue|black|red|green)/gi))) {
    const fragment = match[0] ?? "";
    for (const symbol of Array.from(fragment.matchAll(/\{([WUBRG])\}/gi))) {
      colors.add((symbol[1] ?? "").toUpperCase() as ManaColor);
    }
    for (const [word, color] of Object.entries({ white: "W", blue: "U", black: "B", red: "R", green: "G" } as Record<string, ManaColor>)) {
      if (new RegExp(`\\b${word}\\b`, "i").test(fragment)) {
        colors.add(color);
      }
    }
  }
  return Array.from(colors);
}

function landProduces(card: ManaCurveCardData | undefined): { colors: Set<ManaColor>; confidence: ManaSourceConfidence; reason: string } {
  const colors = new Set<ManaColor>();
  if (!card) {
    return { colors, confidence: "low", reason: "Missing card data" };
  }
  const producedMana = colorsFromProducedMana(card);
  if (producedMana.length) {
    producedMana.forEach((color) => colors.add(color));
    return { colors, confidence: "high", reason: "Scryfall produced_mana" };
  }
  const typeColors = colorsFromLandTypes(card);
  if (typeColors.length) {
    typeColors.forEach((color) => colors.add(color));
    return { colors, confidence: "high", reason: "Basic land subtype" };
  }
  const oracleColors = colorsFromAddOracleText(landText(card));
  if (oracleColors.length) {
    oracleColors.forEach((color) => colors.add(color));
    return { colors, confidence: "medium", reason: "Oracle Add-mana text" };
  }
  return { colors, confidence: "low", reason: "Unknown mana production" };
}

function likelyEntersTapped(card: ManaCurveCardData | undefined): LandAvailability {
  if (!card) {
    return "unknown";
  }
  const text = landText(card);
  if (/enters (?:the battlefield )?tapped unless|enters (?:the battlefield )?tapped if|if you control|unless you control|two or more other lands|three or more other lands|you may pay|as long as|enters (?:the battlefield )?untapped/i.test(text)) {
    return "conditional";
  }
  if (/enters (?:the battlefield )?tapped/i.test(text)) {
    return "tapped";
  }
  return "untapped";
}

function buildManaSources(cards: ParsedDeckCard[], cardData: Map<string, ManaCurveCardData>): ManaSourceSummary {
  const sources = emptyManaColors();
  const untapped = emptyManaColors();
  const conditional = emptyManaColors();
  const availability: Record<LandAvailability, number> = { untapped: 0, tapped: 0, conditional: 0, unknown: 0 };
  let unknownSourceCount = 0;
  let approximateSourceCount = 0;
  let lowConfidenceSeen = false;

  for (const entry of cards) {
    const card = cardData.get(normalizeName(entry.name));
    const type = card ? primaryCardType(card) : "other";
    if (type !== "lands" && !hasLandSpellModalFaces(card)) {
      continue;
    }
    const produced = landProduces(card);
    const tappedState = likelyEntersTapped(card);
    availability[tappedState] += entry.qty;
    if (produced.confidence === "low") {
      lowConfidenceSeen = true;
      unknownSourceCount += entry.qty;
    } else if (produced.confidence === "medium" || tappedState === "conditional" || tappedState === "unknown") {
      approximateSourceCount += entry.qty;
    }
    for (const color of Array.from(produced.colors)) {
      sources[color] += entry.qty;
      if (tappedState === "untapped") {
        untapped[color] += entry.qty;
      } else if (tappedState === "conditional") {
        conditional[color] += entry.qty;
      }
    }
  }

  return {
    sources,
    confidence: lowConfidenceSeen ? "low" : approximateSourceCount ? "medium" : "high",
    unknownSourceCount,
    approximateSourceCount,
    availability,
    untappedByTurn: [1, 2, 3].map((turn) => ({
      turn,
      sources: Object.fromEntries(
        (["W", "U", "B", "R", "G"] as ManaColor[]).map((color) => [
          color,
          Math.min(sources[color], untapped[color] + (turn > 1 ? conditional[color] : Math.floor(conditional[color] * 0.45)))
        ])
      ) as Record<ManaColor, number>,
      confidence: lowConfidenceSeen ? "low" : approximateSourceCount ? "medium" : "high",
      note: lowConfidenceSeen
        ? "Some lands have unknown production; source totals may be incomplete."
        : approximateSourceCount
          ? "Conditional lands are estimated conservatively and not fully sequenced."
          : "Scryfall produced_mana or land subtypes supplied source colors."
    }))
  };
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

function cardText(card: ManaCurveCardData | undefined) {
  if (!card) {
    return "";
  }
  return `${card.typeLine} ${card.oracleText ?? ""} ${(card.faces ?? []).map((face) => `${face.typeLine} ${face.oracleText ?? ""}`).join(" ")}`.toLowerCase();
}

export function detectFunctionalRoles(card: ManaCurveCardData | undefined): FunctionalCardRole[] {
  if (!card) {
    return ["unknown"];
  }
  const roles = new Set<FunctionalCardRole>();
  const text = cardText(card);
  const type = primaryCardType(card);
  const mv = physicalManaValueForCard(card);

  if (type === "creatures" || type === "planeswalkers") {
    roles.add(mv >= 5 ? "finisher" : "threat");
  }
  if (/\bdeals? \d+ damage\b|\bdeals? x damage\b|damage to any target|damage to target player|damage to each opponent/i.test(text)) {
    roles.add("burn_reach");
  }
  if (/\bdestroy target\b|\bexile target\b|\breturn target (creature|permanent)\b|\btarget creature gets -\d|fight target|deals? \d+ damage to target creature/i.test(text)) {
    roles.add("removal");
  }
  if (/\bcounter target\b|\bcounter up to one target\b|\bunless its controller pays\b/i.test(text)) {
    roles.add("countermagic");
  }
  if (/\btarget player discards\b|\beach opponent discards\b|\bopponent reveals their hand\b/i.test(text)) {
    roles.add("discard");
  }
  if (/\bdraw (a|one|\d+|x|two|three) cards?\b|\bdraw cards equal\b/i.test(text)) {
    roles.add("card_draw");
  }
  if (/\bscry\b|\bsurveil\b|\blook at the top\b|\bimpulse\b|\bchoose one of them\b|\bput .* into your hand\b/i.test(text)) {
    roles.add("card_selection");
  }
  if (/\bgets \+\d+\/\+\d+|\bput (a|\d+) \+1\/\+1 counter|double target creature/i.test(text)) {
    roles.add("pump");
  }
  if (/\bhexproof\b|\bindestructible\b|\bprotection from\b|\bphase out\b|\bcan't be countered\b|\bprevent all damage\b/i.test(text)) {
    roles.add("protection");
  }
  if (
    /\badd \{?[wubrgc]\}?|\badd one mana|\badd two mana|\badd \d+ mana|\btreasure token|\bsearch your library for .*basic land|\bsearch your library for .*land card|\bput .* land .* battlefield|\byou may play an additional land/i.test(text)
  ) {
    roles.add("ramp");
  }
  if (/\bsearch your library for (a card|an? .* card)|\btutor\b|\bwish\b/i.test(text) && !/\bsearch your library for .*basic land|\bsearch your library for .*land card/i.test(text)) {
    roles.add("tutor");
  }
  if (/\bdestroy all\b|\bexile all\b|\beach creature\b|\ball creatures\b|\bcreatures get -\d\/-\d until end of turn\b/i.test(text)) {
    roles.add("board_wipe");
  }
  if (/\bgraveyard\b|\bexile .* cards? from .* graveyard\b|\bescape\b|\bflashback\b|\bdelve\b/i.test(text)) {
    roles.add("graveyard_interaction");
  }
  if (/\bdestroy target (artifact|enchantment)|\bexile target (artifact|enchantment)|\bartifact or enchantment\b/i.test(text)) {
    roles.add("artifact_enchantment_interaction");
  }
  if (
    /\bcombo\b|\bcopy target spell\b|\bcast from your graveyard\b|\breturn target creature card from .* graveyard to the battlefield\b|\bput that card into your graveyard\b|\bsearch your library for a card and put that card into your graveyard\b|\benchant creature card in a graveyard\. return that card\b|\bwhenever you cast .* copy\b|\bwhenever you sacrifice .* (draw|create|return|add|untap)\b/i.test(text)
  ) {
    roles.add("combo_enabler");
  }
  if (/\bwin the game\b|\byou may cast .* without paying|\bfor each\b.*\bcreate\b|\bwhenever .* you win\b|\bgets \+x\/\+x\b/i.test(text)) {
    roles.add("combo_payoff");
  }
  if (!roles.size && (type === "artifacts" || type === "enchantments" || type === "battles")) {
    roles.add("utility");
  }
  return roles.size ? Array.from(roles) : ["unknown"];
}

function cardRole(card: ManaCurveCardData | undefined) {
  if (!card) {
    return "Curve slot";
  }
  const roles = detectFunctionalRoles(card);
  if (roles.includes("removal")) {
    return "Removal";
  }
  if (roles.includes("countermagic")) {
    return "Countermagic";
  }
  if (roles.includes("card_selection")) {
    return "Selection";
  }
  if (roles.includes("card_draw")) {
    return "Card draw";
  }
  if (roles.includes("ramp")) {
    return "Ramp";
  }
  if (roles.includes("combo_enabler")) {
    return "Combo enabler";
  }
  if (roles.includes("combo_payoff")) {
    return "Combo payoff";
  }
  const type = primaryCardType(card);
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

function metricScale(format: string, totalCards: number) {
  const normalized = format.trim().toLowerCase();
  if (normalized === "draft") {
    return { scale: 40 / 60, kind: "draft" as const };
  }
  if (normalized === "commander" || normalized === "brawl") {
    return { scale: Math.max(1, totalCards || 100) / 60, kind: "singleton" as const };
  }
  return { scale: Math.max(1, totalCards || 60) / 60, kind: "constructed" as const };
}

function scaledRange(range: StructureMetricRange, format: string, totalCards: number, key: StructureMetricKey): StructureMetricRange {
  const { scale, kind } = metricScale(format, totalCards);
  if (kind === "draft") {
    const draftOverrides: Partial<Record<StructureMetricKey, StructureMetricRange>> = {
      landCount: { min: 16, max: 18, label: "lands" },
      earlyPlays: { min: 5, label: "early plays" },
      expensiveSpells: { max: 5, label: "expensive spells" },
      oneOfCards: { label: "singleton draft cards" }
    };
    return draftOverrides[key] ?? {
      ...range,
      min: range.min === undefined ? undefined : Math.round(range.min * scale),
      max: range.max === undefined ? undefined : Math.round(range.max * scale)
    };
  }
  if (kind === "singleton") {
    const singletonOverrides: Partial<Record<StructureMetricKey, StructureMetricRange>> = {
      landCount: format.trim().toLowerCase() === "brawl" ? { min: 23, max: 27, label: "lands" } : { min: 35, max: 40, label: "lands" },
      rampCount: format.trim().toLowerCase() === "brawl" ? { min: 4, max: 9, label: "ramp pieces" } : { min: 8, max: 14, label: "ramp pieces" },
      earlyPlays: { min: format.trim().toLowerCase() === "brawl" ? 7 : 10, label: "early setup" },
      drawSelection: { min: format.trim().toLowerCase() === "brawl" ? 4 : 8, label: "draw or selection" },
      cheapInteraction: { min: format.trim().toLowerCase() === "brawl" ? 4 : 7, label: "interaction" },
      finishers: { min: 3, max: format.trim().toLowerCase() === "brawl" ? 8 : 14, label: "finishers" },
      expensiveSpells: { max: format.trim().toLowerCase() === "brawl" ? 10 : 18, label: "expensive spells" },
      oneOfCards: { label: "singleton deck construction" }
    };
    if (singletonOverrides[key]) {
      return singletonOverrides[key]!;
    }
  }
  if (kind === "singleton" && key === "oneOfCards") {
    return { label: "singleton deck construction" };
  }
  return {
    ...range,
    min: range.min === undefined ? undefined : Math.round(range.min * scale),
    max: range.max === undefined ? undefined : Math.round(range.max * scale)
  };
}

function buildStructuralMetrics(
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
): StructuralMetrics {
  const metrics: StructuralMetrics = {
    oneManaPlays: facts.curve.find((row) => row.manaValue === "1")?.spells ?? 0,
    earlyPlays:
      (facts.curve.find((row) => row.manaValue === "1")?.spells ?? 0) +
      (facts.curve.find((row) => row.manaValue === "2")?.spells ?? 0),
    earlyThreats: 0,
    cheapInteraction: 0,
    drawSelection: 0,
    landCount: facts.landCount,
    rampCount: 0,
    rampPayoffs: 0,
    expensiveSpells: ["5", "6", "7+"].reduce((sum, bucket) => sum + (facts.curve.find((row) => row.manaValue === bucket)?.spells ?? 0), 0),
    finishers: 0,
    oneOfCards: facts.oneOfCount,
    comboPieces: 0,
    boardWipes: 0,
    spellCount: facts.spellCount,
    averageManaValue: facts.averageManaValue,
    colors: facts.colors
  };

  for (const entry of analysisCards) {
    const card = cardData.get(normalizeName(entry.name));
    if (!card || card.isLand) {
      continue;
    }
    const roles = detectFunctionalRoles(card);
    const mv = physicalManaValueForCard(card);
    if (roles.includes("threat") && mv <= 2) {
      metrics.earlyThreats += entry.qty;
    }
    if (
      mv <= 2 &&
      (roles.includes("removal") ||
        roles.includes("countermagic") ||
        roles.includes("discard") ||
        roles.includes("burn_reach") ||
        roles.includes("protection"))
    ) {
      metrics.cheapInteraction += entry.qty;
    }
    if (roles.includes("card_draw") || roles.includes("card_selection") || roles.includes("tutor")) {
      metrics.drawSelection += entry.qty;
    }
    if (roles.includes("ramp")) {
      metrics.rampCount += entry.qty;
    }
    if ((roles.includes("finisher") || roles.includes("combo_payoff") || mv >= 5) && mv >= 4) {
      metrics.rampPayoffs += entry.qty;
    }
    if (roles.includes("finisher") || (roles.includes("combo_payoff") && mv >= 4)) {
      metrics.finishers += entry.qty;
    }
    if (roles.includes("combo_enabler") || roles.includes("combo_payoff")) {
      metrics.comboPieces += entry.qty;
    }
    if (roles.includes("board_wipe")) {
      metrics.boardWipes += entry.qty;
    }
  }
  return metrics;
}

function postureEvidence(label: string, value: number) {
  return `${label}: ${value}`;
}

export function classifyDeckPosture(
  metrics: StructuralMetrics,
  format: string,
  totalCards: number
): DeckPostureResult {
  const { kind } = metricScale(format, totalCards);
  const scores: Record<DeckPosture, { score: number; evidence: string[] }> = {
    aggro: { score: 0, evidence: [] },
    tempo: { score: 0, evidence: [] },
    midrange: { score: 0, evidence: [] },
    control: { score: 0, evidence: [] },
    ramp: { score: 0, evidence: [] },
    combo: { score: 0, evidence: [] },
    unknown: { score: 0, evidence: [] }
  };

  const add = (posture: DeckPosture, points: number, evidence: string) => {
    scores[posture].score += points;
    scores[posture].evidence.push(evidence);
  };

  const lowAvg = metrics.averageManaValue <= 2.35;
  const midAvg = metrics.averageManaValue > 2.2 && metrics.averageManaValue <= 3.15;
  const highAvg = metrics.averageManaValue >= 2.75;

  if (metrics.oneManaPlays >= scaledRange({ min: 8, label: "" }, format, totalCards, "oneManaPlays").min!) {
    add("aggro", 1.6, postureEvidence("dense one-mana plays", metrics.oneManaPlays));
    add("tempo", 0.8, postureEvidence("one-mana setup", metrics.oneManaPlays));
  }
  if (metrics.earlyThreats >= scaledRange({ min: 8, label: "" }, format, totalCards, "earlyThreats").min!) {
    add("aggro", 1.8, postureEvidence("cheap threats", metrics.earlyThreats));
  }
  if (metrics.earlyPlays >= scaledRange({ min: 18, label: "" }, format, totalCards, "earlyPlays").min!) {
    add("aggro", 1.1, postureEvidence("early plays", metrics.earlyPlays));
    add("tempo", 1, postureEvidence("early plays", metrics.earlyPlays));
  }
  if (metrics.cheapInteraction >= scaledRange({ min: 8, label: "" }, format, totalCards, "cheapInteraction").min!) {
    add("tempo", 1.5, postureEvidence("cheap interaction", metrics.cheapInteraction));
    add("control", 1.2, postureEvidence("cheap interaction", metrics.cheapInteraction));
    add("midrange", 0.9, postureEvidence("cheap interaction", metrics.cheapInteraction));
  }
  if (metrics.drawSelection >= scaledRange({ min: 6, label: "" }, format, totalCards, "drawSelection").min!) {
    add("tempo", 1, postureEvidence("draw/selection", metrics.drawSelection));
    add("control", 1.2, postureEvidence("draw/selection", metrics.drawSelection));
    add("combo", 1.4, postureEvidence("draw/selection/tutors", metrics.drawSelection));
  }
  if (metrics.boardWipes >= scaledRange({ min: 2, label: "" }, format, totalCards, "boardWipes").min!) {
    add("control", 1.5, postureEvidence("sweepers", metrics.boardWipes));
  }
  if (metrics.landCount >= scaledRange({ min: 25, label: "" }, format, totalCards, "landCount").min! && kind !== "draft") {
    add("control", 0.8, postureEvidence("high land count", metrics.landCount));
    add("ramp", 0.7, postureEvidence("high land count", metrics.landCount));
  }
  if (metrics.rampCount >= scaledRange({ min: 6, label: "" }, format, totalCards, "rampCount").min!) {
    add("ramp", 2, postureEvidence("ramp density", metrics.rampCount));
  }
  if (metrics.expensiveSpells >= scaledRange({ min: 5, label: "" }, format, totalCards, "expensiveSpells").min!) {
    add("ramp", 1.3, postureEvidence("top-end density", metrics.expensiveSpells));
    add("control", 0.4, postureEvidence("late-game cards", metrics.expensiveSpells));
  }
  if (metrics.comboPieces >= scaledRange({ min: 6, label: "" }, format, totalCards, "comboPieces").min!) {
    add("combo", 2, postureEvidence("combo-like pieces", metrics.comboPieces));
  }
  if (metrics.comboPieces >= 6 && metrics.drawSelection >= 6) {
    add("combo", 1.4, "combo pieces backed by tutors or selection");
  }
  if (metrics.finishers >= scaledRange({ min: 3, label: "" }, format, totalCards, "finishers").min! && metrics.rampCount >= 4) {
    add("ramp", 0.8, postureEvidence("ramp payoffs", metrics.finishers));
  }
  if (lowAvg) {
    add("aggro", 0.9, postureEvidence("low average MV", Number(metrics.averageManaValue.toFixed(2))));
    add("tempo", 0.5, postureEvidence("low average MV", Number(metrics.averageManaValue.toFixed(2))));
  }
  if (midAvg) {
    add("midrange", 1.1, postureEvidence("midrange average MV", Number(metrics.averageManaValue.toFixed(2))));
  }
  if (highAvg) {
    add("ramp", 0.5, postureEvidence("higher average MV", Number(metrics.averageManaValue.toFixed(2))));
    add("control", 0.4, postureEvidence("higher average MV", Number(metrics.averageManaValue.toFixed(2))));
  }

  if (metrics.comboPieces >= 10 && metrics.drawSelection >= 6) {
    return {
      posture: "combo",
      confidence: metrics.comboPieces >= 14 ? "high" : "medium",
      evidence: scores.combo.evidence.slice(0, 4)
    };
  }

  const ranked = (Object.entries(scores) as Array<[DeckPosture, { score: number; evidence: string[] }]>)
    .filter(([posture]) => posture !== "unknown")
    .sort((a, b) => b[1].score - a[1].score);
  const [best, second] = ranked;
  if (!best || best[1].score < 3.2 || (second && best[1].score - second[1].score < 0.85)) {
    return {
      posture: "unknown",
      confidence: best?.[1].score >= 3 ? "medium" : "low",
      evidence: best?.[1].evidence.slice(0, 3) ?? ["Insufficient distinct signals for a confident posture."]
    };
  }

  const confidence: DeckPostureResult["confidence"] = best[1].score >= 5.6 && (!second || best[1].score - second[1].score >= 1.5) ? "high" : "medium";
  return {
    posture: best[0],
    confidence,
    evidence: best[1].evidence.slice(0, 4)
  };
}

function castModeEntriesForCard(entry: ParsedDeckCard, card: ManaCurveCardData | undefined) {
  if (!card) {
    return [{ qty: entry.qty, card }];
  }

  const layout = card.layout?.toLowerCase() ?? "";
  const splitLikeLayouts = new Set(["split", "aftermath", "room"]);
  const modalSpellLayouts = new Set(["adventure", "modal_dfc", "prototype"]);
  const transformLikeLayouts = new Set(["transform", "meld", "reversible_card"]);
  const nonlandFaces = (card.faces ?? []).filter((face) => !/\bland\b/i.test(face.typeLine));
  const shouldSplitFaces =
    splitLikeLayouts.has(layout) ||
    (/\broom\b/i.test(card.typeLine) && nonlandFaces.length >= 2) ||
    (modalSpellLayouts.has(layout) && nonlandFaces.length >= 2) ||
    (!layout && nonlandFaces.length >= 2 && !card.isLand && card.manaCost?.includes("//"));
  if (!shouldSplitFaces) {
    if (transformLikeLayouts.has(layout) || layout === "modal_dfc") {
      const frontFace = nonlandFaces[0];
      if (frontFace) {
        const frontCost = frontFace.manaCost || card.manaCost || "";
        return [
          {
            qty: entry.qty,
            card: {
              ...card,
              name: frontFace.name || card.name,
              manaCost: frontCost,
              manaValue: Math.max(0, frontCost ? manaValueFromCost(frontCost) : frontFace.manaValue ?? physicalManaValueFromRaw(card)),
              typeLine: frontFace.typeLine || card.typeLine,
              oracleText: frontFace.oracleText ?? card.oracleText ?? ""
            }
          }
        ];
      }
    }
    return [{ qty: entry.qty, card }];
  }

  const splitCosts = card.manaCost?.includes("//") ? card.manaCost.split("//").map((cost) => cost.trim()) : [];
  return nonlandFaces.map((face, index) => {
    const faceCost = face.manaCost || splitCosts[index] || "";
    return {
      qty: entry.qty,
      card: {
        ...card,
        name: face.name || card.name,
        manaCost: faceCost,
        manaValue: Math.max(0, faceCost ? manaValueFromCost(faceCost) : face.manaValue ?? 0),
        typeLine: face.typeLine || card.typeLine,
        oracleText: face.oracleText ?? ""
      }
    };
  });
}

function physicalManaValueFromRaw(card: ManaCurveCardData) {
  if (card.manaCost?.includes("//")) {
    return Math.min(...card.manaCost.split("//").map((cost) => manaValueFromCost(cost.trim())).filter((value) => value >= 0));
  }
  return Math.max(0, card.manaCost ? manaValueFromCost(card.manaCost) : card.manaValue);
}

function physicalManaValueForCard(card: ManaCurveCardData | undefined) {
  if (!card) {
    return 0;
  }
  if (card.isLand) {
    return 0;
  }

  const nonlandModes = castModeEntriesForCard({ name: card.name, qty: 1, section: "main" }, card)
    .map((entry) => entry.card)
    .filter((entry): entry is ManaCurveCardData => Boolean(entry))
    .filter((entry) => primaryCardType(entry) !== "lands");

  if (nonlandModes.length) {
    return Math.min(...nonlandModes.map((entry) => Math.max(0, entry.manaValue)));
  }

  return Math.max(0, card.manaValue);
}

function hasLandSpellModalFaces(card: ManaCurveCardData | undefined) {
  if (!card?.faces?.length) {
    return false;
  }
  const hasLandFace = card.faces.some((face) => /\bland\b/i.test(face.typeLine));
  const hasSpellFace = card.faces.some((face) => !/\bland\b/i.test(face.typeLine));
  return hasLandFace && hasSpellFace;
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
  },
  posture: DeckPostureResult,
  metrics: StructuralMetrics,
  format: string,
  scope: ManaCurveAnalysis["scope"]
): ManaCurveObservation[] {
  const observations: ManaCurveObservation[] = [];
  const coloredPips = mainCards.reduce((sum, entry) => {
    const card = cardData.get(normalizeName(entry.name));
    return sum + (cardColors(card).length >= 2 ? entry.qty : 0);
  }, 0);

  if (scope === "sideboard") {
    return [
      {
        code: "NO_MAJOR_WARNING",
        tone: "neutral",
        title: "Sideboard scope selected",
        detail:
          "Main-deck curve posture warnings are suppressed for sideboard-only views. Use this view for role mix and curve pressure of cards you may bring in.",
        measuredValue: analysisCards.reduce((total, card) => total + card.qty, 0),
        confidence: "high",
        evidence: ["Sideboards are not expected to follow main-deck curve ranges."]
      }
    ];
  }

  const postureRanges = constructedRanges[posture.posture] ?? constructedRanges.unknown;
  const totalCards = mainCards.reduce((total, card) => total + card.qty, 0);
  const postureName = posture.posture === "unknown" ? "mixed/unknown" : posture.posture;
  const observationCodeForRange = (key: StructureMetricKey, below: boolean): ManaCurveObservationCode => {
    if (key === "oneManaPlays") return "LOW_ONE_MANA_PLAYS";
    if (key === "earlyPlays") return "LOW_EARLY_ACTION";
    if (key === "earlyThreats") return "LOW_EARLY_THREATS";
    if (key === "cheapInteraction") return "LOW_CHEAP_INTERACTION";
    if (key === "drawSelection") return "LOW_CARD_FLOW";
    if (key === "rampCount") return "LOW_RAMP";
    if (key === "rampPayoffs") return "LOW_RAMP_PAYOFFS";
    if (key === "finishers") return "LOW_FINISHERS";
    if (key === "boardWipes") return "LOW_SWEEPERS";
    if (key === "comboPieces") return "LOW_COMBO_PIECES";
    if (key === "landCount") return below ? "LAND_COUNT_LOW" : "LAND_COUNT_HIGH";
    if (key === "expensiveSpells") return "HEAVY_TOP_END";
    if (key === "oneOfCards") return "MANY_ONE_OFS";
    return "NO_MAJOR_WARNING";
  };

  const addRangeObservation = (
    key: StructureMetricKey,
    title: string,
    lowDetail: string,
    highDetail?: string,
    highTitle?: string
  ) => {
    const rawRange = postureRanges[key];
    if (!rawRange) {
      return;
    }
    const range = scaledRange(rawRange, format, totalCards, key);
    if (range.min === undefined && range.max === undefined) {
      return;
    }
    const value = metrics[key];
    const below = range.min !== undefined && value < range.min;
    const above = range.max !== undefined && value > range.max;
    if (!below && !above) {
      return;
    }
    const distance = below && range.min ? (range.min - value) / Math.max(1, range.min) : above && range.max ? (value - range.max) / Math.max(1, range.max) : 0;
    const confidence: ManaCurveObservation["confidence"] =
      posture.confidence === "high" && distance >= 0.3 ? "high" : posture.confidence === "low" ? "low" : "medium";
    observations.push({
      code: observationCodeForRange(key, below),
      tone: below || key === "expensiveSpells" || key === "oneOfCards" || key === "landCount" ? "bad" : "neutral",
      title: below ? title : highTitle ?? title,
      detail: below ? lowDetail : highDetail ?? lowDetail,
      measuredValue: value,
      expectedRange: { min: range.min, max: range.max },
      confidence,
      evidence: [
        `Inferred posture: ${postureName}`,
        `Measured ${range.label}: ${value}`,
        `Expected ${range.label}: ${range.min ?? "any"}-${range.max ?? "any"}`
      ]
    });
  };

  addRangeObservation(
    "oneManaPlays",
    "One-mana plays may be low",
    `This looks like a ${postureName} deck, but only ${metrics.oneManaPlays} one-mana play(s) were detected. That can make opener quality more dependent on exact two-mana sequencing.`
  );
  addRangeObservation(
    "earlyPlays",
    "Early action density may be low",
    `This looks like a ${postureName} deck, but only ${metrics.earlyPlays} one- and two-mana play(s) were detected. Some openers may spend early turns without meaningful development.`
  );
  addRangeObservation(
    "earlyThreats",
    "Cheap threat count may be low",
    `This looks like a ${postureName} deck, but only ${metrics.earlyThreats} cheap threat(s) were detected. Pressure hands may be less common than the curve suggests.`
  );
  addRangeObservation(
    "cheapInteraction",
    "Cheap interaction may be light",
    `This looks like a ${postureName} deck, but only ${metrics.cheapInteraction} cheap interaction, protection, discard, or reach slot(s) were detected.`
  );
  addRangeObservation(
    "drawSelection",
    "Card flow may be light",
    `This looks like a ${postureName} deck, but only ${metrics.drawSelection} draw, selection, or tutor slot(s) were detected. Mulligans and awkward openers may be harder to smooth.`
  );
  addRangeObservation(
    "rampCount",
    "Ramp density may be low",
    `This looks like a ramp deck, but only ${metrics.rampCount} ramp piece(s) were detected. Expensive hands may not reliably accelerate.`
  );
  addRangeObservation(
    "rampPayoffs",
    "Ramp payoff density may be low",
    `This looks like a ramp deck, but only ${metrics.rampPayoffs} meaningful payoff card(s) were detected. Ramp-heavy hands may not convert extra mana into pressure or advantage.`,
    `${metrics.rampPayoffs} payoff card(s) were detected. The top end may be crowded for the amount of ramp and card flow available.`,
    "Top end may be heavy"
  );
  addRangeObservation(
    "expensiveSpells",
    "Top end may be light",
    `${metrics.expensiveSpells} spell card(s) cost five or more. For this posture, the deck may be light on late-game payoffs.`,
    `${metrics.expensiveSpells} spell card(s) cost five or more. For this posture, that can increase stranded-card risk in opening hands.`,
    "Top end may be heavy"
  );
  addRangeObservation(
    "finishers",
    "Finisher density may need review",
    `${metrics.finishers} finisher or payoff card(s) were detected, which may leave late-game plans light for this posture.`,
    `${metrics.finishers} finisher or payoff card(s) were detected, which may overload openers for this posture.`
  );
  addRangeObservation(
    "boardWipes",
    "Sweeper density may be low",
    `${metrics.boardWipes} board wipe(s) were detected. Control shells often need access to sweepers to stabilize creature-heavy boards.`
  );
  addRangeObservation(
    "comboPieces",
    "Combo piece density may be low",
    `${metrics.comboPieces} enabler/payoff card(s) were detected. Combo posture requires enough pieces, tutors, or selection to assemble its core plan.`
  );
  addRangeObservation(
    "landCount",
    "Land count may not match posture",
    `${metrics.landCount} lands may be low for a ${postureName} deck with this curve posture.`,
    `${metrics.landCount} lands may be high for a ${postureName} deck unless those lands are spell-like, modal, or attached to mana sinks.`
  );
  addRangeObservation(
    "oneOfCards",
    "Many isolated one-of cards",
    `${facts.oneOfCount} main-deck one-ofs can reduce opener consistency unless they are tutors, modal cards, or matchup-specific slots.`,
    `${facts.oneOfCount} main-deck one-ofs can reduce opener consistency unless they are tutors, modal cards, or matchup-specific slots.`
  );

  if (facts.colors.length >= 3 && coloredPips >= 14) {
    observations.push({
      code: "HIGH_COLOR_STRAIN",
      tone: "neutral",
      title: "Colored mana requirements may strain the mana base",
      detail: `${coloredPips} nonland cards have multicolor requirements across ${facts.colors.join("")}, so source quality matters.`,
      measuredValue: coloredPips,
      expectedRange: { max: 13 },
      confidence: facts.colors.length >= 4 ? "high" : "medium",
      evidence: [`Colors detected: ${facts.colors.join("")}`, `${coloredPips} multicolor nonland row-copy requirements`]
    });
  }

  if (!observations.length) {
    observations.push({
      code: "NO_MAJOR_WARNING",
      tone: "good",
      title: "Structure sits within contextual ranges",
      detail: `No major ${postureName} curve warnings were detected from the current card data.`,
      confidence: posture.confidence === "low" ? "low" : "medium",
      evidence: posture.evidence.length ? posture.evidence : ["No single structural pressure point exceeded the configured contextual ranges."]
    });
  }

  return observations;
}

function normalizedDeckVector(cards: Array<{ name: string; qty: number }>) {
  const vector = new Map<string, { name: string; qty: number }>();
  for (const card of cards) {
    const faces = card.name.split("//").map((name) => name.trim()).filter(Boolean);
    const names = faces.length > 1 ? [card.name, ...faces] : [card.name];
    for (const name of names) {
      if (basicLandName(name)) {
        continue;
      }
      const key = normalizeName(name);
      const existing = vector.get(key) ?? { name, qty: 0 };
      vector.set(key, { name: existing.name, qty: existing.qty + card.qty / names.length });
    }
  }
  return vector;
}

function stapleWeights(metagameDecks: MetagameDeck[]) {
  const deckCount = Math.max(1, metagameDecks.length);
  const appearances = new Map<string, number>();
  for (const deck of metagameDecks) {
    const seen = new Set<string>();
    for (const [key] of Array.from(normalizedDeckVector(deck.main))) {
      seen.add(key);
    }
  for (const key of Array.from(seen)) {
      appearances.set(key, (appearances.get(key) ?? 0) + 1);
    }
  }
  const weights = new Map<string, number>();
  for (const [key, count] of Array.from(appearances)) {
    const share = count / deckCount;
    weights.set(key, share >= 0.45 ? 0.35 : share >= 0.28 ? 0.62 : 1);
  }
  return weights;
}

function colorsFromParsed(cards: ParsedDeckCard[], cardData?: Map<string, ManaCurveCardData>) {
  if (cardData) {
    return deckColors(cards, cardData);
  }
  return [];
}

function colorSimilarity(savedColors: string[], tournamentColors: string[]) {
  if (!savedColors.length || !tournamentColors.length) {
    return 0.72;
  }
  const union = new Set([...savedColors, ...tournamentColors]);
  const shared = savedColors.filter((color) => tournamentColors.includes(color)).length;
  return shared / Math.max(1, union.size);
}

function curvePosture(cards: Array<{ name: string; qty: number }>, cardData?: Map<string, ManaCurveCardData>) {
  if (!cardData) {
    return { low: 0, mid: 0, high: 0 };
  }
  let low = 0;
  let mid = 0;
  let high = 0;
  for (const card of cards) {
    const data = cardData.get(normalizeName(card.name));
    if (!data || data.isLand) {
      continue;
    }
    const mv = physicalManaValueForCard(data);
    if (mv <= 2) {
      low += card.qty;
    } else if (mv <= 4) {
      mid += card.qty;
    } else {
      high += card.qty;
    }
  }
  const total = Math.max(1, low + mid + high);
  return { low: low / total, mid: mid / total, high: high / total };
}

function curveSimilarity(a: ReturnType<typeof curvePosture>, b: ReturnType<typeof curvePosture>) {
  const distance = Math.abs(a.low - b.low) + Math.abs(a.mid - b.mid) + Math.abs(a.high - b.high);
  return Math.max(0, 1 - distance / 2);
}

function compareDeckSimilarity(
  mainCards: ParsedDeckCard[],
  deck: MetagameDeck,
  weights: Map<string, number>,
  cardData?: Map<string, ManaCurveCardData>
): DeckSimilarity {
  const saved = normalizedDeckVector(mainCards);
  const tournament = normalizedDeckVector(deck.main);
  const allKeys = new Set([...Array.from(saved.keys()), ...Array.from(tournament.keys())]);
  let intersection = 0;
  let union = 0;
  let sharedWeightedCopies = 0;
  let sharedDistinctCards = 0;

  for (const key of Array.from(allKeys)) {
    const weight = weights.get(key) ?? 1;
    const savedQty = saved.get(key)?.qty ?? 0;
    const tournamentQty = tournament.get(key)?.qty ?? 0;
    intersection += Math.min(savedQty, tournamentQty) * weight;
    union += Math.max(savedQty, tournamentQty) * weight;
    if (savedQty && tournamentQty) {
      sharedDistinctCards += 1;
      sharedWeightedCopies += Math.min(savedQty, tournamentQty);
    }
  }

  const colorScore = colorSimilarity(colorsFromParsed(mainCards, cardData), deck.colors ?? []);
  const curveScore = curveSimilarity(curvePosture(mainCards, cardData), curvePosture(deck.main, cardData));
  const rawJaccard = union ? intersection / union : 0;
  const meaningfulOverlap = sharedDistinctCards >= 6 || sharedWeightedCopies >= 16;
  const score = rawJaccard * 0.72 + colorScore * 0.18 + curveScore * 0.1;
  const confidence: DeckSimilarity["confidence"] =
    meaningfulOverlap && score >= 0.42 ? "high" : meaningfulOverlap && score >= 0.3 ? "medium" : score >= 0.24 ? "low" : "low";

  return {
    score,
    sharedWeightedCopies,
    sharedDistinctCards,
    supportingDeckCount: 1,
    confidence,
    colorSimilarity: colorScore,
    curveSimilarity: curveScore,
    archetypeAgreement: false
  };
}

function findSimilarTournamentDecks(
  mainCards: ParsedDeckCard[],
  metagameDecks: MetagameDeck[] = [],
  cardData?: Map<string, ManaCurveCardData>
) {
  const weights = stapleWeights(metagameDecks);
  return metagameDecks
    .map((deck) => ({
      deck,
      similarity: compareDeckSimilarity(mainCards, deck, weights, cardData)
    }))
    .filter((match) => match.similarity.sharedDistinctCards >= 4 && match.similarity.sharedWeightedCopies >= 10 && match.similarity.score >= 0.24)
    .sort((a, b) => {
      const rankA = a.deck.rank ?? 999;
      const rankB = b.deck.rank ?? 999;
      return b.similarity.score - a.similarity.score || b.similarity.sharedWeightedCopies - a.similarity.sharedWeightedCopies || rankA - rankB;
    })
    .slice(0, 18);
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

function tournamentCandidates(mainCards: ParsedDeckCard[], metagameDecks: MetagameDeck[] = [], cardData: Map<string, ManaCurveCardData>) {
  const savedCounts = countRows(mainCards);
  const similar = findSimilarTournamentDecks(mainCards, metagameDecks, cardData);
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
      const row = candidates.get(key) ?? {
        name: card.name,
        qty: 0,
        source: "similar-tournament-decks" as const,
        sourceDecks: 0,
        evidenceDecks: [],
        similarity: match.similarity
      };
      candidates.set(key, {
        ...row,
        qty: Math.max(row.qty, card.qty - current),
        sourceDecks: (row.sourceDecks ?? 0) + 1,
        evidenceDecks: [...(row.evidenceDecks ?? []), match.deck],
        similarity:
          !row.similarity || match.similarity.score > row.similarity.score
            ? { ...match.similarity, supportingDeckCount: (row.sourceDecks ?? 0) + 1 }
            : { ...row.similarity, supportingDeckCount: (row.sourceDecks ?? 0) + 1 }
      });
    }
  }

  return Array.from(candidates.values()).sort((a, b) => (b.sourceDecks ?? 0) - (a.sourceDecks ?? 0) || a.name.localeCompare(b.name));
}

function sideboardCandidates(sideboardCards: ParsedDeckCard[], mainCards: ParsedDeckCard[]): CandidateCard[] {
  const mainCounts = countRows(mainCards);
  return sideboardCards
    .filter((card) => !mainCounts.has(normalizeName(card.name)))
    .map((card) => ({ name: card.name, qty: card.qty, source: "sideboard" as const }));
}

function candidateAddressesObservation(card: ManaCurveCardData | undefined, observation: ManaCurveObservation) {
  const mv = physicalManaValueForCard(card);
  const type = card ? primaryCardType(card) : "other";
  const roles = detectFunctionalRoles(card);
  switch (observation.code) {
    case "LOW_ONE_MANA_PLAYS":
      return mv <= 1;
    case "LOW_EARLY_ACTION":
    case "LOW_EARLY_THREATS":
      return mv <= 2 && (roles.includes("threat") || roles.includes("card_selection") || roles.includes("removal") || roles.includes("burn_reach"));
    case "LOW_CHEAP_INTERACTION":
      return (
        mv <= 2 &&
        (roles.includes("removal") ||
          roles.includes("countermagic") ||
          roles.includes("discard") ||
          roles.includes("protection") ||
          roles.includes("burn_reach") ||
          type === "instants")
      );
    case "LOW_CARD_FLOW":
      return roles.includes("card_draw") || roles.includes("card_selection") || roles.includes("tutor");
    case "LOW_RAMP":
      return roles.includes("ramp");
    case "LOW_RAMP_PAYOFFS":
    case "LOW_FINISHERS":
      return roles.includes("finisher") || roles.includes("combo_payoff") || mv >= 5;
    case "LOW_SWEEPERS":
      return roles.includes("board_wipe");
    case "LOW_COMBO_PIECES":
      return roles.includes("combo_enabler") || roles.includes("combo_payoff") || roles.includes("tutor");
    case "HEAVY_TOP_END":
      return mv <= 3 && !roles.includes("finisher");
    case "HIGH_COLOR_STRAIN":
      return cardColors(card).length <= 1;
    default:
      return false;
  }
}

function detectedProblemForCard(card: ManaCurveCardData | undefined, observations: ManaCurveObservation[]) {
  const problem = observations.find((observation) => observation.tone !== "good" && candidateAddressesObservation(card, observation));
  if (!problem) {
    const mv = physicalManaValueForCard(card);
    const type = card ? primaryCardType(card) : "other";
    return { code: "NO_MAJOR_WARNING" as ManaCurveObservationCode, label: mv <= 2 ? "early curve density" : type === "instants" || type === "sorceries" ? "interactive spell density" : "structural role coverage" };
  }
  return { code: problem.code, label: problem.title };
}

function protectedFromCuts(row: { entry: ParsedDeckCard; card?: ManaCurveCardData }) {
  const roles = detectFunctionalRoles(row.card);
  return (
    roles.includes("combo_enabler") ||
    roles.includes("combo_payoff") ||
    roles.includes("tutor") ||
    roles.includes("finisher") ||
    roles.includes("board_wipe") ||
    (roles.some((role) => ["removal", "countermagic", "discard", "protection"].includes(role)) && row.entry.qty <= 2)
  );
}

function possibleCutsForProblem(mainCards: ParsedDeckCard[], cardData: Map<string, ManaCurveCardData>, problem: ManaCurveObservationCode): CutCandidate[] {
  const rows = mainCards
    .filter((entry) => !basicLandName(entry.name))
    .map((entry) => {
      const card = cardData.get(normalizeName(entry.name));
      return { entry, card, manaValue: physicalManaValueForCard(card), type: card ? primaryCardType(card) : "other" };
    })
    .filter((row) => row.card && !row.card.isLand && !protectedFromCuts(row));

  const candidates = rows
    .filter((row) => {
      if (problem === "LOW_ONE_MANA_PLAYS" || problem === "LOW_EARLY_ACTION" || problem === "LOW_CHEAP_INTERACTION" || problem === "HEAVY_TOP_END") {
        return row.manaValue >= 4 || row.entry.qty === 1;
      }
      if (problem === "HIGH_COLOR_STRAIN") {
        return cardColors(row.card).length >= 2;
      }
      return row.entry.qty === 1 || row.manaValue >= 3;
    })
    .sort((a, b) => b.manaValue - a.manaValue || a.entry.name.localeCompare(b.entry.name));

  return candidates.slice(0, 3).map((row) => ({
    cardName: row.entry.name,
    reason: row.entry.qty === 1 ? "isolated one-of or flex slot" : row.manaValue >= 4 ? "higher-cost card competing for curve space" : "may be a flexible slot for this issue",
    confidence: row.entry.qty === 1 || row.manaValue >= 5 ? "medium" : "low"
  }));
}

function buildContextualRanges(curve: ManaCurveRow[], spellCount: number, posture: DeckPosture): CurveComparisonRange[] {
  const rangesByPosture: Record<DeckPosture, Record<ManaCurveBucket, [number, number]>> = {
    aggro: { "0": [0, 0.1], "1": [0.28, 0.48], "2": [0.24, 0.42], "3": [0.06, 0.2], "4": [0, 0.1], "5": [0, 0.05], "6": [0, 0.03], "7+": [0, 0.02] },
    tempo: { "0": [0, 0.08], "1": [0.18, 0.36], "2": [0.28, 0.46], "3": [0.1, 0.26], "4": [0, 0.12], "5": [0, 0.06], "6": [0, 0.03], "7+": [0, 0.02] },
    midrange: { "0": [0, 0.08], "1": [0.1, 0.26], "2": [0.2, 0.38], "3": [0.16, 0.32], "4": [0.08, 0.22], "5": [0, 0.12], "6": [0, 0.07], "7+": [0, 0.04] },
    control: { "0": [0, 0.08], "1": [0.08, 0.22], "2": [0.18, 0.36], "3": [0.14, 0.3], "4": [0.08, 0.22], "5": [0.04, 0.16], "6": [0, 0.1], "7+": [0, 0.08] },
    ramp: { "0": [0, 0.08], "1": [0.08, 0.24], "2": [0.14, 0.34], "3": [0.12, 0.3], "4": [0.08, 0.22], "5": [0.06, 0.22], "6": [0.03, 0.16], "7+": [0.04, 0.2] },
    combo: { "0": [0, 0.12], "1": [0.14, 0.34], "2": [0.2, 0.42], "3": [0.1, 0.3], "4": [0, 0.16], "5": [0, 0.1], "6": [0, 0.06], "7+": [0, 0.06] },
    unknown: { "0": [0, 0.08], "1": [0.12, 0.34], "2": [0.18, 0.4], "3": [0.1, 0.3], "4": [0, 0.2], "5": [0, 0.14], "6": [0, 0.08], "7+": [0, 0.08] }
  };
  const ranges = rangesByPosture[posture] ?? rangesByPosture.unknown;

  return curve.map((row) => {
    const share = spellCount ? row.spells / spellCount : 0;
    const [typicalLow, typicalHigh] = ranges[row.manaValue];
    const label = share < typicalLow ? "below range" : share > typicalHigh ? "above range" : "in range";
    return { bucket: row.manaValue, count: row.spells, share, typicalLow, typicalHigh, label };
  });
}

function summarizeMainDeckForPosture(cards: ParsedDeckCard[], cardData: Map<string, ManaCurveCardData>) {
  const curveMap = new Map<ManaCurveBucket, ManaCurveRow>(
    manaCurveBuckets.map((manaValue) => [
      manaValue,
      { manaValue, spells: 0, types: emptyTypeCounts(), cards: emptyTypeCards() }
    ])
  );
  const values: Array<{ value: number; qty: number }> = [];
  let landCount = 0;
  let spellCount = 0;
  let totalManaValue = 0;

  for (const entry of cards) {
    const card = cardData.get(normalizeName(entry.name));
    const type = card ? primaryCardType(card) : "other";
    if (type === "lands") {
      landCount += entry.qty;
      continue;
    }
    const manaValue = physicalManaValueForCard(card);
    const row = curveMap.get(bucketForManaValue(manaValue))!;
    row.spells += entry.qty;
    row.types[type] += entry.qty;
    addCardToBucket(row.cards[type], entry.name, entry.qty);
    spellCount += entry.qty;
    totalManaValue += manaValue * entry.qty;
    values.push({ value: manaValue, qty: entry.qty });
  }

  const counts = countRows(cards);
  const facts = {
    landCount,
    spellCount,
    averageManaValue: spellCount ? totalManaValue / spellCount : 0,
    oneOfCount: Array.from(counts.values()).filter((card) => card.qty === 1).length,
    curve: manaCurveBuckets.map((bucket) => curveMap.get(bucket)!),
    colors: deckColors(cards, cardData),
    medianManaValue: weightedMedian(values)
  };
  return {
    facts,
    metrics: buildStructuralMetrics(cards, cardData, facts)
  };
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
  const activeCodes = new Set(observations.filter((observation) => observation.tone !== "good").map((observation) => observation.code));
  const candidatePool = [...tournamentCandidates(mainCards, metagameDecks, cardData), ...sideboardCandidates(sideboardCards, mainCards)];
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
    const suggestedQuantity = Math.max(1, Math.min(candidate.qty, maxCopies - currentCopies));
    const problem = detectedProblemForCard(card, observations);
    if (candidate.source === "similar-tournament-decks" && problem.code === "NO_MAJOR_WARNING") {
      continue;
    }
    const possibleCuts = possibleCutsForProblem(mainCards, cardData, problem.code);
    const supportingDeckCount = candidate.sourceDecks ?? 0;
    const similarityConfidence = candidate.similarity?.confidence ?? (candidate.source === "sideboard" ? "medium" : "low");
    if (candidate.source === "similar-tournament-decks" && similarityConfidence === "low") {
      continue;
    }
    const evidencePhrase =
      similarityConfidence === "high"
        ? "high-similarity"
        : similarityConfidence === "medium"
          ? "reasonably similar"
          : "loosely related";
    const reason =
      candidate.source === "similar-tournament-decks"
        ? `Worth testing as a ${role.toLowerCase()}: it appears in ${supportingDeckCount} recent ${evidencePhrase} Challenge list(s) and fits your ${colors.join("") || "colorless"} color lens.`
        : `Already in your sideboard, legal for this format, and can be tested as a ${role.toLowerCase()} without changing colors.`;

    suggestions.push({
      cardName: candidate.name,
      suggestedQuantity,
      role,
      slot: `${bucket}-mana ${primaryCardType(card).replace(/s$/, "")}`,
      problemAddressed: problem.label,
      reason,
      supportingDeckCount,
      similarityConfidence,
      formatLegality: card.legalities ? "legal" : "unknown",
      colorCompatibility: cardColors(card).length ? "fits" : "colorless",
      possibleCuts,
      source: candidate.source
    });
  }

  if (!suggestions.length) {
    if (activeCodes.has("LOW_ONE_MANA_PLAYS") || activeCodes.has("LOW_EARLY_ACTION")) {
      suggestions.push({
        cardName: "Add a one- or two-mana spell in your colors",
        suggestedQuantity: 2,
        role: "Early play",
        slot: "1-2 mana",
        problemAddressed: "insufficient early plays",
        reason: "The deck needs more early actions; choose a format-legal threat, cantrip, or interactive spell that matches your plan.",
        supportingDeckCount: 0,
        similarityConfidence: "low",
        formatLegality: "unknown",
        colorCompatibility: "fits",
        possibleCuts: possibleCutsForProblem(mainCards, cardData, "LOW_EARLY_ACTION"),
        source: "structural"
      });
    } else if (activeCodes.has("HEAVY_TOP_END")) {
      suggestions.push({
        cardName: "Replace a top-end spell with a cheaper role player",
        suggestedQuantity: 1,
        role: "Curve compression",
        slot: "2-3 mana",
        problemAddressed: "curve compression",
        reason: "The curve is heavy at five-plus mana; a cheaper card in the same role will make more opening hands function.",
        supportingDeckCount: 0,
        similarityConfidence: "low",
        formatLegality: "unknown",
        colorCompatibility: "fits",
        possibleCuts: possibleCutsForProblem(mainCards, cardData, "HEAVY_TOP_END"),
        source: "structural"
      });
    } else if (activeCodes.has("LOW_CHEAP_INTERACTION")) {
      suggestions.push({
        cardName: "Add cheap interaction or velocity",
        suggestedQuantity: 2,
        role: "Cheap interaction",
        slot: "1-2 mana",
        problemAddressed: "limited cheap interaction or velocity",
        reason: "The list has limited cheap instant/sorcery interaction; pick a legal card in your colors that advances the deck's primary plan.",
        supportingDeckCount: 0,
        similarityConfidence: "low",
        formatLegality: "unknown",
        colorCompatibility: "fits",
        possibleCuts: possibleCutsForProblem(mainCards, cardData, "LOW_CHEAP_INTERACTION"),
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
  const validation = validateDeckForManaCurve(decklist, cardData, format);
  const curveMap = new Map<ManaCurveBucket, ManaCurveRow>(
    manaCurveBuckets.map((manaValue) => [
      manaValue,
      { manaValue, spells: 0, types: emptyTypeCounts(), cards: emptyTypeCards() }
    ])
  );
  const physicalCurveMap = new Map<ManaCurveBucket, ManaCurveRow>(
    manaCurveBuckets.map((manaValue) => [
      manaValue,
      { manaValue, spells: 0, types: emptyTypeCounts(), cards: emptyTypeCards() }
    ])
  );
  const typeBreakdown = emptyTypeCounts();
  const physicalTypeBreakdown = emptyTypeCounts();
  const physicalSpellValues: Array<{ value: number; qty: number }> = [];
  const castModeValues: Array<{ value: number; qty: number }> = [];
  let physicalTotalManaValue = 0;
  let castModeTotalManaValue = 0;
  let physicalSpellCount = 0;
  let castModeCount = 0;
  let landCount = 0;
  let modalSourceCount = 0;

  for (const entry of analysisCards) {
    const card = cardData.get(normalizeName(entry.name));
    const physicalType = card ? primaryCardType(card) : "other";
    physicalTypeBreakdown[physicalType] += entry.qty;
    typeBreakdown[physicalType] += entry.qty;
    if (hasLandSpellModalFaces(card)) {
      modalSourceCount += entry.qty;
    }
    if (physicalType === "lands") {
      landCount += entry.qty;
    } else {
      const physicalManaValue = physicalManaValueForCard(card);
      const physicalBucket = bucketForManaValue(physicalManaValue);
      const physicalRow = physicalCurveMap.get(physicalBucket)!;
      physicalRow.spells += entry.qty;
      physicalRow.types[physicalType] += entry.qty;
      addCardToBucket(physicalRow.cards[physicalType], entry.name, entry.qty);
      physicalSpellCount += entry.qty;
      physicalTotalManaValue += physicalManaValue * entry.qty;
      physicalSpellValues.push({ value: physicalManaValue, qty: entry.qty });
    }

    // Physical cards are counted once above. Cast-mode entries may place one
    // physical card into multiple curve buckets, such as both doors of a Room.
    for (const curveEntry of castModeEntriesForCard(entry, card)) {
      const curveCard = curveEntry.card;
      const type = curveCard ? primaryCardType(curveCard) : "other";
      if (type === "lands") {
        continue;
      }

      const manaValue = Math.max(0, curveCard?.manaValue ?? 0);
      const bucket = bucketForManaValue(manaValue);
      const row = curveMap.get(bucket)!;
      row.spells += curveEntry.qty;
      row.types[type] += curveEntry.qty;
      addCardToBucket(row.cards[type], curveCard?.name ?? entry.name, curveEntry.qty);
      castModeCount += curveEntry.qty;
      castModeTotalManaValue += manaValue * curveEntry.qty;
      castModeValues.push({ value: manaValue, qty: curveEntry.qty });
    }
  }

  const colors = deckColors(mainCards, cardData);
  const mainCounts = countRows(mainCards);
  const oneOfCount = Array.from(mainCounts.values()).filter((card) => card.qty === 1).length;
  const curve = manaCurveBuckets.map((bucket) => curveMap.get(bucket)!);
  const physicalCurve = manaCurveBuckets.map((bucket) => physicalCurveMap.get(bucket)!);
  const facts = {
    landCount,
    spellCount: physicalSpellCount,
    averageManaValue: physicalSpellCount ? physicalTotalManaValue / physicalSpellCount : 0,
    oneOfCount,
    curve: physicalCurve,
    colors
  };
  const totalCards = analysisCards.reduce((total, card) => total + card.qty, 0);
  const mainSummary = summarizeMainDeckForPosture(mainCards, cardData);
  const structuralMetrics = mainSummary.metrics;
  const posture =
    scope === "sideboard"
      ? { posture: "unknown" as const, confidence: "low" as const, evidence: ["Sideboard-only view."] }
      : validation.isCompleteEnoughForPosture
        ? classifyDeckPosture(structuralMetrics, format, validation.mainCount)
        : { posture: "unknown" as const, confidence: "low" as const, evidence: ["Deck incomplete; posture withheld."] };
  const observations = validation.isCompleteEnoughForPosture
    ? buildObservations(mainCards, analysisCards, cardData, mainSummary.facts, posture, structuralMetrics, format, scope)
    : [
        {
          code: "INCOMPLETE_DECK" as const,
          tone: "neutral" as const,
          title: "Deck incomplete",
          detail:
            "Curve totals are shown, but posture and recommendations are withheld until the list is close to the expected size for this format.",
          measuredValue: validation.mainCount,
          expectedRange: validation.expectedMainSize ? { min: validation.expectedMainSize } : undefined,
          confidence: "high" as const,
          evidence: validation.issues.map((issue) => issue.detail).slice(0, 3)
        }
      ];

  return {
    scope,
    format,
    totalCards,
    physicalSpellCount,
    spellCount: physicalSpellCount,
    landCount,
    castModeCount,
    averageManaValue: facts.averageManaValue,
    medianManaValue: weightedMedian(physicalSpellValues),
    averageManaValueBasis: "physical-lowest-castable-mode",
    medianManaValueBasis: "physical-lowest-castable-mode",
    castModeAverageManaValue: castModeCount ? castModeTotalManaValue / castModeCount : 0,
    castModeMedianManaValue: weightedMedian(castModeValues),
    curve,
    castModeCurve: curve,
    physicalCurve,
    physicalTypeBreakdown,
    typeBreakdown,
    manaDemand: buildManaDemand(analysisCards, cardData),
    manaSources: buildManaSources(mainCards, cardData),
    contextualRanges: validation.isCompleteEnoughForPosture ? buildContextualRanges(physicalCurve, physicalSpellCount, posture.posture) : [],
    modalSourceCount,
    colors,
    oneOfCount,
    posture,
    observations,
    suggestions: validation.isCompleteEnoughForPosture
      ? buildSuggestions(
          mainCards,
          sideboardCards,
          cardData,
          format,
          colors,
          observations,
          options.metagameDecks ?? []
        )
      : [],
    validation
  };
}
