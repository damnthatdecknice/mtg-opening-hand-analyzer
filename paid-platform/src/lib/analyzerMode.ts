export type AnalyzerMode = "account" | "guest" | "sample";
export type AnalyzerStep = "deck" | "hand" | "screenshot" | "results";

export function analyzerStepFromParam(value: string | null): AnalyzerStep {
  if (value === "deck" || value === "hand" || value === "screenshot" || value === "results") {
    return value;
  }

  return "deck";
}

export function shouldPersistHandSession(mode: AnalyzerMode) {
  return mode === "account";
}
