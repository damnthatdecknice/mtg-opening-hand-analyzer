import { fetchCardData, type CardLookup } from "./analyzer";
import type { ParsedDeck } from "./deckParser";
import {
  trainerImageMapFromLookups,
  trainerNormalizeCardName,
  type TrainerCardImageMap,
  type TrainerCardPresentation
} from "./keepTrainer";

export type TrainerCardPresentationResult = {
  cards: TrainerCardPresentation[];
  cardImages: TrainerCardImageMap;
  imageWarnings: string[];
};

export function mtgoIdsByName(parsed?: ParsedDeck | null, names?: string[]) {
  const allowed = names ? new Set(names.map(trainerNormalizeCardName)) : null;
  const result: Record<string, number[]> = {};
  for (const identity of parsed?.importMetadata?.cards ?? []) {
    if (!identity.catId) {
      continue;
    }
    if (allowed && !allowed.has(trainerNormalizeCardName(identity.name))) {
      continue;
    }
    result[identity.name] = Array.from(new Set([...(result[identity.name] ?? []), identity.catId]));
  }
  return result;
}

function lookupAliases(lookups: Map<string, CardLookup>) {
  const aliases = new Map<string, CardLookup>();
  for (const lookup of Array.from(lookups.values())) {
    aliases.set(trainerNormalizeCardName(lookup.name), lookup);
    for (const face of lookup.faces) {
      if (face.name) {
        aliases.set(trainerNormalizeCardName(face.name), lookup);
      }
    }
  }
  return aliases;
}

export function cardPresentationsFromLookups(hand: string[], lookups: Map<string, CardLookup>): TrainerCardPresentationResult {
  const byName = lookupAliases(lookups);
  const cards: TrainerCardPresentation[] = [];
  const imageWarnings: string[] = [];

  for (const cardName of hand) {
    const lookup = byName.get(trainerNormalizeCardName(cardName));
    const imageUrl = lookup?.imageUrl || lookup?.imageUrls?.[0] || "";
    const artCropUrl = lookup?.artCropUrl || lookup?.artCropUrls?.[0] || undefined;
    if (lookup && imageUrl) {
      cards.push({
        name: cardName,
        canonicalName: lookup.name,
        imageUrl,
        artCropUrl,
        imageStatus: "ready"
      });
      continue;
    }

    const warning = lookup
      ? `No card image was available for ${cardName}.`
      : `Card image lookup did not resolve ${cardName}.`;
    imageWarnings.push(warning);
    cards.push({
      name: cardName,
      canonicalName: lookup?.name,
      imageStatus: "missing",
      warning
    });
  }

  return {
    cards,
    cardImages: trainerImageMapFromLookups(lookups, hand),
    imageWarnings: Array.from(new Set(imageWarnings))
  };
}

export async function loadTrainerCardPresentation(
  hand: string[],
  parsed?: ParsedDeck | null
): Promise<TrainerCardPresentationResult> {
  const uniqueHandNames = Array.from(new Set(hand.map((name) => name.trim()).filter(Boolean)));
  try {
    const lookup = await fetchCardData(uniqueHandNames, {
      exactMtgoImagesOnly: false,
      mtgoIdsByName: mtgoIdsByName(parsed, uniqueHandNames),
      retryFailures: true
    });
    const presentation = cardPresentationsFromLookups(hand, lookup.lookups);
    const imageWarnings = [...presentation.imageWarnings];
    if (lookup.operationFailure?.message) {
      imageWarnings.push("Some card images could not be loaded. Names are still shown.");
    }
    const unresolvedImageNames =
      lookup.unresolvedCards && lookup.unresolvedCards.length > 0 ? lookup.unresolvedCards : lookup.failures ?? [];
    for (const unresolved of unresolvedImageNames) {
      imageWarnings.push(`Card image lookup did not resolve ${unresolved}.`);
    }
    return {
      ...presentation,
      imageWarnings: Array.from(new Set(imageWarnings))
    };
  } catch {
    return {
      cards: hand.map((name) => ({
        name,
        imageStatus: "missing",
        warning: `Card image lookup did not resolve ${name}.`
      })),
      cardImages: {},
      imageWarnings: ["Card images could not be loaded. Names are still shown."]
    };
  }
}
