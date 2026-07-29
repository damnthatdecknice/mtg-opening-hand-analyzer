import { inferDeckName, parseDecklist, type ParsedDeck } from "./deckParser";
import { validateDeckConstruction, type DeckValidationIssue } from "./deckValidation";
import { normalizeFormat } from "./formats";
import type { ManaCurveCardData } from "./manaCurve";

export type OnboardingValidationStatus =
  | "empty"
  | "checking"
  | "incomplete"
  | "warnings"
  | "verified"
  | "lookup-error";

export type OnboardingDeckReview = {
  suggestedName: string;
  mainCount: number;
  sideboardCount: number;
  uniqueCount: number;
  status: OnboardingValidationStatus;
  messages: string[];
  issues: DeckValidationIssue[];
  unresolvedCards?: string[];
  checkedAt?: number;
  deckFingerprint?: string;
};

export type OnboardingCardDataFetcher = (
  cardNames: string[]
) => Promise<{ lookups: Map<string, ManaCurveCardData>; failures: string[] }>;

export type DeckVerificationGate = {
  allowed: boolean;
  message?: string;
  needsAcknowledgment: boolean;
};

export const onboardingExampleDeck = `Deck
4 Monastery Swiftspear
4 Lightning Strike
4 Play with Fire
4 Phoenix Chick
4 Kumano Faces Kakkazan
4 Charming Scoundrel
4 Imodane's Recruiter
4 Warden of the Inner Sky
4 Inspiring Vantage
4 Battlefield Forge
12 Mountain
8 Plains

Sideboard
3 Destroy Evil
2 Lithomantic Barrage`;

function emptyReview(decklist: string, parsed: ParsedDeck): OnboardingDeckReview {
  return {
    suggestedName: inferDeckName(decklist),
    mainCount: parsed.mainCount,
    sideboardCount: parsed.sideboardCount,
    uniqueCount: parsed.cards.length,
    status: "empty",
    messages: ["Import a `.dek` file or paste a decklist to begin."],
    issues: []
  };
}

function buildDeckFingerprint(decklist: string, format: string, parsed: ParsedDeck) {
  const normalizedCards = parsed.cards
    .map((card) => `${card.section}:${card.name.trim().toLowerCase()}:${card.qty}`)
    .sort()
    .join("|");
  return `${format.trim().toLowerCase()}::${normalizedCards || decklist.trim().toLowerCase()}`;
}

export function gateDeckVerification(
  status: OnboardingValidationStatus,
  acknowledgedWarnings: boolean,
  mainCount: number
): DeckVerificationGate {
  const needsAcknowledgment = status === "warnings" || status === "incomplete" || status === "lookup-error";
  if (status === "checking") {
    return {
      allowed: false,
      needsAcknowledgment,
      message: "Checking card names, deck construction, and available format legality..."
    };
  }
  if (status === "empty" || mainCount === 0) {
    return {
      allowed: false,
      needsAcknowledgment,
      message: "Import a `.dek` file or paste a decklist to begin."
    };
  }
  if (needsAcknowledgment && !acknowledgedWarnings) {
    return {
      allowed: false,
      needsAcknowledgment,
      message:
        status === "lookup-error"
          ? "Opening Edge could not finish checking this deck. Acknowledge the warning or retry before continuing."
          : "Review and acknowledge the deck warnings before continuing."
    };
  }
  return {
    allowed: true,
    needsAcknowledgment
  };
}

export function buildOnboardingReview(decklist: string, format: string, parsed: ParsedDeck = parseDecklist(decklist)): OnboardingDeckReview {
  if (parsed.mainCount === 0) {
    return emptyReview(decklist, parsed);
  }

  const normalizedFormat = normalizeFormat(format);
  const expected = normalizedFormat === "Draft" ? 40 : normalizedFormat === "Commander" ? 99 : normalizedFormat === "Brawl" ? 59 : 60;
  const minimum = normalizedFormat === "Draft" ? 36 : normalizedFormat === "Commander" ? 90 : normalizedFormat === "Brawl" ? 54 : 54;
  const issues: DeckValidationIssue[] = [];
  const messages = [`${parsed.mainCount} cards in main deck`, `${parsed.sideboardCount} cards in sideboard`];

  if (parsed.mainCount < minimum) {
    messages.push("Deck is incomplete. You can continue with limited analysis, but posture and recommendations may be withheld.");
    issues.push({
      code: "MAIN_DECK_INCOMPLETE",
      severity: "warning",
      title: "Deck incomplete",
      detail: `Curve totals can be shown, but posture and recommendations need a main deck close to ${expected} cards.`
    });
  } else if (parsed.mainCount < expected) {
    messages.push(`Your deck has ${parsed.mainCount} main-deck cards. You can continue, but check the final count.`);
    issues.push({
      code: "MAIN_DECK_INCOMPLETE",
      severity: "warning",
      title: "Deck incomplete",
      detail: `The main deck is below the normal ${expected}-card size for ${normalizedFormat}.`
    });
  }

  return {
    suggestedName: inferDeckName(decklist),
    mainCount: parsed.mainCount,
    sideboardCount: parsed.sideboardCount,
    uniqueCount: parsed.cards.length,
    status: issues.length ? (parsed.mainCount < minimum ? "incomplete" : "warnings") : "checking",
    messages,
    issues
  };
}

export async function verifyDeckForSaving(
  decklist: string,
  format: string,
  fetchCardData: OnboardingCardDataFetcher,
  signal?: AbortSignal
): Promise<OnboardingDeckReview> {
  const parsed = parseDecklist(decklist);
  if (parsed.mainCount === 0) {
    return emptyReview(decklist, parsed);
  }

  const names = parsed.cards.map((card) => card.name);

  try {
    const { lookups, failures } = await fetchCardData(names);
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    const validation = validateDeckConstruction(decklist, lookups, format);
    const issues = [...validation.issues];

    if (failures.length) {
      for (const failure of failures.slice(0, 8)) {
        issues.push({
          code: "LOOKUP_FAILURE",
          severity: "warning",
          title: "Card lookup did not finish",
          detail: failure
        });
      }
    }

    const unresolvedCards = [
      ...failures,
      ...issues.filter((issue) => issue.code === "UNKNOWN_CARD" && issue.cardName).map((issue) => issue.cardName as string)
    ];
    const hasLookupFailure = failures.length > 0 && lookups.size === 0;
    const hasWarning = issues.some((issue) => issue.severity === "warning" || issue.severity === "error");
    const status: OnboardingValidationStatus = hasLookupFailure
      ? "lookup-error"
      : !validation.isCompleteEnoughForPosture
        ? "incomplete"
        : hasWarning
          ? "warnings"
          : "verified";

    return {
      suggestedName: inferDeckName(decklist),
      mainCount: validation.mainCount,
      sideboardCount: validation.sideboardCount,
      uniqueCount: parsed.cards.length,
      status,
      messages:
        status === "verified"
          ? ["Deck verified for opening-hand analysis."]
          : [`${validation.mainCount} cards in main deck`, `${validation.sideboardCount} cards in sideboard`],
      issues,
      unresolvedCards,
      checkedAt: Date.now(),
      deckFingerprint: buildDeckFingerprint(decklist, format, parsed)
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    return {
      suggestedName: inferDeckName(decklist),
      mainCount: parsed.mainCount,
      sideboardCount: parsed.sideboardCount,
      uniqueCount: parsed.cards.length,
      status: "lookup-error",
      messages: ["Opening Edge could not finish checking this deck. You can retry without losing the decklist."],
      issues: [
        {
          code: "LOOKUP_ERROR",
          severity: "warning",
          title: "Verification could not finish",
          detail: "Opening Edge could not finish checking this deck. You can retry without losing the decklist."
        }
      ],
      unresolvedCards: [],
      checkedAt: Date.now(),
      deckFingerprint: buildDeckFingerprint(decklist, format, parsed)
    };
  }
}

export const verifyDeckForOnboarding = verifyDeckForSaving;
