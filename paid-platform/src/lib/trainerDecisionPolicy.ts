import type { AnalyzerResult } from "./analyzer";

export type TrainerPolicyAnswer = "keep" | "mulligan";

export const trainerDecisionPolicy = {
  mulliganThreshold: -0.035,
  closeMargin: 0.03,
  strongMargin: 0.08
} as const;

export function trainerAnswerFromPolicy(analysis: Pick<AnalyzerResult, "recommendationTone" | "keepAdvantage">): TrainerPolicyAnswer {
  if (analysis.recommendationTone === "bad") return "mulligan";
  if (typeof analysis.keepAdvantage === "number" && Number.isFinite(analysis.keepAdvantage)) {
    return analysis.keepAdvantage < trainerDecisionPolicy.mulliganThreshold ? "mulligan" : "keep";
  }
  return "keep";
}

export function trainerDecisionConfidence(margin: number) {
  const absolute = Math.abs(Number.isFinite(margin) ? margin : 0);
  return absolute < trainerDecisionPolicy.closeMargin
    ? "close" as const
    : absolute <= trainerDecisionPolicy.strongMargin
      ? "moderate" as const
      : "strong" as const;
}

export function trainerRatingDelta(analysis: Pick<AnalyzerResult, "keepAdvantage">, correct: boolean) {
  const margin = Math.abs(analysis.keepAdvantage ?? 0);
  if (!Number.isFinite(margin) || margin < trainerDecisionPolicy.closeMargin) return 0;
  const confidenceScale = Math.max(0, Math.min(1, (margin - trainerDecisionPolicy.closeMargin) / (0.09 - trainerDecisionPolicy.closeMargin)));
  return correct ? Math.round(6 + confidenceScale * 10) : -Math.round(3 + confidenceScale * 11);
}
