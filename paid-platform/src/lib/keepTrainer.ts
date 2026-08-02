import type { AnalyzerResult, CardLookup, PlayDraw } from "./analyzer";

export type TrainerAnswer = "keep" | "mulligan";

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
};

export type TrainerAttempt = {
  selectedAnswer: TrainerAnswer;
  correct: boolean;
  ratingBefore?: number;
  ratingAfter?: number;
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
  if (analysis.recommendationTone === "bad") {
    return "mulligan";
  }
  if (analysis.keepAdvantage !== undefined && analysis.keepAdvantage < -0.035) {
    return "mulligan";
  }
  return "keep";
}

export function trainerExplanationFromAnalysis(
  analysis: AnalyzerResult,
  answer: TrainerAnswer
): TrainerExplanation {
  const factors = analysis.scoreFactors
    .slice(0, 3)
    .map((factor) => `${factor.label}: ${factor.value > 0 ? "+" : ""}${factor.value}`)
    .filter(Boolean);
  const risk =
    analysis.watchouts.find((note) => /land|color|cast|mulligan|failure|flood/i.test(note)) ??
    "The main risk is whether the hand converts its early mana into useful action.";

  return {
    verdict: answer,
    headline:
      answer === "keep"
        ? "Keep. This hand grades above the mulligan baseline for this deck."
        : "Mulligan. The replacement-hand baseline is stronger than keeping this seven.",
    lesson:
      answer === "keep"
        ? "A keepable hand turns its lands, colors, and early cards into a real sequence."
        : "A hand can contain useful cards and still be a mulligan when mana, timing, or risk profile breaks down.",
    keyFactors: factors.length
      ? factors
      : [`${analysis.landsInHand} land(s), ${analysis.effectiveLandsInHand} effective source(s), score ${analysis.handTextureScore}/100.`],
    supportingPoints: [
      `Opening Hand Score: ${analysis.handTextureScore}/100.`,
      `Severe failure risk: ${Math.round(analysis.severeFailureProbability * 100)}%.`,
      analysis.mulligan
        ? `Mulligan baseline: ${analysis.mulligan.average.toFixed(1)}.`
        : "Mulligan baseline was not available for this hand."
    ],
    watchFor: analysis.watchouts.slice(0, 3),
    risk,
    score: analysis.handTextureScore,
    recommendation: analysis.recommendation,
    percentile: analysis.deckRelativePercentile,
    severeFailureProbability: analysis.severeFailureProbability,
    keepAdvantage: analysis.keepAdvantage,
    scoringVersion: analysis.scoringVersion
  };
}

export function calculateTrainerRating(attempts: TrainerAttempt[]) {
  return attempts.reduce((rating, attempt) => {
    const next = rating + (attempt.correct ? 14 : -11);
    return Math.max(100, Math.min(2500, next));
  }, 1000);
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
    reveal
  };
}

export function trainerAttemptFromRow(row: {
  selected_answer: TrainerAnswer;
  is_correct: boolean;
  rating_before?: number | null;
  rating_after?: number | null;
  attempted_at?: string | null;
}): TrainerAttempt {
  return {
    selectedAnswer: row.selected_answer,
    correct: row.is_correct,
    ratingBefore: row.rating_before ?? undefined,
    ratingAfter: row.rating_after ?? undefined,
    attemptedAt: row.attempted_at ?? undefined
  };
}
