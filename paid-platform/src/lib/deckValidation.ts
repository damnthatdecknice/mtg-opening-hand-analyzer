import { parseDecklist, type ParsedDeckCard } from "./deckParser";
import { formatLegalities } from "./formats";
import type { ManaCurveCardData } from "./manaCurve";

export type DeckValidationSeverity = "error" | "warning" | "info";

export type DeckValidationIssue = {
  code: string;
  severity: DeckValidationSeverity;
  title: string;
  detail: string;
  cardName?: string;
};

export type DeckValidationResult = {
  expectedMainSize?: number;
  mainCount: number;
  sideboardCount: number;
  isCompleteEnoughForPosture: boolean;
  issues: DeckValidationIssue[];
};

export type AggregatedDeckCard = {
  canonicalName: string;
  normalizedName: string;
  mainCount: number;
  sideboardCount: number;
  totalCount: number;
  sourceRows: ParsedDeckCard[];
};

export type DeckCopyRule =
  | {
      kind: "unlimited";
      source: "basic-land" | "oracle-text";
      explanation: string;
    }
  | {
      kind: "maximum";
      maximum: number;
      source: "format-default" | "singleton" | "restricted" | "oracle-text";
      explanation: string;
    }
  | {
      kind: "unknown";
      explanation: string;
    };

type FormatModel = {
  expectedMainSize?: number;
  minCompleteMainSize?: number;
  maxSideboardSize?: number;
  singleton?: boolean;
  restricted?: boolean;
};

const constructed60: FormatModel = { expectedMainSize: 60, minCompleteMainSize: 54, maxSideboardSize: 15 };

const formatModels: Record<string, FormatModel> = {
  standard: constructed60,
  pioneer: constructed60,
  modern: constructed60,
  legacy: constructed60,
  pauper: constructed60,
  historic: constructed60,
  explorer: constructed60,
  premodern: constructed60,
  "penny dreadful": constructed60,
  vintage: { ...constructed60, restricted: true },
  draft: { expectedMainSize: 40, minCompleteMainSize: 36 },
  commander: { expectedMainSize: 99, minCompleteMainSize: 90, singleton: true, maxSideboardSize: 1 },
  brawl: { expectedMainSize: 59, minCompleteMainSize: 54, singleton: true, maxSideboardSize: 1 }
};

const basicLandNameFallbacks = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes"]);
const modeledRegisteredCopyLimitFormats = new Set([
  "standard",
  "pioneer",
  "modern",
  "legacy",
  "pauper",
  "historic",
  "explorer",
  "premodern",
  "penny dreadful",
  "vintage"
]);

const numberWords = new Map<string, number>([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12]
]);

const copyRuleOverrides: Record<string, DeckCopyRule> = {};

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/[\u2019`]/g, "'");
}

function modelForFormat(format: string) {
  return formatModels[format.trim().toLowerCase()] ?? {};
}

function cardLegality(card: ManaCurveCardData | undefined, format: string) {
  const legalityKey = formatLegalities[format.trim().toLowerCase()];
  return legalityKey && card?.legalities ? card.legalities[legalityKey] : undefined;
}

function addIssue(issues: DeckValidationIssue[], issue: DeckValidationIssue) {
  issues.push(issue);
}

function lookupCard(cardData: Map<string, ManaCurveCardData>, name: string) {
  return cardData.get(normalizeName(name));
}

function buildCardAliases(cardData?: Map<string, ManaCurveCardData>) {
  const aliases = new Map<string, string>();
  cardData?.forEach((card) => {
    const canonical = card.name.trim();
    aliases.set(normalizeName(canonical), canonical);
    for (const face of card.faces ?? []) {
      if (face.name) {
        aliases.set(normalizeName(face.name), canonical);
      }
    }
  });
  return aliases;
}

export function aggregateDeckCards(
  cards: ParsedDeckCard[],
  cardData?: Map<string, ManaCurveCardData>
): AggregatedDeckCard[] {
  const aliases = buildCardAliases(cardData);
  const aggregate = new Map<string, AggregatedDeckCard>();

  for (const row of cards) {
    const normalizedRowName = normalizeName(row.name);
    const directLookup = cardData ? lookupCard(cardData, row.name) : undefined;
    const canonicalName = aliases.get(normalizedRowName) ?? directLookup?.name ?? row.name.trim();
    const normalizedName = normalizeName(canonicalName);
    const current =
      aggregate.get(normalizedName) ??
      {
        canonicalName,
        normalizedName,
        mainCount: 0,
        sideboardCount: 0,
        totalCount: 0,
        sourceRows: []
      };

    if (row.section === "main") {
      current.mainCount += row.qty;
    } else {
      current.sideboardCount += row.qty;
    }
    current.totalCount += row.qty;
    current.sourceRows.push(row);
    aggregate.set(normalizedName, current);
  }

  return Array.from(aggregate.values()).sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
}

function isBasicLand(card: ManaCurveCardData | undefined, canonicalName: string) {
  return Boolean(card?.typeLine && /\bbasic\s+land\b/i.test(card.typeLine)) || basicLandNameFallbacks.has(normalizeName(canonicalName));
}

function normalizedOracleText(card: ManaCurveCardData) {
  const faceText = (card.faces ?? []).map((face) => face.oracleText ?? "").filter(Boolean).join("\n");
  return [card.oracleText ?? "", faceText].filter(Boolean).join("\n").replace(/[\u2019`]/g, "'");
}

function parseNumberToken(value: string) {
  const trimmed = value.trim().toLowerCase();
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return numeric;
  }
  return numberWords.get(trimmed);
}

function copyRuleFromOracleText(card: ManaCurveCardData): DeckCopyRule | null {
  const text = normalizedOracleText(card);
  if (!text) {
    return null;
  }

  const escapedName = card.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\u2019`]/g, "'");
  const anyNumberPattern = new RegExp(`a deck can have any number of cards named ${escapedName}\\.?`, "i");
  if (anyNumberPattern.test(text)) {
    return {
      kind: "unlimited",
      source: "oracle-text",
      explanation: `${card.name} has a card-specific deck-construction rule allowing any number of copies.`
    };
  }

  const maximumPattern = new RegExp(`a deck can have up to (\\w+|\\d+) cards named ${escapedName}\\.?`, "i");
  const maximumMatch = text.match(maximumPattern);
  const maximum = maximumMatch?.[1] ? parseNumberToken(maximumMatch[1]) : undefined;
  if (maximum && maximum > 0) {
    return {
      kind: "maximum",
      maximum,
      source: "oracle-text",
      explanation: `${card.name} has a card-specific deck-construction rule allowing up to ${maximum} copies.`
    };
  }

  return null;
}

export function resolveDeckCopyRule(input: {
  card?: ManaCurveCardData;
  canonicalName: string;
  format: string;
  legality?: string;
}): DeckCopyRule {
  const normalizedFormat = input.format.trim().toLowerCase();
  if (normalizedFormat === "vintage" && input.legality === "restricted") {
    return {
      kind: "maximum",
      maximum: 1,
      source: "restricted",
      explanation: `${input.canonicalName} is restricted in Vintage.`
    };
  }

  const override = copyRuleOverrides[normalizeName(input.canonicalName)];
  if (override) {
    return override;
  }

  const oracleRule = input.card ? copyRuleFromOracleText(input.card) : null;
  if (oracleRule) {
    return oracleRule;
  }

  if (isBasicLand(input.card, input.canonicalName)) {
    return {
      kind: "unlimited",
      source: "basic-land",
      explanation: `${input.canonicalName} is treated as a basic land for copy-limit checks.`
    };
  }

  if (normalizedFormat === "commander" || normalizedFormat === "brawl") {
    return {
      kind: "maximum",
      maximum: 1,
      source: "singleton",
      explanation: `${input.format} decks usually play one registered copy of each nonbasic card.`
    };
  }

  if (modeledRegisteredCopyLimitFormats.has(normalizedFormat)) {
    return {
      kind: "maximum",
      maximum: 4,
      source: "format-default",
      explanation: `Most ${input.format} deck registrations are limited to four copies total.`
    };
  }

  return {
    kind: "unknown",
    explanation: `Opening Edge does not fully model copy limits for ${input.format}.`
  };
}

function countBreakdown(card: AggregatedDeckCard) {
  return `${card.mainCount} main + ${card.sideboardCount} sideboard`;
}

function issueForCopyRule(rule: DeckCopyRule) {
  if (rule.kind !== "maximum") {
    return { code: "COPY_LIMIT", title: "Copy limit" };
  }
  if (rule.source === "restricted") {
    return { code: "RESTRICTED_CARD", title: "Restricted card" };
  }
  if (rule.source === "singleton") {
    return { code: "SINGLETON_LIMIT", title: "Singleton limit" };
  }
  return { code: "COPY_LIMIT", title: "Copy limit" };
}

function copyLimitDetail(entry: AggregatedDeckCard, rule: DeckCopyRule, format: string, cardFound: boolean) {
  const breakdown = countBreakdown(entry);
  const unknownSuffix = cardFound ? "" : " Opening Edge could not verify card-specific exception text for this card.";
  if (rule.kind !== "maximum") {
    return `${entry.canonicalName} appears ${entry.totalCount} times across the registered deck (${breakdown}).${unknownSuffix}`;
  }
  if (rule.source === "restricted") {
    return `${entry.canonicalName} appears ${entry.totalCount} times across the registered deck (${breakdown}). It is restricted in ${format}.${unknownSuffix}`;
  }
  if (rule.source === "singleton") {
    return `${entry.canonicalName} appears ${entry.totalCount} times across the registered deck (${breakdown}). ${format} decks usually allow one registered copy of each nonbasic card.${unknownSuffix}`;
  }
  if (rule.source === "oracle-text") {
    return `${entry.canonicalName} appears ${entry.totalCount} times across the registered deck (${breakdown}), but its card-specific deck-construction rule allows up to ${rule.maximum} copies.`;
  }
  return `${entry.canonicalName} appears ${entry.totalCount} times across the registered deck (${breakdown}). Most ${format} deck registrations are limited to four copies total.${unknownSuffix}`;
}

export function validateDeckConstruction(
  decklist: string,
  cardData: Map<string, ManaCurveCardData>,
  format: string
): DeckValidationResult {
  const parsed = parseDecklist(decklist);
  const model = modelForFormat(format);
  const mainCards = parsed.cards.filter((card) => card.section === "main");
  const sideboardCards = parsed.cards.filter((card) => card.section === "sideboard");
  const mainCount = mainCards.reduce((sum, card) => sum + card.qty, 0);
  const sideboardCount = sideboardCards.reduce((sum, card) => sum + card.qty, 0);
  const aggregatedCards = aggregateDeckCards(parsed.cards, cardData);
  const issues: DeckValidationIssue[] = [];

  if (model.expectedMainSize && mainCount < model.expectedMainSize) {
    addIssue(issues, {
      code: "MAIN_DECK_INCOMPLETE",
      severity: "warning",
      title: "Deck incomplete",
      detail:
        mainCount < (model.minCompleteMainSize ?? model.expectedMainSize)
          ? `Curve totals are shown, but posture and recommendations are withheld until the main deck is close to ${model.expectedMainSize} cards for ${format}.`
          : `The main deck is slightly below ${model.expectedMainSize} cards for ${format}.`
    });
  }

  if (model.maxSideboardSize !== undefined && sideboardCount > model.maxSideboardSize) {
    addIssue(issues, {
      code: "SIDEBOARD_TOO_LARGE",
      severity: "warning",
      title: "Sideboard may be too large",
      detail: `${format} normally uses up to ${model.maxSideboardSize} sideboard${model.maxSideboardSize === 1 ? " card" : " cards"}.`
    });
  }

  if ((format.trim().toLowerCase() === "commander" || format.trim().toLowerCase() === "brawl") && mainCount > 0) {
    addIssue(issues, {
      code: "COMMANDER_IDENTITY_UNVERIFIED",
      severity: "warning",
      title: "Commander details need review",
      detail:
        "Opening Edge can check counts and card names, but commander identity, companion rules, and house-rule assumptions may need manual review."
    });
  }

  for (const entry of aggregatedCards) {
    const card = lookupCard(cardData, entry.canonicalName) ?? lookupCard(cardData, entry.sourceRows[0]?.name ?? entry.canonicalName);
    const legality = cardLegality(card, format);
    const copyRule = resolveDeckCopyRule({
      card,
      canonicalName: entry.canonicalName,
      format,
      legality
    });

    if (!card) {
      addIssue(issues, {
        code: "UNKNOWN_CARD",
        severity: "warning",
        title: "Card data missing",
        detail: `${entry.canonicalName} could not be verified against loaded card data. Copy-limit exceptions and format legality may need manual review.`,
        cardName: entry.canonicalName
      });
    }

    if (copyRule.kind === "maximum" && entry.totalCount > copyRule.maximum) {
      const copyIssue = issueForCopyRule(copyRule);
      addIssue(issues, {
        code: copyIssue.code,
        severity: "warning",
        title: copyIssue.title,
        detail: copyLimitDetail(entry, copyRule, format, Boolean(card)),
        cardName: entry.canonicalName
      });
    } else if (copyRule.kind === "unknown" && entry.totalCount > 4) {
      addIssue(issues, {
        code: "UNKNOWN_COPY_RULE",
        severity: "warning",
        title: "Copy limit needs review",
        detail: `${entry.canonicalName} appears ${entry.totalCount} times across the registered deck (${countBreakdown(entry)}), but Opening Edge does not fully model copy limits for ${format}.`,
        cardName: entry.canonicalName
      });
    }

    if (!card && entry.totalCount > 4) {
      addIssue(issues, {
        code: "UNKNOWN_COPY_RULE",
        severity: "warning",
        title: "Copy limit needs review",
        detail: `${entry.canonicalName} appears ${entry.totalCount} times across the registered deck (${countBreakdown(entry)}), but Opening Edge could not verify whether it has a special deck-construction rule.`,
        cardName: entry.canonicalName
      });
      continue;
    }

    if (!card) {
      continue;
    }

    if (legality === "not_legal" || legality === "banned") {
      addIssue(issues, {
        code: legality === "banned" ? "BANNED_CARD" : "FORMAT_ILLEGAL",
        severity: "warning",
        title: legality === "banned" ? "Banned card" : "Format legality issue",
        detail: `${entry.canonicalName} is listed as ${legality.replace("_", " ")} in ${format}.`,
        cardName: entry.canonicalName
      });
    }

    if (entry.sourceRows.length > 1 && copyRule.kind !== "unknown" && (copyRule.kind === "unlimited" || entry.totalCount <= copyRule.maximum)) {
      addIssue(issues, {
        code: "DUPLICATE_ROWS_COMBINED",
        severity: "info",
        title: "Duplicate rows combined",
        detail: `${entry.canonicalName} appears on ${entry.sourceRows.length} decklist rows and was checked as ${entry.totalCount} total registered copies.`,
        cardName: entry.canonicalName
      });
    }
  }

  const materiallyIncomplete =
    Boolean(model.minCompleteMainSize && mainCount < model.minCompleteMainSize) ||
    issues.some((issue) => issue.code === "UNKNOWN_CARD" && issue.severity === "warning");

  return {
    expectedMainSize: model.expectedMainSize,
    mainCount,
    sideboardCount,
    isCompleteEnoughForPosture: !materiallyIncomplete,
    issues
  };
}

export const validateDeckForManaCurve = validateDeckConstruction;
