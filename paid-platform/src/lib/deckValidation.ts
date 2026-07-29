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

const basicLands = new Set(["plains", "island", "swamp", "mountain", "forest", "wastes"]);

function normalizeName(name: string) {
  return name.trim().toLowerCase();
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
  const issues: DeckValidationIssue[] = [];

  if (model.expectedMainSize && mainCount < model.expectedMainSize) {
    const severity: DeckValidationSeverity = "warning";
    addIssue(issues, {
      code: "MAIN_DECK_INCOMPLETE",
      severity,
      title: "Deck incomplete",
      detail:
        severity === "warning"
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

  for (const entry of parsed.cards) {
    const key = normalizeName(entry.name);
    const card = cardData.get(key);
    if (!card) {
      addIssue(issues, {
        code: "UNKNOWN_CARD",
        severity: "warning",
        title: "Card data missing",
        detail: `${entry.name} could not be verified against loaded card data.`,
        cardName: entry.name
      });
      continue;
    }

    if (entry.section === "main" && !basicLands.has(key)) {
      if (model.singleton && entry.qty > 1) {
        addIssue(issues, {
          code: "SINGLETON_LIMIT",
          severity: "warning",
          title: "Singleton limit",
          detail: `${format} decks usually play one copy of nonbasic cards.`,
          cardName: entry.name
        });
      } else if (!model.singleton && entry.qty > 4) {
        addIssue(issues, {
          code: "COPY_LIMIT",
          severity: "warning",
          title: "Copy limit",
          detail: `${entry.name} appears ${entry.qty} times. Most ${format} decks are limited to four copies.`,
          cardName: entry.name
        });
      }
    }

    const legality = cardLegality(card, format);
    if (legality === "not_legal" || legality === "banned") {
      addIssue(issues, {
        code: legality === "banned" ? "BANNED_CARD" : "FORMAT_ILLEGAL",
        severity: "warning",
        title: legality === "banned" ? "Banned card" : "Format legality issue",
        detail: `${entry.name} is listed as ${legality.replace("_", " ")} in ${format}.`,
        cardName: entry.name
      });
    } else if (model.restricted && legality === "restricted" && entry.qty > 1) {
      addIssue(issues, {
        code: "RESTRICTED_CARD",
        severity: "warning",
        title: "Restricted card",
        detail: `${entry.name} is restricted in ${format}; more than one copy may not be legal.`,
        cardName: entry.name
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
