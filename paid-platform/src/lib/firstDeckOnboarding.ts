import { inferDeckName, parseDecklist, type ParsedDeck } from "./deckParser";
import { normalizeFormat } from "./formats";

export type OnboardingDeckReview = {
  suggestedName: string;
  mainCount: number;
  sideboardCount: number;
  uniqueCount: number;
  status: "ready" | "partial" | "needs-correction";
  messages: string[];
};

export const onboardingExampleDeck = `Deck
4 Monastery Swiftspear
4 Lightning Strike
4 Play with Fire
4 Phoenix Chick
4 Kumano Faces Kakkazan
4 Charming Scoundrel
4 Imodane's Recruiter
4 Warden of the Inner Sky
4 Inspiring Vantage
4 Battlefield Forge
12 Mountain
8 Plains

Sideboard
3 Destroy Evil
2 Lithomantic Barrage`;

export function buildOnboardingReview(decklist: string, format: string, parsed: ParsedDeck = parseDecklist(decklist)): OnboardingDeckReview {
  const messages: string[] = [];
  const normalizedFormat = normalizeFormat(format);

  if (parsed.mainCount === 0) {
    messages.push("We could not find any main-deck cards. Add quantities before each card name, such as \"4 Lightning Bolt.\"");
    return {
      suggestedName: inferDeckName(decklist),
      mainCount: 0,
      sideboardCount: parsed.sideboardCount,
      uniqueCount: parsed.cards.length,
      status: "needs-correction",
      messages
    };
  }

  messages.push(`${parsed.mainCount} cards in main deck`);
  messages.push(`${parsed.sideboardCount} cards in sideboard`);

  const expected = normalizedFormat === "Draft" ? 40 : normalizedFormat === "Commander" ? 99 : normalizedFormat === "Brawl" ? 59 : 60;
  const minimum = normalizedFormat === "Draft" ? 36 : normalizedFormat === "Commander" ? 90 : normalizedFormat === "Brawl" ? 54 : 54;

  if (parsed.mainCount >= expected) {
    messages.push(`This appears to be a complete ${normalizedFormat} deck.`);
  } else if (parsed.mainCount >= minimum) {
    messages.push(`Your deck has ${parsed.mainCount} main-deck cards. You can continue, but check the final count.`);
  } else {
    messages.push(`Deck is incomplete. You can continue, but posture and recommendations may be limited.`);
  }

  return {
    suggestedName: inferDeckName(decklist),
    mainCount: parsed.mainCount,
    sideboardCount: parsed.sideboardCount,
    uniqueCount: parsed.cards.length,
    status: parsed.mainCount >= minimum ? "ready" : "partial",
    messages: messages.slice(0, 5)
  };
}
