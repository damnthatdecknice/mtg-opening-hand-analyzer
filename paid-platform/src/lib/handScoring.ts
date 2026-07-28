export type CastabilityScoreRow = {
  cardName?: string;
  manaValue: number;
  turn1?: number;
  turn2: number;
  turn3: number;
};

export type ManaSufficiencyInput = {
  landsInHand: number;
  effectiveLandsInHand: number;
  profileLabel: string;
  curveTop: number;
  averageManaValue: number;
  turn2LandDrop: number;
  turn3LandDrop: number;
  turn4LandDrop: number;
  hasCastableRamp: boolean;
};

export type ScoreAdjustment = {
  adjustment: number;
  cap: number;
  note: string;
};

export type ManaColor = "W" | "U" | "B" | "R" | "G" | "C";

export type CardRole =
  | "land"
  | "early_action"
  | "threat"
  | "interaction"
  | "card_advantage"
  | "selection"
  | "ramp"
  | "tutor"
  | "protection"
  | "combo_enabler"
  | "combo_payoff"
  | "finisher"
  | "utility";

export type ManaProductionOption = {
  colors: ManaColor[];
  availableTurn: number;
  temporary?: boolean;
};

export type AnalysisCardInput = {
  name: string;
  manaCost?: string;
  manaValue: number;
  typeLine: string;
  oracleText: string;
  colors?: string[];
  producedMana?: string[];
  isLand: boolean;
  faces?: Array<{ name: string; manaCost: string; manaValue: number; typeLine: string; oracleText: string }>;
};

export type AnalysisCard = {
  id: string;
  name: string;
  quantity: number;
  manaValue: number;
  manaCost?: string;
  coloredPips: Partial<Record<ManaColor, number>>;
  types: string[];
  subtypes: string[];
  isLand: boolean;
  isSpell: boolean;
  entersTapped: boolean | "conditional";
  produces: ManaProductionOption[];
  roles: CardRole[];
  ramp?: RampProfile;
  costReduction?: CostReductionProfile;
  conditionality?: ConditionalProfile;
  earliestUsefulTurn?: number;
  latestPreferredTurn?: number;
  openingHandPriority?: number;
  duplicateTolerance?: number;
  synergyTags?: string[];
  dependencyTags?: string[];
};

export type RampProfile = {
  kind: "permanent" | "treasure" | "ritual" | "land_ramp" | "cost_reducer";
  earliestTurn: number;
  manaDelta: number;
};

export type CostReductionScope = "self" | "all" | "instant_sorcery" | "creature" | "artifact" | "noncreature";

export type CostReductionProfile = {
  amount: number;
  scope: CostReductionScope;
  activeAfterCast: boolean;
};

export type ConditionalProfile = {
  reason: string;
  severity: number;
};

export type HandUtilityResult = {
  meanUtility: number;
  medianUtility: number;
  lowerTailUtility: number;
  standardDeviation: number;
  catastrophicFailureRate: number;
  riskAdjustedUtility: number;
};

export type KeepRecommendation =
  | "strong_keep"
  | "keep"
  | "borderline"
  | "mulligan"
  | "strong_mulligan";

export type DeckRelativeScoreResult = {
  score: number;
  percentile: number;
  keepRecommendation: KeepRecommendation;
  keepExpectedValue: number;
  mulliganExpectedValue?: number;
  keepAdvantage?: number;
  confidence: number;
  utility: HandUtilityResult;
  factors: Array<{ label: string; value: number; tone: "good" | "neutral" | "bad" }>;
  warnings: string[];
  scoringVersion: string;
};

export type DeckRelativeScoreInput = {
  mainCounts: Map<string, number>;
  handNames: string[];
  cardData: ReadonlyMap<string, AnalysisCardInput>;
  playDraw: "play" | "draw";
  format?: string;
  profileLabel?: string;
  freeMulligan?: boolean;
  seed?: string;
  settings?: Partial<HandScoringSettings>;
};

export type HandScoringSettings = {
  handSimulations: number;
  baselineHands: number;
  drawsPerBaselineHand: number;
  analysisHorizon: number;
  beamWidth: number;
  mulliganHands: number;
};

export const HAND_SCORING_VERSION = "deck-relative-v1";

export const HAND_SCORING_CONFIG = {
  scoringVersion: HAND_SCORING_VERSION,
  defaultSettings: {
    handSimulations: 80,
    baselineHands: 350,
    drawsPerBaselineHand: 24,
    analysisHorizon: 5,
    beamWidth: 48,
    mulliganHands: 90
  },
  suggestedHighAccuracy: {
    handSimulations: 3000,
    baselineHands: 10000,
    drawsPerBaselineHand: 250,
    analysisHorizon: 5,
    beamWidth: 48,
    mulliganHands: 1200
  },
  weights: {
    development: 0.22,
    colorAccess: 0.18,
    manaUtilization: 0.2,
    timelyAction: 0.18,
    roleCoverage: 0.1,
    synergy: 0.12,
    strandedCardPenalty: 0.15,
    catastrophicSequencePenalty: 0.1
  },
  riskAdjustment: {
    mean: 0.7,
    lowerTail: 0.3,
    lowerTailPercentile: 0.2
  }
} as const;

type SimCard = AnalysisCard & { copyId: string };

type SimSource = {
  name: string;
  colors: ManaColor[];
  availableTurn: number;
  temporary?: boolean;
};

export type ManaPaymentSource = {
  id?: string;
  name: string;
  colors: ManaColor[];
};

export type ManaPaymentResult = {
  canPay: boolean;
  spentSourceIndexes: number[];
  remainingSourceIndexes: number[];
  approximationNotes: string[];
};

export type ManaPaymentOptions = {
  genericReduction?: number;
};

const BASELINE_CACHE = new Map<string, number[]>();

function stableHash(text: string) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function shuffle<T>(items: T[], random: () => number) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function sortedQuantile(values: number[], quantile: number) {
  if (!values.length) {
    return 0;
  }
  const index = Math.floor((values.length - 1) * quantile);
  return values[index] ?? values[values.length - 1] ?? 0;
}

function basicLandColors(name: string): ManaColor[] {
  const colors: Record<string, ManaColor[]> = {
    plains: ["W"],
    island: ["U"],
    swamp: ["B"],
    mountain: ["R"],
    forest: ["G"],
    wastes: ["C"]
  };
  return colors[normalizeName(name)] ?? [];
}

function allText(card: AnalysisCardInput) {
  return [card.oracleText, ...(card.faces ?? []).map((face) => face.oracleText)].join(" ").toLowerCase();
}

function splitTypeLine(typeLine: string) {
  const [typesText = "", subtypesText = ""] = typeLine.split("—").map((part) => part.trim());
  return {
    types: typesText
      .split(/\s+/)
      .map((type) => type.toLowerCase())
      .filter(Boolean),
    subtypes: subtypesText
      .split(/\s+/)
      .map((type) => type.toLowerCase())
      .filter(Boolean)
  };
}

function colorsFromText(text: string): ManaColor[] {
  const colors = new Set<ManaColor>();
  if (text.includes("any color")) {
    ["W", "U", "B", "R", "G"].forEach((color) => colors.add(color as ManaColor));
  }
  for (const match of Array.from(text.matchAll(/\{([WUBRGC])\}/gi))) {
    colors.add((match[1] ?? "").toUpperCase() as ManaColor);
  }
  for (const match of Array.from(text.matchAll(/\b(white|blue|black|red|green|colorless)\b/gi))) {
    const map: Record<string, ManaColor> = {
      white: "W",
      blue: "U",
      black: "B",
      red: "R",
      green: "G",
      colorless: "C"
    };
    colors.add(map[(match[1] ?? "").toLowerCase()]);
  }
  return Array.from(colors).filter(Boolean);
}

function manaSymbols(manaCost = "") {
  return Array.from(manaCost.matchAll(/\{([^}]+)\}/g)).map((match) => (match[1] ?? "").toUpperCase());
}

function coloredPipsFromCost(manaCost = ""): Partial<Record<ManaColor, number>> {
  const pips: Partial<Record<ManaColor, number>> = {};
  for (const symbol of manaSymbols(manaCost)) {
    for (const color of ["W", "U", "B", "R", "G"] as ManaColor[]) {
      if (symbol.includes(color)) {
        pips[color] = (pips[color] ?? 0) + 1;
        break;
      }
    }
  }
  return pips;
}

function genericCostFromManaCost(manaCost: string | undefined, manaValue: number) {
  const symbols = manaSymbols(manaCost);
  if (!symbols.length) {
    return Math.max(0, Math.ceil(manaValue));
  }
  let generic = 0;
  for (const symbol of symbols) {
    if (/^\d+$/.test(symbol)) {
      generic += Number(symbol);
    } else if (symbol === "X") {
      generic += 0;
    }
  }
  return generic;
}

function manaValueFromManaCost(manaCost = "") {
  return manaSymbols(manaCost).reduce((total, symbol) => {
    if (/^\d+$/.test(symbol)) {
      return total + Number(symbol);
    }
    if (symbol === "X") {
      return total;
    }
    return total + 1;
  }, 0);
}

function costReductionAmount(text: string) {
  const symbolMatch = text.match(/costs?\s+\{(\d+)\}\s+less/);
  if (symbolMatch) {
    return Number(symbolMatch[1] ?? 0);
  }
  const wordMatch = text.match(/costs?\s+(one|two|three|four|five|a|an|\d+)\s+less/);
  if (!wordMatch) {
    return 0;
  }
  const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
  const raw = (wordMatch[1] ?? "").toLowerCase();
  return /^\d+$/.test(raw) ? Number(raw) : words[raw] ?? 0;
}

function costReductionProfile(card: AnalysisCardInput): CostReductionProfile | undefined {
  if (card.isLand) {
    return undefined;
  }
  const text = allText(card);
  const amount = costReductionAmount(text);
  if (!amount) {
    return undefined;
  }
  if (/\bthis spell costs?\b/.test(text)) {
    return { amount, scope: "self", activeAfterCast: false };
  }
  if (/\binstant and sorcery spells? you cast costs?\b|\binstant or sorcery spells? you cast costs?\b/.test(text)) {
    return { amount, scope: "instant_sorcery", activeAfterCast: true };
  }
  if (/\bcreature spells? you cast costs?\b/.test(text)) {
    return { amount, scope: "creature", activeAfterCast: true };
  }
  if (/\bartifact spells? you cast costs?\b/.test(text)) {
    return { amount, scope: "artifact", activeAfterCast: true };
  }
  if (/\bnoncreature spells? you cast costs?\b/.test(text)) {
    return { amount, scope: "noncreature", activeAfterCast: true };
  }
  if (/\bspells? you cast costs?\b/.test(text)) {
    return { amount, scope: "all", activeAfterCast: true };
  }
  return undefined;
}

function costReductionApplies(reducer: CostReductionProfile, spell: AnalysisCard) {
  if (spell.isLand) {
    return false;
  }
  if (reducer.scope === "self") {
    return false;
  }
  if (reducer.scope === "all") {
    return true;
  }
  if (reducer.scope === "instant_sorcery") {
    return spell.types.includes("instant") || spell.types.includes("sorcery");
  }
  if (reducer.scope === "creature") {
    return spell.types.includes("creature");
  }
  if (reducer.scope === "artifact") {
    return spell.types.includes("artifact");
  }
  if (reducer.scope === "noncreature") {
    return !spell.types.includes("creature");
  }
  return false;
}

function genericReductionForSpell(spell: AnalysisCard, activeReducers: CostReductionProfile[] = []) {
  const selfReduction = spell.costReduction?.scope === "self" ? spell.costReduction.amount : 0;
  const activeReduction = activeReducers.reduce(
    (total, reducer) => total + (costReductionApplies(reducer, spell) ? reducer.amount : 0),
    0
  );
  return Math.min(genericCostFromManaCost(spell.manaCost, spell.manaValue), selfReduction + activeReduction);
}

function manaRequirements(manaCost: string | undefined, manaValue: number) {
  const requiredPips: Array<{ colors: ManaColor[]; genericAlternative?: number }> = [];
  const approximationNotes = new Set<string>();
  let generic = 0;

  for (const symbol of manaSymbols(manaCost)) {
    if (/^\d+$/.test(symbol)) {
      generic += Number(symbol);
      continue;
    }
    if (symbol === "X") {
      approximationNotes.add("X was evaluated as zero for opening-hand castability.");
      continue;
    }
    if (symbol === "C") {
      requiredPips.push({ colors: ["C"] });
      continue;
    }
    if (symbol === "S") {
      approximationNotes.add("Snow mana was approximated as colorless-capable mana.");
      requiredPips.push({ colors: ["C"] });
      continue;
    }
    if (symbol.includes("/")) {
      const parts = symbol.split("/");
      const phyrexian = parts.includes("P");
      const hybridColors = parts.filter((part): part is ManaColor =>
        (["W", "U", "B", "R", "G", "C"] as string[]).includes(part)
      );
      const numericHybrid = parts.find((part) => /^\d+$/.test(part));
      if (phyrexian) {
        approximationNotes.add("Phyrexian mana may be paid with life; mana payment is conservative.");
      }
      if (hybridColors.length && numericHybrid) {
        requiredPips.push({ colors: Array.from(new Set(hybridColors)), genericAlternative: Number(numericHybrid) });
      } else if (hybridColors.length) {
        requiredPips.push({ colors: Array.from(new Set(hybridColors)) });
      } else if (numericHybrid) {
        generic += Number(numericHybrid);
      }
      continue;
    }
    const color = symbol.match(/[WUBRGC]/)?.[0] as ManaColor | undefined;
    if (color) {
      requiredPips.push({ colors: [color] });
      continue;
    }
    approximationNotes.add(`Unsupported mana symbol {${symbol}} was approximated using mana value.`);
  }

  if (!manaCost || !manaSymbols(manaCost).length) {
    generic = Math.max(0, Math.ceil(manaValue));
  }

  return { requiredPips, generic, approximationNotes: Array.from(approximationNotes) };
}

export function solveManaPayment(
  manaCost: string | undefined,
  manaValue: number,
  sources: ManaPaymentSource[],
  options: ManaPaymentOptions = {}
): ManaPaymentResult {
  const { requiredPips, generic, approximationNotes } = manaRequirements(manaCost, manaValue);
  const baseGeneric = Math.max(0, generic - Math.max(0, Math.floor(options.genericReduction ?? 0)));
  const indexed = sources.map((source, index) => ({ source, index }));
  const orderedPips = [...requiredPips].sort(
    (a, b) =>
      indexed.filter(({ source }) => a.colors.some((color) => source.colors.includes(color))).length -
      indexed.filter(({ source }) => b.colors.some((color) => source.colors.includes(color))).length
  );

  const assignRequired = (
    pipIndex: number,
    spent: Set<number>,
    extraGeneric: number
  ): { spent: Set<number>; extraGeneric: number } | null => {
    if (pipIndex >= orderedPips.length) {
      return { spent, extraGeneric };
    }
    const pip = orderedPips[pipIndex];
    if (!pip) {
      return { spent, extraGeneric };
    }
    for (const { source, index } of indexed) {
      if (spent.has(index) || !pip.colors.some((color) => source.colors.includes(color))) {
        continue;
      }
      const nextSpent = new Set(spent);
      nextSpent.add(index);
      const result = assignRequired(pipIndex + 1, nextSpent, extraGeneric);
      if (result) {
        return result;
      }
    }
    if (pip.genericAlternative !== undefined) {
      const genericResult = assignRequired(pipIndex + 1, new Set(spent), extraGeneric + pip.genericAlternative);
      if (genericResult) {
        return genericResult;
      }
    }
    return null;
  };

  const requiredResult = assignRequired(0, new Set(), 0);
  if (!requiredResult) {
    return {
      canPay: false,
      spentSourceIndexes: [],
      remainingSourceIndexes: sources.map((_, index) => index),
      approximationNotes
    };
  }

  const requiredSpent = requiredResult.spent;
  const adjustedGeneric = baseGeneric + requiredResult.extraGeneric;
  const remainingAfterRequired = sources
    .map((_, index) => index)
    .filter((index) => !requiredSpent.has(index));
  if (remainingAfterRequired.length < adjustedGeneric) {
    return {
      canPay: false,
      spentSourceIndexes: Array.from(requiredSpent),
      remainingSourceIndexes: remainingAfterRequired,
      approximationNotes
    };
  }

  const spentSourceIndexes = [...Array.from(requiredSpent), ...remainingAfterRequired.slice(0, adjustedGeneric)];
  return {
    canPay: true,
    spentSourceIndexes,
    remainingSourceIndexes: sources.map((_, index) => index).filter((index) => !spentSourceIndexes.includes(index)),
    approximationNotes
  };
}

function sourceOptions(card: AnalysisCardInput): ManaProductionOption[] {
  if (!card.isLand) {
    return [];
  }
  const text = allText(card);
  const produced = card.producedMana?.length
    ? card.producedMana.map((color) => color.toUpperCase() as ManaColor)
    : [...basicLandColors(card.name), ...colorsFromText(text)];
  const colors = Array.from(new Set<ManaColor>(produced.length ? produced : ["C"]));
  return [{ colors, availableTurn: 0 }];
}

function entersTapped(card: AnalysisCardInput): boolean | "conditional" {
  const text = allText(card);
  if (text.includes("enters tapped unless") || text.includes("enters the battlefield tapped unless")) {
    return "conditional";
  }
  return text.includes("enters tapped") || text.includes("enters the battlefield tapped");
}

function rampProfile(card: AnalysisCardInput): RampProfile | undefined {
  if (card.isLand) {
    return undefined;
  }
  const text = allText(card);
  const typeLine = card.typeLine.toLowerCase();
  if (text.includes("treasure token")) {
    return { kind: "treasure", earliestTurn: Math.max(1, Math.ceil(card.manaValue)), manaDelta: 1 };
  }
  if (text.includes("add") && (typeLine.includes("creature") || typeLine.includes("artifact"))) {
    return { kind: "permanent", earliestTurn: Math.max(1, Math.ceil(card.manaValue)), manaDelta: 1 };
  }
  if (text.includes("search your library") && text.includes("land") && text.includes("battlefield")) {
    return { kind: "land_ramp", earliestTurn: Math.max(1, Math.ceil(card.manaValue)), manaDelta: 1 };
  }
  if (text.includes("add") && /\{[WUBRGC]\}|\bone mana\b|\btwo mana\b|three mana/i.test(text)) {
    return { kind: "ritual", earliestTurn: Math.max(1, Math.ceil(card.manaValue)), manaDelta: 1 };
  }
  if (text.includes("cost") && (text.includes("less to cast") || text.includes("costs less"))) {
    return { kind: "cost_reducer", earliestTurn: Math.max(1, Math.ceil(card.manaValue)), manaDelta: 1 };
  }
  return undefined;
}

function inferRoles(card: AnalysisCardInput, types: string[], manaValue: number): CardRole[] {
  if (card.isLand) {
    return ["land"];
  }
  const text = allText(card);
  const roles = new Set<CardRole>();
  if (manaValue <= 2) roles.add("early_action");
  if (types.includes("creature") || types.includes("planeswalker") || types.includes("battle")) roles.add("threat");
  if (/\bdestroy\b|\bexile\b|\bcounter target\b|\bdamage to any target\b|\bfight\b|\bdiscard/.test(text)) roles.add("interaction");
  if (/\bdraw (a|two|three|\d)\b|draw cards|look at the top|scry|surveil/.test(text)) roles.add("selection");
  if (/\bdraw two\b|\bdraw three\b|return.*from your graveyard|create two|create a token/.test(text)) roles.add("card_advantage");
  if (rampProfile(card)) roles.add("ramp");
  if (text.includes("search your library") && !text.includes("basic land")) roles.add("tutor");
  if (/\bindestructible\b|\bhexproof\b|\bprotection\b|\bward\b/.test(text)) roles.add("protection");
  if (/\bcombo\b|\bcopy\b|\bwhenever you cast\b|\bwhenever you draw\b|\bsacrifice\b/.test(text)) roles.add("combo_enabler");
  if (manaValue >= 5) roles.add("finisher");
  if (!roles.size) roles.add("utility");
  return Array.from(roles);
}

function cheapestCastableFace(input: AnalysisCardInput) {
  const faces = (input.faces ?? []).filter((face) => !face.typeLine.toLowerCase().includes("land") && face.manaCost);
  if (!faces.length) {
    return null;
  }
  return [...faces].sort((a, b) => manaValueFromManaCost(a.manaCost) - manaValueFromManaCost(b.manaCost))[0] ?? null;
}

function normalizeAnalysisCard(name: string, quantity: number, input?: AnalysisCardInput): AnalysisCard {
  const fallback: AnalysisCardInput = input ?? {
    name,
    manaValue: 2,
    typeLine: "",
    oracleText: "",
    colors: [],
    producedMana: [],
    isLand: false
  };
  const { types, subtypes } = splitTypeLine(fallback.typeLine);
  const splitFace = fallback.manaCost?.includes("//") ? cheapestCastableFace(fallback) : null;
  const defaultFace = fallback.faces?.find((face) => !face.typeLine.toLowerCase().includes("land"));
  const manaCost = splitFace?.manaCost || fallback.manaCost || defaultFace?.manaCost || "";
  const fallbackManaValue = fallback.manaValue || defaultFace?.manaValue || 0;
  const manaValue = fallback.isLand || types.includes("land") ? 0 : Math.max(0, splitFace?.manaValue ?? fallbackManaValue);
  const roles = inferRoles(fallback, types, manaValue);
  const costReduction = costReductionProfile(fallback);
  const conditionality = /if you|unless|as long as|only if|additional cost/i.test(allText(fallback))
    ? { reason: "conditional text", severity: 0.12 }
    : undefined;
  return {
    id: normalizeName(fallback.name || name),
    name: fallback.name || name,
    quantity,
    manaValue,
    manaCost,
    coloredPips: coloredPipsFromCost(manaCost),
    types,
    subtypes,
    isLand: fallback.isLand || types.includes("land"),
    isSpell: !(fallback.isLand || types.includes("land")),
    entersTapped: entersTapped(fallback),
    produces: sourceOptions(fallback),
    roles,
    ramp: rampProfile(fallback),
    costReduction,
    conditionality,
    earliestUsefulTurn: roles.includes("interaction") ? 2 : manaValue <= 1 ? 1 : Math.max(1, Math.min(5, Math.ceil(manaValue))),
    latestPreferredTurn: roles.includes("early_action") ? 2 : roles.includes("interaction") ? 3 : Math.max(3, Math.min(5, Math.ceil(manaValue) + 1)),
    openingHandPriority: roles.includes("early_action") ? 0.85 : roles.includes("interaction") ? 0.7 : roles.includes("ramp") ? 0.72 : 0.55,
    duplicateTolerance: roles.includes("land") ? 0.95 : roles.includes("selection") ? 0.75 : roles.includes("finisher") ? 0.35 : 0.6,
    synergyTags: roles.filter((role) => ["ramp", "combo_enabler", "combo_payoff", "selection"].includes(role)),
    dependencyTags: roles.includes("finisher") ? ["mana"] : roles.includes("combo_payoff") ? ["combo_enabler"] : []
  };
}

function expandDeck(mainCounts: Map<string, number>, cardData: ReadonlyMap<string, AnalysisCardInput>) {
  const cards: SimCard[] = [];
  for (const [name, qty] of Array.from(mainCounts.entries())) {
    const card = normalizeAnalysisCard(name, qty, cardData.get(normalizeName(name)));
    for (let copy = 0; copy < qty; copy += 1) {
      cards.push({ ...card, copyId: `${card.id}-${copy}` });
    }
  }
  return cards;
}

function removeHandFromLibrary(deck: SimCard[], handNames: string[]) {
  const remaining = [...deck];
  const hand: SimCard[] = [];
  for (const handName of handNames) {
    const index = remaining.findIndex((card) => normalizeName(card.name) === normalizeName(handName));
    if (index >= 0) {
      hand.push(remaining[index]);
      remaining.splice(index, 1);
      continue;
    }
    hand.push({ ...normalizeAnalysisCard(handName, 1), copyId: `external-${normalizeName(handName)}-${hand.length}` });
  }
  return { hand, library: remaining };
}

function canPayAnalysis(
  card: AnalysisCard,
  sources: SimSource[],
  manaBudget = sources.length,
  activeReducers: CostReductionProfile[] = []
) {
  if (card.isLand) {
    return false;
  }
  return solveManaPayment(card.manaCost, card.manaValue, sources.slice(0, manaBudget), {
    genericReduction: genericReductionForSpell(card, activeReducers)
  }).canPay;
}

function payForSpell(card: AnalysisCard, sources: SimSource[], activeReducers: CostReductionProfile[] = []) {
  return solveManaPayment(card.manaCost, card.manaValue, sources, {
    genericReduction: genericReductionForSpell(card, activeReducers)
  });
}

function chooseLandForLine(lands: SimCard[], sources: SimSource[], turn: number, spells: SimCard[]) {
  let best = lands[0] ?? null;
  let bestScore = -Infinity;
  for (const land of lands) {
    const source = land.produces[0];
    const colors = source?.colors.length ? source.colors : (["C"] as ManaColor[]);
    const availableTurn = land.entersTapped === true ? turn + 1 : turn;
    const futureSources = [...sources, { name: land.name, colors, availableTurn }];
    const castableSoon = spells.filter((spell) =>
      canPayAnalysis(spell, futureSources.filter((item) => item.availableTurn <= Math.min(5, turn + 1)))
    ).length;
    const colorCoverage = new Set(futureSources.flatMap((item) => item.colors)).size;
    const untapped = availableTurn <= turn ? 4 : land.entersTapped === "conditional" ? 1 : 0;
    const score = castableSoon * 7 + colorCoverage * 3 + untapped + colors.length;
    if (score > bestScore) {
      best = land;
      bestScore = score;
    }
  }
  return best;
}

function deckProfileTargets(deck: SimCard[], explicitProfile?: string) {
  const spells = deck.filter((card) => card.isSpell);
  const avgMv = spells.length ? spells.reduce((total, card) => total + card.manaValue, 0) / spells.length : 0;
  const rampCount = spells.filter((card) => card.roles.includes("ramp")).length;
  const interactionCount = spells.filter((card) => card.roles.includes("interaction")).length;
  const earlyCount = spells.filter((card) => card.manaValue <= 2).length;
  const profile =
    explicitProfile ||
    (avgMv <= 2.25 && earlyCount / Math.max(1, spells.length) > 0.5
      ? "Low-curve pressure"
      : rampCount >= 6 || avgMv >= 3
        ? "Ramp or big-mana curve"
        : interactionCount >= 8 && avgMv >= 2.5
          ? "Control/value curve"
          : "Midrange curve");
  const roleTargets: Partial<Record<CardRole, number>> = {
    early_action: profile === "Low-curve pressure" ? 2.2 : profile === "Ramp or big-mana curve" ? 1 : 1.4,
    threat: profile === "Control/value curve" ? 0.8 : 1.4,
    interaction: profile === "Low-curve pressure" ? 0.7 : profile === "Ramp or big-mana curve" ? 0.5 : 1.1,
    selection: profile === "Control/value curve" ? 0.9 : 0.55,
    ramp: profile === "Ramp or big-mana curve" ? 1.25 : 0.35,
    card_advantage: profile === "Control/value curve" ? 0.9 : 0.45,
    finisher: profile === "Ramp or big-mana curve" ? 0.8 : 0.3
  };
  return { profile, avgMv, roleTargets };
}

function roleValue(role: CardRole, profile: string) {
  const base: Partial<Record<CardRole, number>> = {
    early_action: profile === "Low-curve pressure" ? 1.15 : 0.85,
    threat: profile === "Control/value curve" ? 0.75 : 0.95,
    interaction: profile === "Ramp or big-mana curve" ? 0.7 : 1,
    selection: 0.78,
    ramp: profile === "Ramp or big-mana curve" ? 1.1 : 0.68,
    card_advantage: profile === "Control/value curve" ? 1 : 0.7,
    combo_enabler: profile.toLowerCase().includes("combo") ? 1.15 : 0.65,
    combo_payoff: profile.toLowerCase().includes("combo") ? 1 : 0.45,
    finisher: profile === "Ramp or big-mana curve" ? 0.95 : 0.45,
    utility: 0.5
  };
  return base[role] ?? 0.55;
}

function evaluateDrawLine(openingHand: SimCard[], drawnCards: SimCard[], deck: SimCard[], playDraw: "play" | "draw", horizon: number, explicitProfile?: string) {
  const { profile, avgMv, roleTargets } = deckProfileTargets(deck, explicitProfile);
  const hand = [...openingHand];
  const sources: SimSource[] = [];
  const activeCostReducers: CostReductionProfile[] = [];
  const castCards = new Set<string>();
  const roleCoverage: Partial<Record<CardRole, number>> = {};
  const landDrops: number[] = [];
  const colorTurnAvailable: Partial<Record<ManaColor, number>> = {};
  const manaSpentByTurn: number[] = [];
  const manaCapacityByTurn: number[] = [];
  let drawIndex = 0;
  let catastrophic = false;

  for (let turn = 1; turn <= horizon; turn += 1) {
    const naturalDraws = turn === 1 && playDraw === "play" ? 0 : 1;
    for (let draw = 0; draw < naturalDraws && drawIndex < drawnCards.length; draw += 1) {
      hand.push(drawnCards[drawIndex]);
      drawIndex += 1;
    }

    const lands = hand.filter((card) => card.isLand);
    const spells = hand.filter((card) => card.isSpell && !castCards.has(card.copyId));
    const land = chooseLandForLine(lands, sources, turn, spells);
    if (land) {
      const option = land.produces[0];
      const colors = option?.colors.length ? option.colors : (["C"] as ManaColor[]);
      const availableTurn = land.entersTapped === true ? turn + 1 : turn;
      sources.push({ name: land.name, colors, availableTurn });
      for (const color of colors) {
        colorTurnAvailable[color] = Math.min(colorTurnAvailable[color] ?? 99, availableTurn);
      }
      hand.splice(hand.findIndex((card) => card.copyId === land.copyId), 1);
    }
    landDrops.push(sources.length);

    let availableSources = sources.filter((source) => source.availableTurn <= turn);
    let manaBudget = availableSources.length;
    let spent = 0;

    const castOrder = spells
      .filter((card) => !castCards.has(card.copyId))
      .sort((a, b) => {
        const roleA = Math.max(...a.roles.map((role) => roleValue(role, profile)));
        const roleB = Math.max(...b.roles.map((role) => roleValue(role, profile)));
        return roleB - roleA || a.manaValue - b.manaValue;
      });

    for (const spell of castOrder) {
      const payment = payForSpell(spell, availableSources, activeCostReducers);
      if (!payment.canPay) {
        continue;
      }
      const tooEarly = turn + 1 < (spell.earliestUsefulTurn ?? 1) && !spell.roles.includes("ramp");
      if (tooEarly) {
        continue;
      }
      castCards.add(spell.copyId);
      spent += payment.spentSourceIndexes.length;
      availableSources = payment.remainingSourceIndexes.map((index) => availableSources[index]).filter(Boolean);
      manaBudget = availableSources.length;
      for (const role of spell.roles) {
        roleCoverage[role] = (roleCoverage[role] ?? 0) + 1;
      }
      if (spell.ramp && spell.ramp.kind !== "ritual" && spell.ramp.kind !== "cost_reducer") {
        const colors = spell.roles.includes("ramp") ? (["C"] as ManaColor[]) : (["C"] as ManaColor[]);
        sources.push({ name: spell.name, colors, availableTurn: turn + 1 });
      }
      if (spell.costReduction?.activeAfterCast) {
        activeCostReducers.push(spell.costReduction);
      }
    }
    manaSpentByTurn.push(spent);
    manaCapacityByTurn.push(availableSources.length);
  }

  const spellsInOpening = openingHand.filter((card) => card.isSpell);
  const landsInOpening = openingHand.filter((card) => card.isLand).length;
  const castableOpening = spellsInOpening.filter((spell) => castCards.has(spell.copyId));
  const earlyCastable = spellsInOpening.filter((spell) => (spell.latestPreferredTurn ?? 5) <= 3 && castCards.has(spell.copyId)).length;
  const stranded = spellsInOpening.filter((spell) => !castCards.has(spell.copyId));
  const relevantManaNeed = profile === "Low-curve pressure" ? 2 : profile === "Ramp or big-mana curve" || avgMv >= 3 ? 4 : 3;

  const development = clamp(
    (Math.min(landDrops[1] ?? 0, 2) / 2) * 0.3 +
      (Math.min(landDrops[2] ?? 0, 3) / 3) * 0.35 +
      (Math.min(landDrops[4] ?? 0, relevantManaNeed) / relevantManaNeed) * 0.35 -
      (landsInOpening >= 5 && profile === "Low-curve pressure" ? 0.25 : 0),
    0,
    1
  );

  const colorAccess = spellsInOpening.length
    ? clamp(
        spellsInOpening.reduce((total, spell) => {
          const preferredTurn = spell.latestPreferredTurn ?? Math.min(5, Math.ceil(spell.manaValue) + 1);
          const pips = Object.entries(spell.coloredPips) as Array<[ManaColor, number]>;
          if (!pips.length) return total + 1;
          const satisfied = pips.every(([color]) => (colorTurnAvailable[color] ?? 99) <= preferredTurn);
          const earlyWeight = preferredTurn <= 2 ? 1.25 : preferredTurn <= 3 ? 1 : 0.75;
          return total + (satisfied ? 1 : 0) * earlyWeight;
        }, 0) / spellsInOpening.reduce((total, spell) => total + ((spell.latestPreferredTurn ?? 5) <= 2 ? 1.25 : 1), 0),
        0,
        1
      )
    : 0.35;

  const utilization = clamp(
    manaCapacityByTurn.reduce((total, capacity, index) => {
      if (!capacity) return total;
      const turnWeight = index < 2 ? 1.15 : 1;
      return total + Math.min(1, (manaSpentByTurn[index] ?? 0) / capacity) * turnWeight;
    }, 0) / Math.max(1, manaCapacityByTurn.reduce((total, capacity, index) => total + (capacity ? (index < 2 ? 1.15 : 1) : 0), 0)),
    0,
    1
  );

  const timelyAction = clamp(
    (earlyCastable / Math.max(1, spellsInOpening.filter((spell) => (spell.latestPreferredTurn ?? 5) <= 3).length)) * 0.7 +
      (castableOpening.length / Math.max(1, spellsInOpening.length)) * 0.3,
    0,
    1
  );

  const roleScore = clamp(
    Object.entries(roleTargets).reduce((total, [role, target]) => {
      const coverage = roleCoverage[role as CardRole] ?? 0;
      return total + Math.min(1, coverage / Math.max(0.5, target ?? 1));
    }, 0) / Math.max(1, Object.keys(roleTargets).length),
    0,
    1
  );

  const hasRamp = spellsInOpening.some((card) => card.roles.includes("ramp") && castCards.has(card.copyId));
  const hasPayoff = spellsInOpening.some((card) => card.manaValue >= 4 || card.roles.includes("finisher"));
  const hasSelection = spellsInOpening.some((card) => card.roles.includes("selection") && castCards.has(card.copyId));
  const hasEarlyAction = spellsInOpening.some((card) => card.roles.includes("early_action") && castCards.has(card.copyId));
  const duplicatePenalty = Array.from(
    spellsInOpening.reduce((counts, card) => counts.set(card.id, (counts.get(card.id) ?? 0) + 1), new Map<string, number>())
  ).reduce((total, [id, count]) => {
    if (count <= 1) return total;
    const card = spellsInOpening.find((item) => item.id === id);
    const tolerance = card?.duplicateTolerance ?? 0.6;
    return total + Math.max(0, count - 1) * (1 - tolerance) * 0.08;
  }, 0);
  const synergy = clamp(
    0.45 +
      (hasRamp && hasPayoff ? 0.22 : hasRamp && !hasPayoff ? -0.12 : 0) +
      (hasSelection && landsInOpening <= 2 ? 0.08 : 0) +
      (hasEarlyAction ? 0.08 : 0) -
      duplicatePenalty,
    0,
    1
  );

  const strandedPenalty = clamp(
    stranded.reduce((total, card) => total + (card.manaValue >= 4 ? 1.25 : 1), 0) / Math.max(1, spellsInOpening.length + 1),
    0,
    1
  );

  const noSecondLandByTurn2 = (landDrops[1] ?? 0) < 2;
  const noMeaningfulSpellByTurn3 = castableOpening.filter((card) => !card.roles.includes("ramp")).length === 0;
  const offColorImportantSpell = spellsInOpening.some((spell) => spell.manaValue <= 3 && !castCards.has(spell.copyId) && Object.keys(spell.coloredPips).length);
  const oneLandExpensive = landsInOpening <= 1 && spellsInOpening.filter((spell) => spell.manaValue >= 3).length >= 2;
  const floodNoAction = landsInOpening >= 5 && spellsInOpening.length <= 2;
  catastrophic = noSecondLandByTurn2 || noMeaningfulSpellByTurn3 || oneLandExpensive || floodNoAction || offColorImportantSpell;
  const catastrophicPenalty = catastrophic ? 1 : 0;
  const cardDisadvantagePenalty = Math.max(0, 7 - Math.min(7, openingHand.length)) * 0.08;

  const weights =
    profile === "Low-curve pressure"
      ? { ...HAND_SCORING_CONFIG.weights, timelyAction: 0.22, manaUtilization: 0.22, roleCoverage: 0.08, development: 0.2 }
      : profile === "Ramp or big-mana curve"
        ? { ...HAND_SCORING_CONFIG.weights, development: 0.26, synergy: 0.15, manaUtilization: 0.16 }
        : HAND_SCORING_CONFIG.weights;

  const raw =
    weights.development * development +
    weights.colorAccess * colorAccess +
    weights.manaUtilization * utilization +
    weights.timelyAction * timelyAction +
    weights.roleCoverage * roleScore +
    weights.synergy * synergy -
    weights.strandedCardPenalty * strandedPenalty -
    weights.catastrophicSequencePenalty * catastrophicPenalty -
    cardDisadvantagePenalty;

  return {
    utility: clamp(raw, 0, 1),
    catastrophic,
    components: { development, colorAccess, utilization, timelyAction, roleScore, synergy, strandedPenalty }
  };
}

function evaluateHandUtility(
  deck: SimCard[],
  handNames: string[],
  playDraw: "play" | "draw",
  settings: HandScoringSettings,
  seedText: string,
  profileLabel?: string
): HandUtilityResult {
  const { hand, library } = removeHandFromLibrary(deck, handNames);
  const utilities: number[] = [];
  let catastrophicCount = 0;
  for (let sample = 0; sample < settings.handSimulations; sample += 1) {
    const random = mulberry32(stableHash(`${seedText}:line:${sample}`));
    const drawnCards = shuffle(library, random).slice(0, settings.analysisHorizon + 5);
    const line = evaluateDrawLine(hand, drawnCards, deck, playDraw, settings.analysisHorizon, profileLabel);
    utilities.push(line.utility);
    if (line.catastrophic) {
      catastrophicCount += 1;
    }
  }
  utilities.sort((a, b) => a - b);
  const meanUtility = utilities.reduce((total, value) => total + value, 0) / Math.max(1, utilities.length);
  const medianUtility = sortedQuantile(utilities, 0.5);
  const lowerTailUtility = sortedQuantile(utilities, HAND_SCORING_CONFIG.riskAdjustment.lowerTailPercentile);
  const variance =
    utilities.reduce((total, value) => total + (value - meanUtility) ** 2, 0) / Math.max(1, utilities.length);
  const riskAdjustedUtility =
    HAND_SCORING_CONFIG.riskAdjustment.mean * meanUtility +
    HAND_SCORING_CONFIG.riskAdjustment.lowerTail * lowerTailUtility;
  return {
    meanUtility,
    medianUtility,
    lowerTailUtility,
    standardDeviation: Math.sqrt(variance),
    catastrophicFailureRate: catastrophicCount / Math.max(1, utilities.length),
    riskAdjustedUtility
  };
}

function baselineKey(deck: SimCard[], playDraw: "play" | "draw", settings: HandScoringSettings, profileLabel?: string) {
  const deckText = deck
    .map((card) => `${card.name}:${card.manaCost}:${card.manaValue}:${card.types.join(",")}:${card.produces.map((source) => source.colors.join("")).join("/")}`)
    .sort()
    .join("|");
  return `${HAND_SCORING_VERSION}|${playDraw}|${profileLabel ?? ""}|${settings.analysisHorizon}|${settings.baselineHands}|${settings.handSimulations}|${stableHash(deckText)}`;
}

function sampleOpeningHand(deck: SimCard[], random: () => number, handSize = 7) {
  return shuffle(deck, random)
    .slice(0, handSize)
    .map((card) => card.name);
}

function baselineDistribution(deck: SimCard[], playDraw: "play" | "draw", settings: HandScoringSettings, profileLabel?: string) {
  const key = baselineKey(deck, playDraw, settings, profileLabel);
  const cached = BASELINE_CACHE.get(key);
  if (cached) {
    return cached;
  }
  const values: number[] = [];
  for (let sample = 0; sample < settings.baselineHands; sample += 1) {
    const random = mulberry32(stableHash(`${key}:baseline:${sample}`));
    const handNames = sampleOpeningHand(deck, random);
    const utility = evaluateHandUtility(deck, handNames, playDraw, settings, `${key}:utility:${sample}`, profileLabel);
    values.push(utility.riskAdjustedUtility);
  }
  values.sort((a, b) => a - b);
  BASELINE_CACHE.set(key, values);
  return values;
}

function optimizeBottomForSix(hand: string[], deck: SimCard[], playDraw: "play" | "draw", settings: HandScoringSettings, seed: string, profileLabel?: string) {
  let best = 0;
  for (let index = 0; index < hand.length; index += 1) {
    const six = hand.filter((_, cardIndex) => cardIndex !== index);
    const utility = evaluateHandUtility(deck, six, playDraw, { ...settings, handSimulations: Math.max(24, Math.floor(settings.handSimulations / 3)) }, `${seed}:bottom:${index}`, profileLabel);
    best = Math.max(best, utility.riskAdjustedUtility);
  }
  return best;
}

function mulliganExpectedValue(
  deck: SimCard[],
  playDraw: "play" | "draw",
  settings: HandScoringSettings,
  seed: string,
  profileLabel?: string,
  freeMulligan = false
) {
  const values: number[] = [];
  const reducedSettings = {
    ...settings,
    handSimulations: Math.max(20, Math.floor(settings.handSimulations / 4))
  };
  for (let sample = 0; sample < settings.mulliganHands; sample += 1) {
    const random = mulberry32(stableHash(`${seed}:mull:${sample}`));
    const seven = sampleOpeningHand(deck, random);
    if (freeMulligan) {
      values.push(
        evaluateHandUtility(deck, seven, playDraw, reducedSettings, `${seed}:free-seven:${sample}`, profileLabel)
          .riskAdjustedUtility
      );
    } else {
      values.push(optimizeBottomForSix(seven, deck, playDraw, reducedSettings, `${seed}:mull:${sample}`, profileLabel));
    }
  }
  return values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
}

export function recommendationFromEv(score: number, keepEv: number, mulliganEv: number | undefined, catastrophicRate: number): KeepRecommendation {
  if (mulliganEv !== undefined) {
    const edge = keepEv - mulliganEv;
    if (edge >= 0.08 && score >= 78 && catastrophicRate < 0.35) return "strong_keep";
    if (edge >= 0.018 && score >= 60 && catastrophicRate < 0.55) return "keep";
    if (edge > -0.018 && score >= 45) return "borderline";
    if (edge > -0.08) return "mulligan";
    return "strong_mulligan";
  }
  if (catastrophicRate >= 0.7 || score <= 25) return "strong_mulligan";
  if (score < 42) return "mulligan";
  if (score < 62) return "borderline";
  if (score < 82) return "keep";
  return "strong_keep";
}

export function scoreHandDeckRelative(input: DeckRelativeScoreInput): DeckRelativeScoreResult {
  const settings = { ...HAND_SCORING_CONFIG.defaultSettings, ...input.settings };
  const deck = expandDeck(input.mainCounts, input.cardData);
  if (deck.length < 7 || input.handNames.length === 0) {
    return {
      score: 1,
      percentile: 0,
      keepRecommendation: "strong_mulligan",
      keepExpectedValue: 0,
      confidence: 0,
      utility: {
        meanUtility: 0,
        medianUtility: 0,
        lowerTailUtility: 0,
        standardDeviation: 0,
        catastrophicFailureRate: 1,
        riskAdjustedUtility: 0
      },
      factors: [],
      warnings: ["Deck-relative scoring needs a valid deck and hand."],
      scoringVersion: HAND_SCORING_VERSION
    };
  }
  const deckKey = Array.from(input.mainCounts.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, qty]) => `${qty} ${name}`)
    .join("\n");
  const seed = input.seed ?? `${HAND_SCORING_VERSION}:${input.playDraw}:${input.profileLabel ?? ""}:${deckKey}:${input.handNames.join("|")}`;
  const observed = evaluateHandUtility(deck, input.handNames, input.playDraw, settings, `${seed}:observed`, input.profileLabel);
  const baseline = baselineDistribution(deck, input.playDraw, settings, input.profileLabel);
  const below = baseline.filter((value) => value < observed.riskAdjustedUtility).length;
  const percentile = clamp((below + 0.5) / (baseline.length + 1), 0, 1);
  const score = clamp(Math.round(1 + 99 * percentile), 1, 100);
  const mulliganEv = mulliganExpectedValue(deck, input.playDraw, settings, seed, input.profileLabel, input.freeMulligan);
  const keepAdvantage = observed.riskAdjustedUtility - mulliganEv;
  const keepRecommendation = recommendationFromEv(score, observed.riskAdjustedUtility, mulliganEv, observed.catastrophicFailureRate);
  const { hand } = removeHandFromLibrary(deck, input.handNames);
  const line = evaluateDrawLine(hand, [], deck, input.playDraw, settings.analysisHorizon, input.profileLabel);
  const warnings = [
    observed.catastrophicFailureRate >= 0.5
      ? `High fail-state risk: ${Math.round(observed.catastrophicFailureRate * 100)}% of simulated lines hit a severe mana, color, or stranded-card failure.`
      : "",
    line.components.colorAccess < 0.55 ? "Colored mana does not line up with the hand's early requirements." : "",
    line.components.development < 0.5 ? "Mana development is below this deck's expected curve." : "",
    line.components.strandedPenalty > 0.45 ? "A large share of the hand remains stranded through the early turns." : "",
    keepAdvantage < -0.025
      ? input.freeMulligan
        ? "The simulated free mulligan to a fresh seven is better than keeping this hand."
        : "The simulated mulligan-to-six comparison is better than keeping this hand."
      : ""
  ].filter(Boolean);
  const factors: DeckRelativeScoreResult["factors"] = [
    { label: "development", value: line.components.development, tone: line.components.development >= 0.7 ? "good" : line.components.development < 0.45 ? "bad" : "neutral" },
    { label: "color access", value: line.components.colorAccess, tone: line.components.colorAccess >= 0.72 ? "good" : line.components.colorAccess < 0.55 ? "bad" : "neutral" },
    { label: "mana use", value: line.components.utilization, tone: line.components.utilization >= 0.65 ? "good" : line.components.utilization < 0.35 ? "bad" : "neutral" },
    { label: "timely action", value: line.components.timelyAction, tone: line.components.timelyAction >= 0.65 ? "good" : line.components.timelyAction < 0.35 ? "bad" : "neutral" },
    { label: "stranded risk", value: line.components.strandedPenalty, tone: line.components.strandedPenalty > 0.45 ? "bad" : line.components.strandedPenalty < 0.2 ? "good" : "neutral" }
  ];
  return {
    score,
    percentile,
    keepRecommendation,
    keepExpectedValue: observed.riskAdjustedUtility,
    mulliganExpectedValue: mulliganEv,
    keepAdvantage,
    confidence: clamp(1 - observed.standardDeviation, 0.25, 0.95),
    utility: observed,
    factors,
    warnings,
    scoringVersion: HAND_SCORING_VERSION
  };
}

export function castabilityScoreAdjustment(castability: CastabilityScoreRow[]) {
  const spellRows = castability.filter((row) => row.manaValue > 0);
  const earlyRows = spellRows.filter((row) => row.manaValue <= 2);
  if (!spellRows.length) {
    return { adjustment: 0, note: "" };
  }

  const bestTurn3 = Math.max(...spellRows.map((row) => row.turn3));
  const bestEarlyTurn2 = earlyRows.length ? Math.max(...earlyRows.map((row) => row.turn2)) : 1;
  const averageEarlyTurn2 = earlyRows.length
    ? earlyRows.reduce((total, row) => total + row.turn2, 0) / earlyRows.length
    : 1;

  if (bestTurn3 < 0.2) {
    return {
      adjustment: -34,
      note: "Color access is a major issue: the hand is unlikely to cast any spell by turn 3."
    };
  }

  if (earlyRows.length && bestEarlyTurn2 < 0.25) {
    return {
      adjustment: -28,
      note: "The hand has cheap spells, but the current mana cannot cast them reliably."
    };
  }

  if (earlyRows.length && averageEarlyTurn2 < 0.5) {
    return {
      adjustment: -Math.round((0.5 - averageEarlyTurn2) * 32),
      note: "Early spell castability is strained by color access."
    };
  }

  if (bestTurn3 < 0.55) {
    return {
      adjustment: -12,
      note: "The hand may develop slowly because castable spells are not reliable by turn 3."
    };
  }

  return { adjustment: 0, note: "" };
}

export function manaSufficiencyAdjustment(input: ManaSufficiencyInput): ScoreAdjustment {
  const isLowCurve = input.profileLabel === "Low-curve pressure";
  const isManaHungry =
    input.profileLabel === "Ramp or big-mana curve" ||
    input.profileLabel === "Control/value curve" ||
    input.curveTop >= 4 ||
    input.averageManaValue >= 2.8;
  const requiredEarlyMana = isLowCurve ? 2 : isManaHungry ? 3 : 2;
  const hasEnoughRawMana = input.effectiveLandsInHand >= requiredEarlyMana;

  if (input.landsInHand === 0) {
    return {
      adjustment: -45,
      cap: 18,
      note: "No-land hands are not functional without an unusual free-mana plan."
    };
  }

  if (input.landsInHand === 1) {
    if (input.hasCastableRamp && input.turn3LandDrop >= 0.58) {
      return {
        adjustment: isManaHungry ? -28 : -22,
        cap: isManaHungry ? 48 : 54,
        note: "One land plus ramp is still a fragile opener; castable ramp only keeps this from being an automatic mulligan."
      };
    }

    if (isManaHungry || input.turn3LandDrop < 0.45) {
      return {
        adjustment: -38,
        cap: 42,
        note: `This hand is below the deck's mana requirement: one land with ${Math.round(input.turn3LandDrop * 100)}% to make the third land drop by turn 3.`
      };
    }

    return {
      adjustment: -28,
      cap: 52,
      note: "One-land hands need exceptional help; this hand is being capped for mana risk."
    };
  }

  if (input.landsInHand === 2 && input.averageManaValue > 3) {
    if (input.turn4LandDrop < 0.7 || !input.hasCastableRamp) {
      return {
        adjustment: -18,
        cap: 58,
        note: `This deck averages over 3 mana value, so a two-land hand needs strong help; fourth land by turn 4 is ${Math.round(input.turn4LandDrop * 100)}%.`
      };
    }

    return {
      adjustment: -10,
      cap: 66,
      note: "This deck averages over 3 mana value, so a two-land hand is still being taxed even with ramp support."
    };
  }

  if (!hasEnoughRawMana && input.turn3LandDrop < 0.55) {
    return {
      adjustment: -18,
      cap: 58,
      note: `This hand is short of the deck's preferred early mana and only ${Math.round(input.turn3LandDrop * 100)}% to make the third land drop by turn 3.`
    };
  }

  if (isManaHungry && input.effectiveLandsInHand === 2 && !input.hasCastableRamp && input.turn4LandDrop < 0.6) {
    return {
      adjustment: -14,
      cap: 62,
      note: `This curve wants stable fourth-mana development; the fourth land by turn 4 is only ${Math.round(input.turn4LandDrop * 100)}%.`
    };
  }

  if (input.landsInHand === 2 && input.turn2LandDrop < 0.72 && input.turn3LandDrop < 0.62) {
    return {
      adjustment: -8,
      cap: 68,
      note: "The hand has two lands, but follow-up land drops are still below a comfortable range."
    };
  }

  return { adjustment: 0, cap: 100, note: "" };
}
