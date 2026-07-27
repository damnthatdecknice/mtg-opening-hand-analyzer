import assert from "node:assert/strict";
import {
  buildManaCurveAnalysis,
  extractTournamentCurveCandidateNames,
  primaryCardType,
  type ManaCurveCardData
} from "../src/lib/manaCurve";
import type { MetagameDeck } from "../src/lib/metagame";

function card(
  name: string,
  manaValue: number,
  typeLine: string,
  colors: string[] = [],
  legalities: Record<string, string> = { modern: "legal", pioneer: "legal", standard: "legal" }
): ManaCurveCardData {
  return {
    name,
    manaValue,
    typeLine,
    colors,
    isLand: /\bland\b/i.test(typeLine),
    legalities
  };
}

function splitCard(
  name: string,
  typeLine: string,
  faces: Array<{ name: string; manaValue: number; typeLine: string }>,
  colors: string[] = [],
  legalities: Record<string, string> = { modern: "legal", pioneer: "legal", standard: "legal" }
): ManaCurveCardData {
  return {
    name,
    manaValue: faces.reduce((sum, face) => sum + face.manaValue, 0),
    typeLine,
    colors,
    faces,
    isLand: /\bland\b/i.test(typeLine),
    legalities
  };
}

function data(cards: ManaCurveCardData[]) {
  return new Map(cards.map((entry) => [entry.name.toLowerCase(), entry]));
}

const baseCards = data([
  card("Memnite", 0, "Artifact Creature - Construct"),
  card("Monastery Swiftspear", 1, "Creature - Human Monk", ["R"]),
  card("Lightning Strike", 2, "Instant", ["R"]),
  card("Expressive Iteration", 2, "Sorcery", ["U", "R"]),
  card("Fable of the Mirror-Breaker", 3, "Enchantment - Saga", ["R"]),
  card("The Wandering Emperor", 4, "Legendary Planeswalker - Emperor", ["W"]),
  card("Force of Negation", 3, "Instant", ["U"]),
  card("Fireball", 1, "Sorcery", ["R"]),
  card("Boom // Bust", 2, "Sorcery", ["R"]),
  card("Spikefield Hazard", 1, "Instant", ["R"]),
  card("Bonecrusher Giant", 3, "Creature - Giant", ["R"]),
  card("Sol Talisman", 0, "Artifact"),
  card("Invasion of Gobakhan", 2, "Battle - Siege", ["W"]),
  card("Mountain", 0, "Basic Land - Mountain"),
  card("Island", 0, "Basic Land - Island"),
  card("Duress", 1, "Sorcery", ["B"], { modern: "legal", pioneer: "legal", standard: "not_legal" }),
  card("Opt", 1, "Instant", ["U"]),
  card("Tournament Bolt", 1, "Instant", ["R"]),
  card("Off Color Charm", 2, "Instant", ["G"])
]);

const roomCards = data([
  splitCard(
    "Roaring Furnace // Steaming Sauna",
    "Enchantment - Room",
    [
      { name: "Roaring Furnace", manaValue: 2, typeLine: "Enchantment - Room" },
      { name: "Steaming Sauna", manaValue: 7, typeLine: "Enchantment - Room" }
    ],
    ["U", "R"]
  ),
  card("Steam Vents", 0, "Land - Island Mountain")
]);

const decklist = `Deck
4 Memnite
4 Monastery Swiftspear
4 Lightning Strike
2 Expressive Iteration
2 Fable of the Mirror-Breaker
1 The Wandering Emperor
1 Force of Negation
1 Fireball
1 Boom // Bust
1 Spikefield Hazard
1 Sol Talisman
1 Invasion of Gobakhan
10 Mountain
4 Island

Sideboard
2 Opt
2 Duress
1 Off Color Charm`;

function modernDeck(main: Array<{ name: string; qty: number }>): MetagameDeck {
  return {
    player: "test",
    eventName: "Challenge",
    eventDate: "2026-07-20",
    format: "Modern",
    archetype: "Izzet Prowess",
    colors: ["U", "R"],
    rank: 4,
    sourceUrl: "https://example.com",
    main,
    sideboard: []
  };
}

const similarDecks = [
  modernDeck([
    { name: "Monastery Swiftspear", qty: 4 },
    { name: "Lightning Strike", qty: 4 },
    { name: "Expressive Iteration", qty: 4 },
    { name: "Tournament Bolt", qty: 4 },
    { name: "Opt", qty: 4 }
  ]),
  modernDeck([
    { name: "Monastery Swiftspear", qty: 4 },
    { name: "Lightning Strike", qty: 4 },
    { name: "Expressive Iteration", qty: 4 },
    { name: "Tournament Bolt", qty: 4 },
    { name: "Opt", qty: 4 }
  ])
];

const analysis = buildManaCurveAnalysis(decklist, baseCards, {
  format: "Modern",
  metagameDecks: similarDecks
});

assert.equal(analysis.curve.find((row) => row.manaValue === "0")?.spells, 5, "0-mana bucket is copy weighted");
assert.equal(analysis.curve.find((row) => row.manaValue === "1")?.spells, 6, "1-mana bucket includes X spells as X=0");
assert.equal(analysis.curve.find((row) => row.manaValue === "2")?.spells, 8, "2-mana bucket includes split and battle cards");
assert.equal(analysis.landCount, 14, "lands are excluded from spell curve and counted separately");
assert.equal(analysis.spellCount, 23, "spell count excludes lands");
assert.equal(analysis.typeBreakdown.creatures, 8, "artifact creatures count once as creatures");
assert.equal(primaryCardType(card("Vault Skirge", 1, "Artifact Creature - Phyrexian Imp")), "creatures");
assert.equal(analysis.typeBreakdown.artifacts, 1, "noncreature artifacts still count as artifacts");
assert.equal(analysis.typeBreakdown.battles, 1, "battles are tracked");
assert.equal(analysis.averageManaValue.toFixed(2), "1.52", "average mana value is copy weighted");
assert.equal(analysis.medianManaValue, 2, "median mana value is weighted by copies");

const adventure = buildManaCurveAnalysis("Deck\n1 Bonecrusher Giant\n1 Mountain", baseCards, { format: "Modern" });
assert.equal(adventure.curve.find((row) => row.manaValue === "3")?.spells, 1, "adventure cards use their Scryfall spell mana value");

const sideboard = buildManaCurveAnalysis(decklist, baseCards, { format: "Modern", scope: "sideboard" });
assert.equal(sideboard.totalCards, 5, "sideboard scope counts only sideboard cards");
assert.equal(sideboard.curve.find((row) => row.manaValue === "1")?.spells, 4, "sideboard scope has its own curve");

const withSideboard = buildManaCurveAnalysis(decklist, baseCards, { format: "Modern", scope: "main+sideboard" });
assert.equal(withSideboard.totalCards, 42, "main plus sideboard scope includes both sections");

const noEarlyDeck = `Deck
4 Fable of the Mirror-Breaker
4 The Wandering Emperor
4 Force of Negation
4 Boom // Bust
10 Mountain
10 Island`;
const noEarly = buildManaCurveAnalysis(noEarlyDeck, baseCards, { format: "Modern" });
assert.ok(noEarly.observations.some((row) => row.title === "Too few early plays"), "observations change when curve gets slower");

assert.ok(
  extractTournamentCurveCandidateNames(decklist, similarDecks).includes("Tournament Bolt"),
  "similar tournament decks produce candidate lookup names"
);
assert.ok(
  analysis.suggestions.some((row) => row.cardName === "Tournament Bolt" && row.source === "similar-tournament-decks"),
  "recommendations can use similar tournament deck candidates"
);
assert.ok(!analysis.suggestions.some((row) => row.cardName === "Off Color Charm"), "recommendations reject off-color candidates");

const standard = buildManaCurveAnalysis(decklist, baseCards, { format: "Standard" });
assert.ok(!standard.suggestions.some((row) => row.cardName === "Duress"), "recommendations reject format-illegal cards");

const maxedOpt = buildManaCurveAnalysis(
  `Deck
4 Monastery Swiftspear
4 Lightning Strike
4 Opt
10 Mountain
10 Island

Sideboard
2 Opt`,
  baseCards,
  { format: "Modern" }
);
assert.ok(!maxedOpt.suggestions.some((row) => row.cardName === "Opt"), "recommendations respect normal copy limits");

const roomAnalysis = buildManaCurveAnalysis(
  `Deck
2 Roaring Furnace // Steaming Sauna
4 Steam Vents`,
  roomCards,
  { format: "Standard" }
);
assert.equal(roomAnalysis.curve.find((row) => row.manaValue === "2")?.spells, 2, "split rooms count the cheap face");
assert.equal(roomAnalysis.curve.find((row) => row.manaValue === "7+")?.spells, 2, "split rooms count the expensive face");
assert.equal(roomAnalysis.spellCount, 4, "split nonland cards are represented as separate curve faces");
assert.equal(roomAnalysis.landCount, 4, "split face handling does not disturb land counting");
assert.equal(roomAnalysis.typeBreakdown.enchantments, 4, "split room faces retain their primary type");

console.log("manaCurve tests passed");
