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

function land(
  name: string,
  typeLine: string,
  producedMana: string[] = [],
  oracleText = "",
  legalities: Record<string, string> = { modern: "legal", pioneer: "legal", standard: "legal" }
): ManaCurveCardData {
  return {
    name,
    manaValue: 0,
    typeLine,
    oracleText,
    colors: [],
    producedMana,
    isLand: true,
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
    layout: /\broom\b/i.test(typeLine) ? "room" : "split",
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

const sourceCards = data([
  land("Blooming Marsh", "Land", ["B", "G"], "Blooming Marsh enters tapped unless you control two or fewer other lands."),
  land("Cavern of Souls", "Land", ["C"], "As Cavern of Souls enters, choose a creature type. {T}: Add {C}. {T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type."),
  land("Mystic Sanctuary", "Land - Island", [], "Mystic Sanctuary enters the battlefield tapped unless you control three or more other Islands."),
  land("Island", "Basic Land - Island"),
  {
    ...card("Hybrid Lesson", 2, "Instant", ["W", "U"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Draw a card."),
    manaCost: "{W/U}{W/U}"
  }
]);

const postureCards = data([
  card("Savannah Cub", 1, "Creature - Cat", ["G"]),
  card("Swift Scout", 1, "Creature - Scout", ["R"]),
  card("Kird Ape", 1, "Creature - Ape", ["R", "G"]),
  card("Raging Goblin", 1, "Creature - Goblin", ["R"]),
  card("Kumano Faces Kakkazan", 1, "Enchantment - Saga", ["R"]),
  card("Play with Fire", 1, "Instant", ["R"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Play with Fire deals 2 damage to any target. Scry 1."),
  card("Shock", 1, "Instant", ["R"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Shock deals 2 damage to any target."),
  card("Lightning Strike", 2, "Instant", ["R"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Lightning Strike deals 3 damage to any target."),
  card("Counterspell", 2, "Instant", ["U"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Counter target spell."),
  card("Absorb", 3, "Instant", ["W", "U"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Counter target spell. You gain 3 life."),
  card("Opt", 1, "Instant", ["U"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Scry 1. Draw a card."),
  card("Supreme Verdict", 4, "Sorcery", ["W", "U"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Destroy all creatures."),
  card("Sunfall", 5, "Sorcery", ["W"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Exile all creatures."),
  card("Memory Deluge", 4, "Instant", ["U"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Look at the top X cards. Put two of them into your hand."),
  card("Teferi, Hero of Dominaria", 5, "Legendary Planeswalker - Teferi", ["W", "U"]),
  card("March of Otherworldly Light", 1, "Instant", ["W"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Exile target artifact, creature, or enchantment."),
  card("Llanowar Elves", 1, "Creature - Elf Druid", ["G"], { modern: "legal", pioneer: "legal", standard: "legal" }, "{T}: Add {G}."),
  card("Paradise Druid", 2, "Creature - Elf Druid", ["G"], { modern: "legal", pioneer: "legal", standard: "legal" }, "{T}: Add one mana of any color."),
  card(
    "Cultivate",
    3,
    "Sorcery",
    ["G"],
    { modern: "legal", pioneer: "legal", standard: "legal" },
    "Search your library for up to two basic land cards, put one onto the battlefield tapped, and the other into your hand."
  ),
  card("Titan of Industry", 7, "Creature - Elemental", ["G"]),
  card("Ugin, the Spirit Dragon", 8, "Legendary Planeswalker - Ugin", []),
  card("Rampaging Baloths", 6, "Creature - Beast", ["G"]),
  card("Reanimate", 1, "Sorcery", ["B"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Return target creature card from a graveyard to the battlefield."),
  card("Animate Dead", 2, "Enchantment", ["B"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Enchant creature card in a graveyard. Return that card to the battlefield."),
  card("Griselbrand", 8, "Legendary Creature - Demon", ["B"]),
  card("Entomb", 1, "Instant", ["B"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Search your library for a card and put that card into your graveyard."),
  card("Careful Study", 1, "Sorcery", ["U"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Draw two cards, then discard two cards."),
  card("Dark Ritual", 1, "Instant", ["B"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Add {B}{B}{B}."),
  card("Flusterstorm", 1, "Instant", ["U"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Counter target instant or sorcery spell unless its controller pays {1}."),
  card("Addendum Lesson", 2, "Instant", ["W"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Addendum - If you cast this spell during your main phase, draw a card."),
  card("Sacrifice Outlet", 2, "Creature - Vampire", ["B"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Sacrifice another creature: Scry 1."),
  card("Value Trigger", 2, "Creature - Wizard", ["U"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Whenever you cast your second spell each turn, draw a card."),
  card("Huge Vanilla", 8, "Creature - Giant", ["G"], { modern: "legal", pioneer: "legal", standard: "legal" }, "Vigilance."),
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

const recommendationDecklist = `Deck
4 Memnite
4 Monastery Swiftspear
4 Lightning Strike
4 Expressive Iteration
4 Fable of the Mirror-Breaker
4 The Wandering Emperor
4 Force of Negation
4 Boom // Bust
4 Invasion of Gobakhan
1 Sol Talisman
13 Mountain
10 Island

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
    { name: "Memnite", qty: 4 },
    { name: "Monastery Swiftspear", qty: 4 },
    { name: "Lightning Strike", qty: 4 },
    { name: "Expressive Iteration", qty: 4 },
    { name: "Fable of the Mirror-Breaker", qty: 2 },
    { name: "Force of Negation", qty: 4 },
    { name: "Boom // Bust", qty: 4 },
    { name: "Invasion of Gobakhan", qty: 4 },
    { name: "Tournament Bolt", qty: 4 },
    { name: "Opt", qty: 4 }
  ]),
  modernDeck([
    { name: "Memnite", qty: 4 },
    { name: "Monastery Swiftspear", qty: 4 },
    { name: "Lightning Strike", qty: 4 },
    { name: "Expressive Iteration", qty: 4 },
    { name: "Fable of the Mirror-Breaker", qty: 2 },
    { name: "Force of Negation", qty: 4 },
    { name: "Boom // Bust", qty: 4 },
    { name: "Invasion of Gobakhan", qty: 4 },
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
22 Mountain
22 Island`;
const noEarly = buildManaCurveAnalysis(noEarlyDeck, baseCards, { format: "Modern" });
assert.ok(
  noEarly.observations.some((row) => row.code === "LOW_EARLY_ACTION" || row.code === "LOW_ONE_MANA_PLAYS"),
  "observations change when curve gets slower"
);
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
const recommendationAnalysis = buildManaCurveAnalysis(recommendationDecklist, baseCards, {
  format: "Modern",
  metagameDecks: similarDecks
});
assert.ok(
  recommendationAnalysis.suggestions.some((row) => row.cardName === "Tournament Bolt" && row.source === "similar-tournament-decks"),
  "recommendations can use similar tournament deck candidates"
);
const tournamentSuggestion = recommendationAnalysis.suggestions.find((row) => row.cardName === "Tournament Bolt");
assert.equal(tournamentSuggestion?.suggestedQuantity, 4, "recommendations include suggested quantity");
assert.ok(tournamentSuggestion?.supportingDeckCount, "recommendations include supporting list count");
assert.notEqual(tournamentSuggestion?.similarityConfidence, "low", "real shell overlap has usable confidence");
assert.ok(!recommendationAnalysis.suggestions.some((row) => row.cardName === "Off Color Charm"), "recommendations reject off-color candidates");

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

const sourceAnalysis = buildManaCurveAnalysis(
  `Deck
4 Blooming Marsh
4 Mystic Sanctuary
4 Cavern of Souls
4 Hybrid Lesson
44 Island`,
  sourceCards,
  { format: "Standard" }
);
assert.equal(sourceAnalysis.manaSources.sources.B, 8, "produced_mana plus restricted any-color text supply black sources");
assert.equal(sourceAnalysis.manaSources.sources.G, 8, "produced_mana plus restricted any-color text supply green sources");
assert.equal(sourceAnalysis.manaSources.sources.U, 52, "land subtypes and restricted any-color text supply blue sources");
assert.equal(sourceAnalysis.manaSources.approximateSourceCount, 12, "conditional and restricted mana sources are disclosed as approximate");
assert.equal(sourceAnalysis.manaSources.availability.conditional, 8, "conditional tapped clauses are not treated as always tapped");
assert.equal(sourceAnalysis.manaDemand.pips.W, 0, "hybrid pips are not displayed as fixed white demand");
assert.equal(sourceAnalysis.manaDemand.flexiblePips.W, 8, "hybrid pips are displayed as flexible demand");
assert.equal(sourceAnalysis.manaDemand.flexiblePips.U, 8, "hybrid pips are displayed for each possible color");

const incompleteModern = buildManaCurveAnalysis(
  `Deck
4 Monastery Swiftspear
4 Lightning Strike
4 Mountain`,
  baseCards,
  { format: "Modern" }
);
assert.equal(incompleteModern.validation.isCompleteEnoughForPosture, false, "materially incomplete decks withhold posture judgments");
assert.equal(incompleteModern.suggestions.length, 0, "materially incomplete decks do not produce recommendations");
assert.ok(incompleteModern.observations.some((row) => row.code === "INCOMPLETE_DECK"), "incomplete deck issue is exposed with a stable code");

const aggroPosture = buildManaCurveAnalysis(
  `Deck
4 Savannah Cub
4 Swift Scout
4 Kird Ape
4 Raging Goblin
4 Kumano Faces Kakkazan
4 Play with Fire
4 Shock
4 Lightning Strike
16 Mountain
12 Forest`,
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
4 Absorb
4 Opt
4 Supreme Verdict
4 Memory Deluge
2 Sunfall
2 Teferi, Hero of Dominaria
4 March of Otherworldly Light
4 Addendum Lesson
2 Titan of Industry
14 Island
8 Plains
4 Temple Garden`,
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
4 Llanowar Elves
4 Paradise Druid
4 Cultivate
4 Titan of Industry
4 Ugin, the Spirit Dragon
4 Rampaging Baloths
32 Forest
4 Temple Garden`,
  postureCards,
  { format: "Modern" }
);
assert.equal(rampPosture.posture.posture, "ramp", "ramp plus expensive payoffs classifies as ramp");

function rampPayoffDeck(payoffCount: number) {
  const payoffRows = [
    ["Titan of Industry", Math.min(4, payoffCount)],
    ["Ugin, the Spirit Dragon", Math.min(4, Math.max(0, payoffCount - 4))],
    ["Rampaging Baloths", Math.min(4, Math.max(0, payoffCount - 8))],
    ["Griselbrand", Math.min(4, Math.max(0, payoffCount - 12))]
  ].filter((row): row is [string, number] => typeof row[0] === "string" && typeof row[1] === "number" && row[1] > 0);
  const landCount = 60 - 8 - payoffCount;
  return [
    "Deck",
    "4 Llanowar Elves",
    "4 Cultivate",
    ...payoffRows.map(([cardName, qty]) => `${qty} ${cardName}`),
    `${landCount} Forest`
  ].join("\n");
}

for (const [payoffCount, expectedTitle] of [
  [3, "Ramp payoff density may be low"],
  [4, ""],
  [6, ""],
  [12, ""],
  [13, "Top end may be heavy"]
] as const) {
  const analysis = buildManaCurveAnalysis(rampPayoffDeck(payoffCount), postureCards, { format: "Modern" });
  assert.equal(analysis.posture.posture, "ramp", `${payoffCount} payoff ramp fixture classifies as ramp`);
  const payoffWarnings = analysis.observations.filter((row) =>
    row.title === "Ramp payoff density may be low" || row.title === "Top end may be heavy"
  );
  if (expectedTitle) {
    assert.ok(
      payoffWarnings.some((row) => row.title === expectedTitle),
      `${payoffCount} ramp payoff(s) emits ${expectedTitle}`
    );
  } else {
    assert.equal(payoffWarnings.length, 0, `${payoffCount} ramp payoff(s) is inside the expected payoff range`);
  }
}

const lowRampPayoffs = buildManaCurveAnalysis(rampPayoffDeck(3), postureCards, { format: "Modern" });
const lowRampPayoffWarning = lowRampPayoffs.observations.find((row) => row.code === "LOW_RAMP_PAYOFFS");
assert.equal(lowRampPayoffWarning?.title, "Ramp payoff density may be low", "low ramp payoff warnings use the low-payoff code");
assert.ok(lowRampPayoffWarning?.detail.includes("only 3"), "low ramp payoff detail describes a shortage");
assert.ok(!lowRampPayoffs.observations.some((row) => row.code === "EXCESS_RAMP_PAYOFFS"), "low ramp payoff decks do not carry the excess-payoff code");
assert.ok(
  lowRampPayoffs.suggestions.some((row) => /payoff|finisher|late-game/i.test(`${row.cardName} ${row.role} ${row.problemAddressed}`)),
  "low ramp payoff suggestions add payoff-style cards"
);
assert.ok(
  lowRampPayoffs.suggestions.every((row) => row.possibleCuts.every((cut) => !["Titan of Industry", "Ugin, the Spirit Dragon", "Rampaging Baloths"].includes(cut.cardName))),
  "low ramp payoff cuts do not target the few existing payoff cards"
);

const minimumRampPayoffs = buildManaCurveAnalysis(rampPayoffDeck(4), postureCards, { format: "Modern" });
assert.ok(
  !minimumRampPayoffs.observations.some((row) => row.code === "LOW_RAMP_PAYOFFS" || row.code === "EXCESS_RAMP_PAYOFFS"),
  "minimum ramp payoff count does not emit a directional ramp-payoff code"
);

const maximumRampPayoffs = buildManaCurveAnalysis(rampPayoffDeck(12), postureCards, { format: "Modern" });
assert.ok(
  !maximumRampPayoffs.observations.some((row) => row.code === "LOW_RAMP_PAYOFFS" || row.code === "EXCESS_RAMP_PAYOFFS"),
  "maximum ramp payoff count does not emit a directional ramp-payoff code"
);

const excessRampPayoffs = buildManaCurveAnalysis(rampPayoffDeck(13), postureCards, { format: "Modern" });
const excessRampPayoffWarning = excessRampPayoffs.observations.find((row) => row.code === "EXCESS_RAMP_PAYOFFS");
assert.equal(excessRampPayoffWarning?.title, "Top end may be heavy", "excess ramp payoff warnings can share the heavy-top-end title with a distinct code");
assert.ok(excessRampPayoffWarning?.detail.includes("crowded"), "excess ramp payoff detail describes crowding");
assert.ok(!excessRampPayoffs.observations.some((row) => row.code === "LOW_RAMP_PAYOFFS"), "excess ramp payoff decks do not carry the low-payoff code");
assert.ok(
  !excessRampPayoffs.suggestions.some((row) => /Add a high-impact ramp payoff|Add a meaningful late-game payoff/i.test(row.cardName)),
  "excess ramp payoff suggestions do not add another payoff"
);
assert.ok(
  excessRampPayoffs.suggestions.some((row) => row.possibleCuts.some((cut) => ["Griselbrand", "Rampaging Baloths", "Ugin, the Spirit Dragon", "Titan of Industry"].includes(cut.cardName))),
  "excess ramp payoff cuts prefer redundant expensive cards"
);

const lowTopEnd = buildManaCurveAnalysis(rampPayoffDeck(4), postureCards, { format: "Modern" });
const lowTopEndWarning = lowTopEnd.observations.find((row) => row.code === "LOW_TOP_END");
assert.equal(lowTopEndWarning?.title, "Top end may be light", "below-minimum expensive spells use LOW_TOP_END");
assert.ok(!lowTopEnd.observations.some((row) => row.code === "HEAVY_TOP_END"), "light top end does not carry HEAVY_TOP_END");
assert.ok(
  lowTopEnd.suggestions.some((row) => /late-game|payoff|finisher/i.test(`${row.cardName} ${row.role} ${row.problemAddressed}`)),
  "light top-end suggestions add late-game power"
);

const heavyTopEnd = buildManaCurveAnalysis(rampPayoffDeck(15), postureCards, { format: "Modern" });
const heavyTopEndWarning = heavyTopEnd.observations.find((row) => row.code === "HEAVY_TOP_END");
assert.equal(heavyTopEndWarning?.title, "Top end may be heavy", "above-maximum expensive spells use HEAVY_TOP_END");
assert.ok(!heavyTopEnd.observations.some((row) => row.code === "LOW_TOP_END"), "heavy top end does not carry LOW_TOP_END");
assert.ok(
  heavyTopEnd.suggestions.some((row) => /cheaper|Curve compression|role player/i.test(`${row.cardName} ${row.role} ${row.reason}`)),
  "heavy top-end suggestions favor cheaper cards or curve compression"
);

const lowFinisherControl = buildManaCurveAnalysis(
  `Deck
4 Counterspell
4 Absorb
4 Opt
4 Supreme Verdict
4 Memory Deluge
4 March of Otherworldly Light
4 Addendum Lesson
1 Teferi, Hero of Dominaria
15 Island
8 Plains
8 Temple Garden`,
  postureCards,
  { format: "Pioneer" }
);
assert.equal(lowFinisherControl.posture.posture, "control", "low-finisher fixture remains a control deck");
assert.equal(
  lowFinisherControl.observations.find((row) => row.code === "LOW_FINISHERS")?.title,
  "Finisher density may be low",
  "below-minimum finishers use LOW_FINISHERS"
);
assert.ok(!lowFinisherControl.observations.some((row) => row.code === "EXCESS_FINISHERS"), "low finisher decks do not carry EXCESS_FINISHERS");

const excessFinisherControl = buildManaCurveAnalysis(
  `Deck
4 Counterspell
4 Absorb
4 Opt
4 Supreme Verdict
4 Memory Deluge
4 March of Otherworldly Light
4 Addendum Lesson
4 Teferi, Hero of Dominaria
4 Titan of Industry
1 Ugin, the Spirit Dragon
11 Island
8 Plains
7 Temple Garden`,
  postureCards,
  { format: "Pioneer" }
);
assert.equal(excessFinisherControl.posture.posture, "control", "excess-finisher fixture remains a control deck");
assert.equal(
  excessFinisherControl.observations.find((row) => row.code === "EXCESS_FINISHERS")?.title,
  "Finisher density may be high",
  "above-maximum finishers use EXCESS_FINISHERS"
);
assert.ok(!excessFinisherControl.observations.some((row) => row.code === "LOW_FINISHERS"), "excess finisher decks do not carry LOW_FINISHERS");

const comboPosture = buildManaCurveAnalysis(
  `Deck
4 Reanimate
4 Animate Dead
4 Entomb
4 Careful Study
4 Opt
4 Dark Ritual
4 Flusterstorm
4 Griselbrand
20 Swamp
8 Island`,
  postureCards,
  { format: "Legacy" }
);
assert.equal(comboPosture.posture.posture, "combo", "combo pieces plus tutors/selection classify as combo");

const mixedPosture = buildManaCurveAnalysis(
  `Deck
4 Savannah Cub
4 Supreme Verdict
4 Titan of Industry
4 Reanimate
4 Addendum Lesson
20 Forest
16 Island
4 Plains`,
  postureCards,
  { format: "Modern" }
);
assert.equal(mixedPosture.posture.posture, "unknown", "mixed sparse inputs do not force a posture");

const mainOnlyWithWarnings = buildManaCurveAnalysis(
  `Deck
4 Savannah Cub
4 Swift Scout
4 Kird Ape
4 Raging Goblin
4 Kumano Faces Kakkazan
4 Play with Fire
4 Shock
4 Lightning Strike
16 Mountain
12 Forest

Sideboard
4 Titan of Industry
4 Ugin, the Spirit Dragon
4 Rampaging Baloths
3 Supreme Verdict`,
  postureCards,
  { format: "Pioneer", scope: "main" }
);
const mainPlusSideboardWithWarnings = buildManaCurveAnalysis(
  `Deck
4 Savannah Cub
4 Swift Scout
4 Kird Ape
4 Raging Goblin
4 Kumano Faces Kakkazan
4 Play with Fire
4 Shock
4 Lightning Strike
16 Mountain
12 Forest

Sideboard
4 Titan of Industry
4 Ugin, the Spirit Dragon
4 Rampaging Baloths
3 Supreme Verdict`,
  postureCards,
  { format: "Pioneer", scope: "main+sideboard" }
);
assert.deepEqual(
  mainPlusSideboardWithWarnings.observations.map((row) => row.code),
  mainOnlyWithWarnings.observations.map((row) => row.code),
  "including the sideboard in display scope does not change main-deck posture warnings"
);

const sideboardOnlyObservations = buildManaCurveAnalysis(
  `Deck
4 Savannah Cub
4 Lightning Strike
4 Shock
4 Play with Fire
20 Mountain
24 Forest

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
assert.ok(!detectFunctionalRoles(postureCards.get("value trigger")).includes("combo_enabler"), "generic triggered card advantage is not treated as combo");
assert.ok(!detectFunctionalRoles(postureCards.get("huge vanilla")).includes("combo_payoff"), "high mana value alone is not treated as combo payoff");
assert.ok(detectFunctionalRoles(postureCards.get("llanowar elves")).includes("ramp"), "explicit mana production is ramp");

console.log("manaCurve tests passed");
