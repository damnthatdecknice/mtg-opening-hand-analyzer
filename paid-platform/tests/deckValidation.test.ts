import assert from "node:assert/strict";
import { validateDeckConstruction } from "../src/lib/deckValidation";
import type { ManaCurveCardData } from "../src/lib/manaCurve";

function card(name: string, legalities: Record<string, string> = { modern: "legal", commander: "legal" }): ManaCurveCardData {
  return {
    name,
    manaValue: 1,
    manaCost: "{R}",
    typeLine: name === "Mountain" ? "Basic Land - Mountain" : "Instant",
    isLand: name === "Mountain",
    legalities
  };
}

const completeModern = `Deck
4 Lightning Bolt
4 Ragavan, Nimble Pilferer
4 Dragon's Rage Channeler
4 Mishra's Bauble
4 Monastery Swiftspear
4 Lava Dart
4 Unholy Heat
4 Soul-Scar Mage
4 Expressive Iteration
4 Steam Vents
4 Spirebluff Canal
4 Scalding Tarn
4 Mountain
4 Island

Sideboard
4 Spell Pierce
4 Annul
4 Surgical Extraction
3 Blood Moon`;

const cardData = new Map(
  [
    "Lightning Bolt",
    "Ragavan, Nimble Pilferer",
    "Dragon's Rage Channeler",
    "Mishra's Bauble",
    "Monastery Swiftspear",
    "Lava Dart",
    "Unholy Heat",
    "Soul-Scar Mage",
    "Expressive Iteration",
    "Steam Vents",
    "Spirebluff Canal",
    "Scalding Tarn",
    "Mountain",
    "Island",
    "Spell Pierce",
    "Annul",
    "Surgical Extraction",
    "Blood Moon"
  ].map((name) => [name.toLowerCase(), card(name)])
);

assert.equal(
  validateDeckConstruction(completeModern, cardData, "Modern").isCompleteEnoughForPosture,
  true,
  "complete verified constructed decks can receive posture and recommendations"
);

const incomplete = validateDeckConstruction("Deck\n4 Lightning Bolt\n4 Mountain", cardData, "Modern");
assert.equal(incomplete.isCompleteEnoughForPosture, false, "materially incomplete constructed decks withhold posture");
assert.ok(incomplete.issues.some((issue) => issue.code === "MAIN_DECK_INCOMPLETE"), "incomplete decks report a count issue");

const unknown = validateDeckConstruction("Deck\n4 Definitely Not A Card\n56 Mountain", cardData, "Modern");
assert.equal(unknown.isCompleteEnoughForPosture, false, "unknown cards withhold posture");
assert.ok(unknown.issues.some((issue) => issue.code === "UNKNOWN_CARD"), "unknown cards are reported");

const copyLimit = validateDeckConstruction("Deck\n5 Lightning Bolt\n55 Mountain", cardData, "Modern");
assert.ok(copyLimit.issues.some((issue) => issue.code === "COPY_LIMIT"), "nonbasic four-copy violations are reported");

const sideboardLimit = validateDeckConstruction(`${completeModern}\n1 Lightning Bolt`, cardData, "Modern");
assert.ok(sideboardLimit.issues.some((issue) => issue.code === "SIDEBOARD_TOO_LARGE"), "oversized sideboards are reported");

const bannedData = new Map(cardData);
bannedData.set("lightning bolt", card("Lightning Bolt", { modern: "banned" }));
const illegal = validateDeckConstruction(completeModern, bannedData, "Modern");
assert.ok(illegal.issues.some((issue) => issue.code === "BANNED_CARD"), "available format legality warnings are reported");

const commander = validateDeckConstruction("Deck\n1 Lightning Bolt\n98 Mountain", cardData, "Commander");
assert.ok(
  commander.issues.some((issue) => issue.code === "COMMANDER_IDENTITY_UNVERIFIED"),
  "Commander checks include a manual-review caveat"
);

console.log("deckValidation tests passed");
