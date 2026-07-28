export type AnalyzerMode = "account" | "guest" | "sample";

export function shouldPersistHandSession(mode: AnalyzerMode) {
  return mode === "account";
}
