import assert from "node:assert/strict";
import {
  buildManaCurveAnalysis,
  detectFunctionalRoles,
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
  legalities: Record<string, string> = { modern: "legal", pioneer: "legal", standard: "legal" },
  oracleText = ""
): ManaCurveCardData {
  return {
    name,
    manaValue,
    typeLine,
    oracleText,
    colors,
    isLand: /\bland\b/i.test(typeLine),
    legalities
  };
}

function splitCard(
  name: string,
  typeLine: string,
  faces: Array<{ name: string; manaValue: number; typeLine: string; manaCost?: string }>,
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
  card("Opt", 1, "Instant", ["U"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Scry 1. Draw a card."),
  card("Tournament Bolt", 1, "Instant", ["R"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Tournament Bolt deals 2 damage to any target."),
  card("Off Color Charm", 2, "Instant", ["G"])
]);

const postureCards = data([
  card("Savannah Cub", 1, "Creature - Cat", ["G"]),
  card("Swift Scout", 1, "Creature - Scout", ["R"]),
  card("Lightning Strike", 2, "Instant", ["R"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Lightning Strike deals 3 damage to any target."),
  card("Counterspell", 2, "Instant", ["U"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Counter target spell."),
  card("Opt", 1, "Instant", ["U"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Scry 1. Draw a card."),
  card("Supreme Verdict", 4, "Sorcery", ["W", "U"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Destroy all creatures."),
  card("Memory Deluge", 4, "Instant", ["U"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Look at the top X cards. Put two of them into your hand."),
  card("Llanowar Elves", 1, "Creature - Elf Druid", ["G"], { modern: "legal", pioneer: "legal", standard: "legal" }, "{T}: Add {G}."),
  card("Titan of Industry", 7, "Creature - Elemental", ["G"]),
  card("Reanimate", 1, "Sorcery", ["B"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Return target creature card from a graveyard to the battlefield."),
  card("Griselbrand", 8, "Legendary Creature - Demon", ["B"]),
  card("Entomb", 1, "Instant", ["B"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Search your library for a card and put that card into your graveyard."),
  card("Addendum Lesson", 2, "Instant", ["W"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Addendum - If you cast this spell during your main phase, draw a card."),
  card("Sacrifice Outlet", 2, "Creature - Vampire", ["B"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Sacrifice another creature: Scry 1."),
  card("Temple Garden", 0, "Land - Forest Plains"),
  card("Forest", 0, "Basic Land - Forest"),
  card("Island", 0, "Basic Land - Island"),
  card("Plains", 0, "Basic Land - Plains"),
  card("Swamp", 0, "Basic Land - Swamp"),
  card("Mountain", 0, "Basic Land - Mountain")
]);

const roomCards = data([
  splitCard(
    "Roaring Furnace // Steaming Sauna",
    "Enchantment - Room",
    [
      { name: "Roaring Furnace", manaValue: 7, manaCost: "{1}{R}", typeLine: "Enchantment - Room" },
      { name: "Steaming Sauna", manaValue: 7, manaCost: "{4}{U}", typeLine: "Enchantment - Room" }
    ],
    ["U", "R"]
  ),
  card("Steam Vents", 0, "Land - Island Mountain")
]);

const staleRoomCards = data([
  {
    name: "Roaring Furnace // Steaming Sauna",
    manaValue: 7,
    manaCost: "{1}{R} // {4}{U}",
    typeLine: "Enchantment - Room",
    colors: ["U", "R"],
    faces: [
      { name: "Roaring Furnace", manaValue: 7, typeLine: "Enchantment - Room" },
      { name: "Steaming Sauna", manaValue: 7, typeLine: "Enchantment - Room" }
    ],
    isLand: false,
    legalities: { modern: "legal", pioneer: "legal", standard: "legal" }
  },
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
    { name: "Fable of the Mirror-Breaker", qty: 2 },
    { name: "Fireball", qty: 1 },
    { name: "Spikefield Hazard", qty: 1 },
    { name: "Tournament Bolt", qty: 4 },
    { name: "Opt", qty: 4 }
  ]),
  modernDeck([
    { name: "Monastery Swiftspear", qty: 4 },
    { name: "Lightning Strike", qty: 4 },
    { name: "Expressive Iteration", qty: 4 },
    { name: "Fable of the Mirror-Breaker", qty: 2 },
    { name: "Fireball", qty: 1 },
    { name: "Spikefield Hazard", qty: 1 },
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
assert.ok(noEarly.observations.some((row) => /early action|one-mana/i.test(row.title)), "observations change when curve gets slower");
assert.ok(noEarly.observations.every((row) => row.evidence.length), "observations expose evidence");

assert.ok(
  extractTournamentCurveCandidateNames(decklist, similarDecks).includes("Tournament Bolt"),
  "similar tournament decks produce candidate lookup names"
);
assert.ok(
  !extractTournamentCurveCandidateNames(decklist, [
    modernDeck([
      { name: "Monastery Swiftspear", qty: 4 },
      { name: "Tournament Bolt", qty: 4 },
      { name: "Opt", qty: 4 }
    ])
  ]).includes("Tournament Bolt"),
  "weak tournament overlap is not treated as a similar shell"
);
assert.ok(
  analysis.suggestions.some((row) => row.cardName === "Tournament Bolt" && row.source === "similar-tournament-decks"),
  "recommendations can use similar tournament deck candidates"
);
const tournamentSuggestion = analysis.suggestions.find((row) => row.cardName === "Tournament Bolt");
assert.equal(tournamentSuggestion?.suggestedQuantity, 4, "recommendations include suggested quantity");
assert.ok(tournamentSuggestion?.supportingDeckCount, "recommendations include supporting list count");
assert.notEqual(tournamentSuggestion?.similarityConfidence, "low", "real shell overlap has usable confidence");
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
assert.equal(roomAnalysis.curve.find((row) => row.manaValue === "5")?.spells, 2, "split rooms count the expensive face");
assert.equal(roomAnalysis.curve.find((row) => row.manaValue === "7+")?.spells, 0, "split rooms do not also count the combined mana value");
assert.deepEqual(
  roomAnalysis.curve.find((row) => row.manaValue === "2")?.cards.enchantments,
  [{ name: "Roaring Furnace", qty: 2 }],
  "curve buckets retain card names for hover tooltips"
);
assert.deepEqual(
  roomAnalysis.curve.find((row) => row.manaValue === "5")?.cards.enchantments,
  [{ name: "Steaming Sauna", qty: 2 }],
  "split card tooltips use the face name in each bucket"
);
assert.equal(roomAnalysis.spellCount, 2, "split nonland cards count once as physical spell cards");
assert.equal(roomAnalysis.physicalSpellCount, 2, "physical spell count is explicit");
assert.equal(roomAnalysis.castModeCount, 4, "split nonland cards are represented as separate cast modes");
assert.equal(roomAnalysis.landCount, 4, "split face handling does not disturb land counting");
assert.equal(roomAnalysis.typeBreakdown.enchantments, 2, "physical type breakdown counts Room cards once");
assert.equal(roomAnalysis.physicalTypeBreakdown.enchantments, 2, "physical type breakdown is explicit");
assert.equal(roomAnalysis.castModeAverageManaValue.toFixed(2), "3.50", "cast-mode average can differ from physical average");
assert.equal(roomAnalysis.averageManaValue.toFixed(2), "2.00", "physical average uses the lowest castable mode for modal cards");

const staleRoomAnalysis = buildManaCurveAnalysis(
  `Deck
4 Roaring Furnace // Steaming Sauna
4 Steam Vents`,
  staleRoomCards,
  { format: "Standard" }
);
assert.equal(staleRoomAnalysis.curve.find((row) => row.manaValue === "2")?.spells, 4, "stale split face cmc still uses parent split cost for cheap face");
assert.equal(staleRoomAnalysis.curve.find((row) => row.manaValue === "5")?.spells, 4, "stale split face cmc still uses parent split cost for expensive face");
assert.equal(staleRoomAnalysis.curve.find((row) => row.manaValue === "7+")?.spells, 0, "stale split face cmc never creates a parent 7+ bucket");

const aggroPosture = buildManaCurveAnalysis(
  `Deck
8 Savannah Cub
8 Swift Scout
8 Lightning Strike
16 Mountain
8 Forest`,
  postureCards,
  { format: "Pioneer" }
);
assert.equal(aggroPosture.posture.posture, "aggro", "low curve threat decks classify as aggro");
assert.ok(
  aggroPosture.observations.some((row) => row.expectedRange && row.measuredValue !== undefined),
  "contextual observations include measured values and expected ranges"
);

const controlPosture = buildManaCurveAnalysis(
  `Deck
4 Counterspell
4 Opt
4 Supreme Verdict
8 Memory Deluge
2 Titan of Industry
10 Island
8 Plains
6 Temple Garden`,
  postureCards,
  { format: "Pioneer" }
);
assert.equal(controlPosture.posture.posture, "control", "interaction, sweepers, draw, and lands classify as control");
assert.ok(
  !controlPosture.observations.some((row) => /cheap threat/i.test(row.title)),
  "control decks are not warned for missing aggro-style cheap threats"
);

const rampPosture = buildManaCurveAnalysis(
  `Deck
10 Llanowar Elves
8 Titan of Industry
16 Forest
4 Temple Garden`,
  postureCards,
  { format: "Modern" }
);
assert.equal(rampPosture.posture.posture, "ramp", "ramp plus expensive payoffs classifies as ramp");

const comboPosture = buildManaCurveAnalysis(
  `Deck
8 Reanimate
6 Entomb
6 Opt
8 Griselbrand
12 Swamp
8 Island`,
  postureCards,
  { format: "Legacy" }
);
assert.equal(comboPosture.posture.posture, "combo", "combo pieces plus tutors/selection classify as combo");

const mixedPosture = buildManaCurveAnalysis(
  `Deck
1 Savannah Cub
1 Supreme Verdict
1 Titan of Industry
1 Reanimate
1 Addendum Lesson
10 Forest
10 Island`,
  postureCards,
  { format: "Modern" }
);
assert.equal(mixedPosture.posture.posture, "unknown", "mixed sparse inputs do not force a posture");

const sideboardOnlyObservations = buildManaCurveAnalysis(
  `Deck
8 Savannah Cub
8 Lightning Strike
16 Mountain

Sideboard
1 Supreme Verdict
1 Titan of Industry
1 Memory Deluge`,
  postureCards,
  { format: "Pioneer", scope: "sideboard" }
);
assert.equal(sideboardOnlyObservations.observations[0]?.title, "Sideboard scope selected", "sideboard-only scope suppresses normal main-deck warnings");

assert.ok(!detectFunctionalRoles(postureCards.get("addendum lesson")).includes("ramp"), "the word addendum is not treated as ramp");
assert.ok(!detectFunctionalRoles(postureCards.get("sacrifice outlet")).includes("combo_enabler"), "sacrifice text alone is not treated as combo");
assert.ok(detectFunctionalRoles(postureCards.get("llanowar elves")).includes("ramp"), "explicit mana production is ramp");

console.log("manaCurve tests passed");
