export const deckFormatOptions = [
  "Standard",
  "Pioneer",
  "Modern",
  "Legacy",
  "Pauper",
  "Draft",
  "Commander",
  "Brawl",
  "Vintage",
  "Penny Dreadful",
  "Premodern",
  "Historic",
  "Explorer"
] as const;

export type DeckFormatOption = (typeof deckFormatOptions)[number];

export const formatLegalities: Record<string, string> = {
  standard: "standard",
  pioneer: "pioneer",
  modern: "modern",
  legacy: "legacy",
  pauper: "pauper",
  vintage: "vintage",
  historic: "historic",
  explorer: "explorer",
  commander: "commander",
  brawl: "brawl",
  "penny dreadful": "penny",
  premodern: "premodern"
};

export function normalizeFormat(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return "Standard";
  }
  return deckFormatOptions.find((format) => format.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
}
