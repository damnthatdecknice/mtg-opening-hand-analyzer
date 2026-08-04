import {
  analyzeOpeningHand,
  fetchCardData,
  type CardLookup,
  type AnalyzerResult,
  type PlayDraw
} from "./analyzer";
import { parseDecklist } from "./deckParser";
import {
  trainerAnswerFromAnalysis,
  trainerExplanationFromAnalysis,
  type TrainerAnswer,
  type TrainerExplanation
} from "./keepTrainer";

type CachedTrainerDeck = { expiresAt: number; lookups: Map<string, CardLookup> };
const trainerDeckCache = new Map<string, CachedTrainerDeck>();
const trainerAnalysisInFlight = new Map<string, Promise<TrainerAnalysisPreparation>>();
const TRAINER_CACHE_TTL_MS = 10 * 60 * 1000;
const TRAINER_CACHE_MAX = 24;

function isAbortError(error: unknown) {
  return (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError");
}

function trainerCacheKey(input: TrainerAnalysisInput) {
  return input.format.trim().toLowerCase() + "|" + input.decklistSnapshot.trim() + "|opening-edge-trainer-cache-v1";
}

function cacheTrainerDeck(key: string, lookups: Map<string, CardLookup>) {
  trainerDeckCache.delete(key);
  trainerDeckCache.set(key, { expiresAt: Date.now() + TRAINER_CACHE_TTL_MS, lookups: new Map(lookups) });
  while (trainerDeckCache.size > TRAINER_CACHE_MAX) {
    trainerDeckCache.delete(trainerDeckCache.keys().next().value as string);
  }
}

export function clearTrainerAnalysisCache() {
  trainerDeckCache.clear();
  trainerAnalysisInFlight.clear();
}

export type TrainerAnalysisInput = {
  decklistSnapshot: string;
  format: string;
  hand: string[];
  playDraw: PlayDraw;
  signal?: AbortSignal;
};

export type PreparedTrainerAnalysis = {
  analysis: AnalyzerResult;
  correctAnswer: TrainerAnswer;
  explanation: TrainerExplanation;
};

export type TrainerAnalysisPreparation =
  | ({ ok: true } & PreparedTrainerAnalysis)
  | {
      ok: false;
      message: string;
      unresolvedCards: string[];
    };

export function uniqueTrainerCardNames(names: string[]) {
  return Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
}

export async function prepareTrainerAnalysis(
  input: TrainerAnalysisInput
): Promise<TrainerAnalysisPreparation> {
  const inFlightKey = `${trainerCacheKey(input)}|${input.hand.map((card) => card.trim().toLowerCase()).sort().join(",")}|${input.playDraw}`;
  const existing = trainerAnalysisInFlight.get(inFlightKey);
  if (existing) return existing;

  const preparation = prepareTrainerAnalysisUnshared(input);
  trainerAnalysisInFlight.set(inFlightKey, preparation);
  try {
    return await preparation;
  } finally {
    if (trainerAnalysisInFlight.get(inFlightKey) === preparation) {
      trainerAnalysisInFlight.delete(inFlightKey);
    }
  }
}

async function prepareTrainerAnalysisUnshared(
  input: TrainerAnalysisInput
): Promise<TrainerAnalysisPreparation> {
  const cacheKey = trainerCacheKey(input);
  const parsed = parseDecklist(input.decklistSnapshot);
  const cardNames = uniqueTrainerCardNames([
    ...parsed.cards.map((card) => card.name),
    ...input.hand
  ]);
  const cached = trainerDeckCache.get(cacheKey);
  let lookup: Awaited<ReturnType<typeof fetchCardData>>;
  if (cached && cached.expiresAt > Date.now()) {
    lookup = { lookups: new Map(cached.lookups), failures: [], unresolvedCards: [] };
  } else {
    if (cached) trainerDeckCache.delete(cacheKey);
    lookup = await fetchCardData(cardNames, { retryFailures: true, signal: input.signal }).catch((error) => {
      if (input.signal?.aborted || isAbortError(error)) {
        throw error;
      }
      return {
        lookups: new Map(),
        failures: cardNames,
        unresolvedCards: cardNames,
        operationFailure: {
          kind: "network" as const,
          message: error instanceof Error ? error.message : "Opening Edge could not load card data.",
          retryable: true
        }
      };
    });
  }

  const unresolvedCards = uniqueTrainerCardNames([
    ...(lookup.unresolvedCards ?? []),
    ...cardNames.filter((name) => !lookup.lookups.has(name.toLocaleLowerCase()))
  ]);
  if (lookup.operationFailure || unresolvedCards.length) {
    return {
      ok: false,
      message: lookup.operationFailure?.message ?? "Opening Edge could not finish card lookup.",
      unresolvedCards
    };
  }

  cacheTrainerDeck(cacheKey, lookup.lookups);

  const analysis = analyzeOpeningHand(
    input.decklistSnapshot,
    input.hand,
    lookup.lookups,
    input.playDraw,
    { format: input.format }
  );
  if (analysis.missingCards.length) {
    return {
      ok: false,
      message: "Opening Edge could not finish card lookup.",
      unresolvedCards: uniqueTrainerCardNames(analysis.missingCards)
    };
  }

  const correctAnswer = trainerAnswerFromAnalysis(analysis);
  return {
    ok: true,
    analysis,
    correctAnswer,
    explanation: trainerExplanationFromAnalysis(analysis, correctAnswer)
  };
}
