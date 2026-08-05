import type { AnalyzerResult, CardLookup, PlayDraw } from "./analyzer";
import {
  trainerAnswerFromPolicy,
  trainerDecisionConfidence,
  trainerRatingDelta
} from "./trainerDecisionPolicy";

export type TrainerAnswer = "keep" | "mulligan";

export type TrainerDecisionConfidence = "close" | "moderate" | "strong";
export type TrainerCoachingRating = "weak" | "average" | "good" | "strong";
export type TrainerMetricTone = "good" | "warning" | "neutral";

export type TrainerCoachingFactor = {
  label: string;
  rating: TrainerCoachingRating;
  explanation: string;
};

export type TrainerSummaryMetric = {
  label: string;
  value: string;
  detail?: string;
  tone?: TrainerMetricTone;
};

export type TrainerTechnicalRow = {
  label: string;
  value: string;
};

export type TrainerExplanation = {
  verdict: TrainerAnswer;
  headline: string;
  lesson: string;
  keyFactors: string[];
  supportingPoints: string[];
  watchFor: string[];
  risk: string;
  score: number;
  recommendation: string;
  percentile: number;
  severeFailureProbability: number;
  keepAdvantage?: number;
  scoringVersion?: string;
  decisionConfidence?: TrainerDecisionConfidence;
  decisionMarginLabel?: string;
  summaryMetrics?: TrainerSummaryMetric[];
  coachingFactors?: TrainerCoachingFactor[];
  whyThisWorks?: string[];
  whatCouldGoWrong?: string[];
  bestDraws?: string[];
  technicalRows?: TrainerTechnicalRow[];
};

export type PublicTrainerHand = {
  id: string;
  deckId: string;
  deckName: string;
  format: string;
  hand: string[];
  playDraw: PlayDraw;
  cardImages?: TrainerCardImageMap;
  cards?: TrainerCardPresentation[];
  imageWarnings?: string[];
  completed?: boolean;
  selectedAnswer?: TrainerAnswer;
  pendingAnswer?: TrainerAnswer;
  analysisStatus?: "pending" | "running" | "ready" | "failed";
  analysisError?: string;
  reveal?: TrainerReveal;
};

export type TrainerCardImage = {
  name: string;
  imageUrl: string;
  artCropUrl?: string;
};

export type TrainerCardImageMap = Record<string, TrainerCardImage>;

export type TrainerCardImageStatus = "ready" | "missing";

export type TrainerCardPresentation = {
  name: string;
  canonicalName?: string;
  imageUrl?: string;
  artCropUrl?: string;
  imageStatus: TrainerCardImageStatus;
  warning?: string;
};

export type TrainerReveal = {
  correct: boolean;
  correctAnswer: TrainerAnswer;
  explanation: TrainerExplanation;
  rated?: boolean;
  ratingDelta?: number;
};

export type TrainerAttempt = {
  selectedAnswer: TrainerAnswer;
  correct: boolean;
  ratingBefore?: number;
  ratingAfter?: number;
  rated?: boolean;
  ratingDelta?: number;
  attemptedAt?: string;
};

export type TrainerStats = {
  attempts: number;
  correct: number;
  accuracy: number;
  currentStreak: number;
  longestStreak: number;
  rating: number;
  recentResults: Array<{ attemptedAt: string; correct: boolean }>;
};

export type TrainerDeckOption = {
  id: string;
  name: string;
  format: string;
  mainCount: number;
};

export const keepTrainerAnalyzerVersion = "opening-edge-keep-trainer-v1";

export function trainerNormalizeCardName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s*\/\/\s*/g, " // ")
    .replace(/\s+/g, " ");
}

export function trainerImageMapFromLookups(lookups: Map<string, CardLookup>, names: string[]) {
  const byName = new Map<string, CardLookup>();
  for (const lookup of Array.from(lookups.values())) {
    byName.set(trainerNormalizeCardName(lookup.name), lookup);
    for (const face of lookup.faces) {
      byName.set(trainerNormalizeCardName(face.name), lookup);
    }
  }

  const images: TrainerCardImageMap = {};
  for (const name of names) {
    const lookup = byName.get(trainerNormalizeCardName(name));
    const imageUrl = lookup?.imageUrl || lookup?.imageUrls?.[0] || lookup?.artCropUrl || lookup?.artCropUrls?.[0] || "";
    if (lookup && imageUrl) {
      images[trainerNormalizeCardName(name)] = {
        name: lookup.name,
        imageUrl,
        artCropUrl: lookup.artCropUrl || lookup.artCropUrls?.[0]
      };
    }
  }
  return images;
}

export function isTrainerAnswer(value: unknown): value is TrainerAnswer {
  return value === "keep" || value === "mulligan";
}

export function trainerAnswerFromAnalysis(analysis: AnalyzerResult): TrainerAnswer {
  return trainerAnswerFromPolicy(analysis);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatRatioPercent(value: number, digits = 0) {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatSignedRatioPercent(value: number, digits = 1) {
  const percent = value * 100;
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(digits)}%`;
}

function ordinal(value: number) {
  const rounded = Math.round(value);
  const tens = rounded % 100;
  if (tens >= 11 && tens <= 13) return `${rounded}th`;
  switch (rounded % 10) {
    case 1:
      return `${rounded}st`;
    case 2:
      return `${rounded}nd`;
    case 3:
      return `${rounded}rd`;
    default:
      return `${rounded}th`;
  }
}

function percentileLabel(percentile: number) {
  const normalized = percentile > 1 ? percentile : percentile * 100;
  return `${ordinal(clamp(normalized, 0, 100))} percentile`;
}

function decisionMargin(analysis: AnalyzerResult, answer: TrainerAnswer) {
  const advantage = analysis.keepAdvantage;
  if (!isFiniteNumber(advantage)) {
    return {
      confidence: "close" as TrainerDecisionConfidence,
      label: "Decision edge unavailable",
      sentence: `${answer === "keep" ? "Keep" : "Mulligan"} is the model verdict, but the edge was not available.`
    };
  }

  const abs = Math.abs(advantage);
  const confidence: TrainerDecisionConfidence = trainerDecisionConfidence(abs);
  if (abs < 0.03) {
    return {
      confidence,
      label: "Too close to call",
      sentence: `Close decision: ${answer === "keep" ? "Keep" : "Mulligan"} by a narrow margin.`
    };
  }

  return {
    confidence,
    label: `${answer === "keep" ? "Keep" : "Mulligan"} edge: ${formatSignedRatioPercent(answer === "keep" ? abs : -abs)}`,
    sentence: `${answer === "keep" ? "Keep" : "Mulligan"} by a ${confidence} margin.`
  };
}

function normalizeFactorLabel(label: string) {
  const text = label.toLowerCase();
  if (/develop|early/.test(text)) return "Early development";
  if (/color/.test(text)) return "Color access";
  if (/mana use|util/.test(text)) return "Mana efficiency";
  if (/cast/.test(text)) return "Castability";
  if (/curve/.test(text)) return "Mana curve";
  if (/interact|removal|answer/.test(text)) return "Early interaction";
  if (/land/.test(text)) return "Land count";
  if (/synerg|role|selection/.test(text)) return "Synergy";
  return label.replace(/\b\w/g, (char) => char.toUpperCase());
}

function ratingFromFactor(value: number): TrainerCoachingRating {
  if (value >= 0.75) return "strong";
  if (value >= 0.35) return "good";
  if (value >= -0.1) return "average";
  return "weak";
}

function factorExplanation(label: string, rating: TrainerCoachingRating, analysis: AnalyzerResult) {
  switch (label) {
    case "Early development":
      return rating === "weak"
        ? "The hand may spend early turns catching up instead of advancing."
        : "The hand can start developing before the game gets too far ahead.";
    case "Color access":
      return rating === "weak"
        ? "The mana does not reliably cover the hand's early color requirements."
        : "The available sources line up with the hand's important early colors.";
    case "Mana efficiency":
      return rating === "weak"
        ? "Several simulated lines leave mana unused or strand spells at the same point on the curve."
        : "The hand has a plausible way to turn early mana into useful game actions.";
    case "Castability":
      return rating === "weak"
        ? "Important spells are not consistently castable on time."
        : "The important early spells are likely to be castable on schedule.";
    case "Mana curve":
      return rating === "weak"
        ? "The hand's costs do not line up into a clean early sequence."
        : "The costs line up into a reasonable early sequence.";
    case "Early interaction":
      return rating === "weak"
        ? "The hand may not interact quickly if the opponent starts fast."
        : "The hand has access to early interaction or flexible plays.";
    case "Land count":
      return rating === "weak"
        ? `${analysis.landsInHand} land(s) is a pressure point for this deck's curve.`
        : `${analysis.landsInHand} land(s) is within a workable range for this opener.`;
    case "Synergy":
      return rating === "weak"
        ? "The cards are not strongly supporting one plan yet."
        : "The cards point toward a coherent early plan.";
    default:
      return rating === "weak"
        ? "This factor is a pressure point in the simulated lines."
        : "This factor helped the simulated lines.";
  }
}

function coachingFactorsFromAnalysis(analysis: AnalyzerResult): TrainerCoachingFactor[] {
  const seen = new Set<string>();
  return analysis.scoreFactors
    .map((factor) => {
      const label = normalizeFactorLabel(factor.label);
      const rating = ratingFromFactor(factor.value);
      return { label, rating, explanation: factorExplanation(label, rating, analysis), value: factor.value };
    })
    .filter((factor) => {
      if (seen.has(factor.label)) return false;
      seen.add(factor.label);
      return true;
    })
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 5)
    .map(({ label, rating, explanation }) => ({ label, rating, explanation }));
}

function dedupeList(items: string[]) {
  const seen = new Set<string>();
  return items
    .map((item) => item.trim())
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function whyThisWorks(analysis: AnalyzerResult, factors: TrainerCoachingFactor[]) {
  const positive = factors.filter((factor) => factor.rating === "strong" || factor.rating === "good");
  const bullets = positive.slice(0, 3).map((factor) => factor.explanation);
  if (bullets.length) return dedupeList(bullets).slice(0, 3);
  return [
    `The hand starts with ${analysis.landsInHand} land(s) and ${analysis.effectiveLandsInHand} effective source(s).`,
    "The model found enough functionality for this to remain in the keep range."
  ];
}

function risksFromAnalysis(analysis: AnalyzerResult) {
  const risks = dedupeList(analysis.watchouts).slice(0, 3);
  if (risks.length) return risks;
  if (analysis.severeFailureProbability >= 0.25) {
    return ["A meaningful share of simulated lines still fail to develop cleanly by the early turns."];
  }
  return ["No single failure mode dominates, but the hand can still improve with flexible interaction or cleaner mana."];
}

function bestDrawsFromAnalysis(analysis: AnalyzerResult, risks: string[]) {
  const sourceText = `${risks.join(" ")} ${analysis.watchouts.join(" ")}`.toLowerCase();
  const draws: string[] = [];
  const floodRisk = /flood|too many lands|land-heavy|land heavy|five-land|four-land|4 land|5 land/.test(sourceText) || analysis.landsInHand >= 4;
  const screwRisk = /third land|land drop|land count|one-land|1 land|screw|miss(?:ed|ing)? (?:the )?(?:second|third) land|mana/.test(sourceText);
  if (screwRisk && !floodRisk) draws.push("Any untapped land");
  if (floodRisk) draws.push("A cheap spell or card-selection effect");
  if (/color|source|red|blue|black|white|green/.test(sourceText)) draws.push("A source of the missing color");
  if (/interact|removal|answer|fast/.test(sourceText)) draws.push("One- or two-mana interaction");
  if (/threat|pressure|clock/.test(sourceText)) draws.push("A cheap threat");
  if (/selection|draw|cantrip|look/.test(sourceText)) draws.push("Card selection");
  if (/ramp|payoff|top end|expensive/.test(sourceText)) draws.push("A payoff for the hand's setup");
  const unique = dedupeList(draws).slice(0, 3);
  return unique.length ? unique : ["This hand is already functional. Flexible interaction is the most useful addition."];
}

function technicalRowsFromAnalysis(analysis: AnalyzerResult) {
  const rows: TrainerTechnicalRow[] = [
    { label: "Scoring version", value: analysis.scoringVersion },
    { label: "Opening Hand Score", value: `${analysis.handTextureScore}/100` },
    { label: "Deck-relative percentile", value: percentileLabel(analysis.deckRelativePercentile) },
    { label: "Severe failure probability", value: formatRatioPercent(analysis.severeFailureProbability) }
  ];
  if (isFiniteNumber(analysis.keepAdvantage)) {
    rows.push({ label: "Decision keep advantage", value: `${analysis.keepAdvantage.toFixed(4)} (${formatSignedRatioPercent(analysis.keepAdvantage)})` });
  }
  if (analysis.mulligan) {
    rows.push({
      label: analysis.mulligan.comparison === "free-seven" ? "Free-seven model average" : "London six model average",
      value: analysis.mulligan.average.toFixed(1)
    });
  }
  if (analysis.scoreFactors.length) {
    rows.push({
      label: "Raw score factors",
      value: analysis.scoreFactors
        .slice(0, 8)
        .map((factor) => `${factor.label}: ${factor.value.toFixed(2)}`)
        .join("; ")
    });
  }
  return rows.filter((row) => row.value !== "" && row.value !== "NaN");
}

export function trainerExplanationFromAnalysis(
  analysis: AnalyzerResult,
  answer: TrainerAnswer
): TrainerExplanation {
  const margin = decisionMargin(analysis, answer);
  const coachingFactors = coachingFactorsFromAnalysis(analysis);
  const risks = risksFromAnalysis(analysis);
  const works = whyThisWorks(analysis, coachingFactors);
  const bestDraws = bestDrawsFromAnalysis(analysis, risks);
  const risk = risks[0] ?? "No single failure mode dominates this hand.";
  const summaryMetrics: TrainerSummaryMetric[] = [
    { label: "Decision edge", value: margin.label, detail: margin.sentence, tone: margin.confidence === "close" ? "neutral" : answer === "keep" ? "good" : "warning" },
    { label: "Deck percentile", value: percentileLabel(analysis.deckRelativePercentile), detail: "Compared with random openers from this deck.", tone: "neutral" },
    { label: "Failure risk", value: formatRatioPercent(analysis.severeFailureProbability), detail: "Severe stumble rate in simulated lines.", tone: analysis.severeFailureProbability >= 0.25 ? "warning" : "good" },
    { label: "Mana", value: `${analysis.landsInHand} lands / ${analysis.effectiveLandsInHand} sources`, detail: "Opening mana available to the hand.", tone: analysis.effectiveLandsInHand >= 2 ? "good" : "warning" }
  ];

  return {
    verdict: answer,
    headline: margin.sentence,
    lesson:
      answer === "keep"
        ? "The model prefers keeping because the hand's mana, timing, and risk profile are better than the replacement baseline."
        : "The model prefers a mulligan because a fresh hand is expected to produce a better risk-adjusted start.",
    keyFactors: coachingFactors.map((factor) => `${factor.label}: ${factor.rating}`),
    supportingPoints: works,
    watchFor: risks,
    risk,
    score: analysis.handTextureScore,
    recommendation: analysis.recommendation,
    percentile: analysis.deckRelativePercentile,
    severeFailureProbability: analysis.severeFailureProbability,
    keepAdvantage: analysis.keepAdvantage,
    scoringVersion: analysis.scoringVersion,
    decisionConfidence: margin.confidence,
    decisionMarginLabel: margin.label,
    summaryMetrics,
    coachingFactors,
    whyThisWorks: works,
    whatCouldGoWrong: risks,
    bestDraws,
    technicalRows: technicalRowsFromAnalysis(analysis)
  };
}

export function calculateTrainerRating(attempts: TrainerAttempt[]) {
  return attempts.reduce((rating, attempt) => {
    const next = rating + (attempt.correct ? 14 : -11);
    return Math.max(100, Math.min(2500, next));
  }, 1000);
}

export function trainerRatingDeltaFromAnalysis(analysis: Pick<AnalyzerResult, "keepAdvantage">, correct: boolean) {
  return trainerRatingDelta(analysis, correct);
}

export function calculateTrainerStats(attempts: TrainerAttempt[]): TrainerStats {
  const sorted = [...attempts].sort((a, b) => (a.attemptedAt ?? "").localeCompare(b.attemptedAt ?? ""));
  const correct = sorted.filter((attempt) => attempt.correct).length;
  let running = 0;
  let longestStreak = 0;
  for (const attempt of sorted) {
    running = attempt.correct ? running + 1 : 0;
    longestStreak = Math.max(longestStreak, running);
  }
  const lastRatedAttempt = [...sorted].reverse().find((attempt) => typeof attempt.ratingAfter === "number");
  return {
    attempts: sorted.length,
    correct,
    accuracy: sorted.length ? correct / sorted.length : 0,
    currentStreak: running,
    longestStreak,
    rating: lastRatedAttempt?.ratingAfter ?? calculateTrainerRating(sorted),
    recentResults: sorted.slice(-7).reverse().map((attempt) => ({
      attemptedAt: attempt.attemptedAt ?? "",
      correct: attempt.correct
    }))
  };
}

export function publicTrainerHand(row: {
  id: string;
  deck_id: string;
  deck_name: string;
  format: string;
  hand: string[] | string;
  play_draw: PlayDraw;
  answered_at?: string | null;
  pending_answer?: TrainerAnswer | null;
  analysis_status?: "pending" | "running" | "ready" | "failed" | null;
  analysis_error?: string | null;
  correct_answer?: TrainerAnswer | null;
  explanation_json?: TrainerExplanation | null;
}, selectedAnswer?: TrainerAnswer, presentation?: {
  cardImages?: TrainerCardImageMap;
  cards?: TrainerCardPresentation[];
  imageWarnings?: string[];
}): PublicTrainerHand {
  const hand = Array.isArray(row.hand) ? row.hand : JSON.parse(row.hand);
  const completed = Boolean(row.answered_at);
  const reveal =
    completed && row.correct_answer && row.explanation_json && selectedAnswer
      ? {
          correct: selectedAnswer === row.correct_answer,
          correctAnswer: row.correct_answer,
          explanation: row.explanation_json
        }
      : undefined;
  return {
    id: row.id,
    deckId: row.deck_id,
    deckName: row.deck_name,
    format: row.format,
    hand,
    playDraw: row.play_draw,
    cardImages: presentation?.cardImages && Object.keys(presentation.cardImages).length ? presentation.cardImages : undefined,
    cards: presentation?.cards,
    imageWarnings: presentation?.imageWarnings?.length ? presentation.imageWarnings : undefined,
    completed,
    selectedAnswer,
    pendingAnswer: row.pending_answer ?? undefined,
    analysisStatus: row.analysis_status ?? (completed ? "ready" : "pending"),
    analysisError: row.analysis_error ?? undefined,
    reveal
  };
}

export function trainerAttemptFromRow(row: {
  selected_answer: TrainerAnswer;
  is_correct: boolean;
  rating_before?: number | null;
  rating_after?: number | null;
  rated?: boolean | null;
  rating_delta?: number | null;
  attempted_at?: string | null;
}): TrainerAttempt {
  return {
    selectedAnswer: row.selected_answer,
    correct: row.is_correct,
    ratingBefore: row.rating_before ?? undefined,
    ratingAfter: row.rating_after ?? undefined,
    rated: row.rated ?? (row.rating_delta ?? 0) !== 0,
    ratingDelta: row.rating_delta ?? undefined,
    attemptedAt: row.attempted_at ?? undefined
  };
}
