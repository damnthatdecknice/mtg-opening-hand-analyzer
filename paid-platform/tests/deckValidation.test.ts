import assert from "node:assert/strict";
import { validateDeckConstruction } from "../src/lib/deckValidation";
import type { ManaCurveCardData } from "../src/lib/manaCurve";

function card(
  name: string,
  legalities: Record<string, string> = { modern: "legal", commander: "legal", vintage: "legal" },
  overrides: Partial<ManaCurveCardData> = {}
): ManaCurveCardData {
  const basicTypes: Record<string, string> = {
    Plains: "Basic Land - Plains",
    Island: "Basic Land - Island",
    Swamp: "Basic Land - Swamp",
    Mountain: "Basic Land - Mountain",
    Forest: "Basic Land - Forest",
    Wastes: "Basic Land"
  };
  return {
    name,
    manaValue: 1,
    manaCost: "{R}",
    typeLine: basicTypes[name] ?? "Instant",
    isLand: Boolean(basicTypes[name]),
    legalities,
    ...overrides
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

const duplicateRows = validateDeckConstruction("Deck\n3 Lightning Bolt\n3 Lightning Bolt\n54 Mountain", cardData, "Modern");
assert.ok(
  duplicateRows.issues.some((issue) => issue.code === "COPY_LIMIT" && issue.detail.includes("6 times")),
  "duplicate rows aggregate before copy-limit checks"
);

const combinedRowsAllowed = validateDeckConstruction("Deck\n2 Lightning Bolt\n2 lightning bolt\n56 Mountain", cardData, "Modern");
assert.ok(
  combinedRowsAllowed.issues.some((issue) => issue.code === "DUPLICATE_ROWS_COMBINED"),
  "allowed duplicate rows are disclosed as combined"
);

const registeredTotal = validateDeckConstruction("Deck\n4 Lightning Bolt\n56 Mountain\n\nSideboard\n1 Lightning Bolt", cardData, "Modern");
assert.ok(
  registeredTotal.issues.some((issue) => issue.code === "COPY_LIMIT" && issue.detail.includes("4 main + 1 sideboard")),
  "copy limits apply across main deck and sideboard together"
);

const sideboardOnlyCopies = validateDeckConstruction("Deck\n60 Mountain\n\nSideboard\n5 Spell Pierce", cardData, "Modern");
assert.ok(
  sideboardOnlyCopies.issues.some((issue) => issue.code === "COPY_LIMIT" && issue.cardName === "Spell Pierce"),
  "sideboard-only over-limit rows are checked"
);

const manyBasicData = new Map(cardData);
manyBasicData.set("forest", card("Forest"));
const manyBasics = validateDeckConstruction("Deck\n60 Mountain\n20 Forest", manyBasicData, "Modern");
assert.ok(!manyBasics.issues.some((issue) => issue.code === "COPY_LIMIT"), "basic lands are unlimited by type line or fallback");

const ratsData = new Map(cardData);
ratsData.set(
  "relentless rats",
  card("Relentless Rats", { modern: "legal", commander: "legal" }, {
    oracleText: "A deck can have any number of cards named Relentless Rats."
  })
);
const anyNumber = validateDeckConstruction("Deck\n20 Relentless Rats\n40 Mountain", ratsData, "Modern");
assert.ok(!anyNumber.issues.some((issue) => issue.code === "COPY_LIMIT"), "oracle text can allow any number of copies");

const nazgulData = new Map(cardData);
nazgulData.set(
  "nazgul",
  card("Nazgul", { modern: "legal", commander: "legal" }, {
    oracleText: "A deck can have up to nine cards named Nazgul."
  })
);
assert.ok(
  !validateDeckConstruction("Deck\n9 Nazgul\n51 Mountain", nazgulData, "Modern").issues.some((issue) => issue.code === "COPY_LIMIT"),
  "oracle text can allow a specific higher maximum"
);
assert.ok(
  validateDeckConstruction("Deck\n10 Nazgul\n50 Mountain", nazgulData, "Modern").issues.some((issue) => issue.code === "COPY_LIMIT"),
  "oracle text maximums are enforced"
);

const unknownTooMany = validateDeckConstruction("Deck\n5 Mystery Card\n55 Mountain", cardData, "Modern");
assert.ok(
  unknownTooMany.issues.some((issue) => issue.code === "UNKNOWN_COPY_RULE"),
  "unknown cards over four copies warn instead of assuming a special exception"
);

const splitData = new Map(cardData);
splitData.set(
  "fire // ice",
  card("Fire // Ice", { modern: "legal" }, {
    manaValue: 4,
    manaCost: "{1}{R} // {1}{U}",
    layout: "split",
    faces: [
      { name: "Fire", manaValue: 2, manaCost: "{1}{R}", typeLine: "Instant", oracleText: "Fire deals 2 damage divided as you choose." },
      { name: "Ice", manaValue: 2, manaCost: "{1}{U}", typeLine: "Instant", oracleText: "Tap target permanent. Draw a card." }
    ]
  })
);
splitData.set("fire", splitData.get("fire // ice") as ManaCurveCardData);
splitData.set("ice", splitData.get("fire // ice") as ManaCurveCardData);
const splitAliases = validateDeckConstruction("Deck\n2 Fire\n2 Ice\n1 Fire // Ice\n55 Mountain", splitData, "Modern");
assert.ok(
  splitAliases.issues.some((issue) => issue.code === "COPY_LIMIT" && issue.cardName === "Fire // Ice"),
  "split-card face names aggregate under the canonical physical card"
);

const restrictedData = new Map(cardData);
restrictedData.set("black lotus", card("Black Lotus", { vintage: "restricted" }));
const restricted = validateDeckConstruction("Deck\n1 Black Lotus\n59 Mountain\n\nSideboard\n1 Black Lotus", restrictedData, "Vintage");
assert.ok(
  restricted.issues.some((issue) => issue.code === "RESTRICTED_CARD" && issue.detail.includes("1 main + 1 sideboard")),
  "restricted cards are enforced across the registered Vintage deck"
);

console.log("deckValidation tests passed");
