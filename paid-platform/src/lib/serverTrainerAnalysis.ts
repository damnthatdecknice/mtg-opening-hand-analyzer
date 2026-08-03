import {
  analyzeOpeningHand,
  fetchCardData,
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

export type TrainerAnalysisInput = {
  decklistSnapshot: string;
  format: string;
  hand: string[];
  playDraw: PlayDraw;
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
  const parsed = parseDecklist(input.decklistSnapshot);
  const cardNames = uniqueTrainerCardNames([
    ...parsed.cards.map((card) => card.name),
    ...input.hand
  ]);
  const lookup = await fetchCardData(cardNames, { retryFailures: true }).catch((error) => ({
    lookups: new Map(),
    failures: cardNames,
    unresolvedCards: cardNames,
    operationFailure: {
      kind: "network" as const,
      message: error instanceof Error ? error.message : "Opening Edge could not load card data.",
      retryable: true
    }
  }));

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
