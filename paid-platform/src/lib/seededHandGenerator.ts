import { parseDecklist } from "./deckParser";

export type SeededOpeningHand = {
  hand: string[];
  seed: string;
};

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string) {
  let state = hashSeed(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 4294967296);
  };
}

export function generateSeededOpeningHand(decklist: string, seed: string): SeededOpeningHand {
  const random = seededRandom(seed);
  const deck = parseDecklist(decklist).cards
    .filter((card) => card.section === "main")
    .flatMap((card) => Array.from({ length: card.qty }, () => card.name));

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex] ?? "", deck[index] ?? ""];
  }

  return {
    hand: deck.slice(0, 7),
    seed
  };
}

export function deterministicIndex(seed: string, length: number) {
  if (length <= 0) {
    return 0;
  }
  return Math.floor(seededRandom(seed)() * length);
}
