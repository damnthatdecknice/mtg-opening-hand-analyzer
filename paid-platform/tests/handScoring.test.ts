import assert from "node:assert/strict";
import {
  castabilityScoreAdjustment,
  manaSufficiencyAdjustment,
  scoreHandDeckRelative,
  type AnalysisCardInput
} from "../src/lib/handScoring";

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ");
}

function card(input: Partial<AnalysisCardInput> & Pick<AnalysisCardInput, "name">): AnalysisCardInput {
  return {
    manaCost: "",
    manaValue: 0,
    typeLine: "Land",
    oracleText: "",
    colors: [],
    producedMana: [],
    isLand: false,
    ...input
  };
}

function cardMap(cards: AnalysisCardInput[]) {
  return new Map(cards.map((entry) => [normalizeName(entry.name), entry]));
}

function counts(entries: Array<[string, number]>) {
  return new Map(entries);
}

const fastSettings = {
  baselineHands: 90,
  handSimulations: 24,
  mulliganHands: 24,
  drawsPerBaselineHand: 12,
  analysisHorizon: 5
};

const colorLocked = castabilityScoreAdjustment([
  { manaValue: 1, turn2: 0.03, turn3: 0.08 },
  { manaValue: 2, turn2: 0.04, turn3: 0.12 }
]);

assert.equal(colorLocked.adjustment, -34, "hands that cannot cast spells by turn 3 are heavily penalized");
assert.match(colorLocked.note, /Color access/, "color-locked hands explain the score penalty");

const strandedEarlySpells = castabilityScoreAdjustment([
  { manaValue: 1, turn2: 0.18, turn3: 0.65 },
  { manaValue: 3, turn2: 0.1, turn3: 0.7 }
]);

assert.equal(strandedEarlySpells.adjustment, -28, "cheap spells stranded by color get a real keep-score penalty");

const playable = castabilityScoreAdjustment([
  { manaValue: 1, turn2: 0.92, turn3: 0.98 },
  { manaValue: 2, turn2: 0.75, turn3: 0.9 }
]);

assert.equal(playable.adjustment, 0, "castable hands are not penalized");

const oneLandBigMana = manaSufficiencyAdjustment({
  landsInHand: 1,
  effectiveLandsInHand: 2,
  profileLabel: "Ramp or big-mana curve",
  curveTop: 4,
  averageManaValue: 3,
  turn2LandDrop: 0.35,
  turn3LandDrop: 0.14,
  turn4LandDrop: 0.28,
  hasCastableRamp: false
});

assert.equal(oneLandBigMana.adjustment, -38, "one-land big-mana hands get a severe mana penalty");
assert.equal(oneLandBigMana.cap, 42, "one-land big-mana hands are score-capped below keepable texture");
assert.match(oneLandBigMana.note, /one land/, "one-land mana risk is explained");

const oneLandWithRamp = manaSufficiencyAdjustment({
  landsInHand: 1,
  effectiveLandsInHand: 2,
  profileLabel: "Midrange curve",
  curveTop: 3,
  averageManaValue: 2.4,
  turn2LandDrop: 0.7,
  turn3LandDrop: 0.62,
  turn4LandDrop: 0.78,
  hasCastableRamp: true
});

assert.equal(oneLandWithRamp.adjustment, -22, "castable ramp can soften but not erase one-land risk");
assert.equal(oneLandWithRamp.cap, 54, "one-land ramp hands remain capped below clean keep texture");

const twoLandHighCurve = manaSufficiencyAdjustment({
  landsInHand: 2,
  effectiveLandsInHand: 2,
  profileLabel: "Ramp or big-mana curve",
  curveTop: 5,
  averageManaValue: 3.15,
  turn2LandDrop: 1,
  turn3LandDrop: 0.64,
  turn4LandDrop: 0.62,
  hasCastableRamp: false
});

assert.equal(twoLandHighCurve.adjustment, -18, "two-land hands are penalized when the deck averages over 3 mana value");
assert.equal(twoLandHighCurve.cap, 58, "two-land high-curve hands are capped unless they have strong help");
assert.match(twoLandHighCurve.note, /averages over 3/, "high-curve two-land risk is explained");

const twoLandHighCurveWithRamp = manaSufficiencyAdjustment({
  landsInHand: 2,
  effectiveLandsInHand: 3,
  profileLabel: "Ramp or big-mana curve",
  curveTop: 5,
  averageManaValue: 3.15,
  turn2LandDrop: 1,
  turn3LandDrop: 0.74,
  turn4LandDrop: 0.78,
  hasCastableRamp: true
});

assert.equal(twoLandHighCurveWithRamp.adjustment, -10, "castable ramp only partially softens high-curve two-land hands");
assert.equal(twoLandHighCurveWithRamp.cap, 66, "high-curve two-land ramp hands are still capped below premium texture");

const stableThreeLand = manaSufficiencyAdjustment({
  landsInHand: 3,
  effectiveLandsInHand: 3,
  profileLabel: "Ramp or big-mana curve",
  curveTop: 5,
  averageManaValue: 3.1,
  turn2LandDrop: 1,
  turn3LandDrop: 1,
  turn4LandDrop: 0.72,
  hasCastableRamp: false
});

assert.equal(stableThreeLand.adjustment, 0, "hands meeting the curve's mana requirement are not penalized");
assert.equal(stableThreeLand.cap, 100, "stable mana does not cap texture");

const redAggroCards = cardMap([
  card({ name: "Mountain", typeLine: "Basic Land — Mountain", oracleText: "{T}: Add {R}.", producedMana: ["R"], isLand: true }),
  card({ name: "Plains", typeLine: "Basic Land — Plains", oracleText: "{T}: Add {W}.", producedMana: ["W"], isLand: true }),
  card({ name: "Monastery Swiftspear", manaCost: "{R}", manaValue: 1, typeLine: "Creature — Human Monk", oracleText: "Haste. Prowess." }),
  card({ name: "Lightning Strike", manaCost: "{1}{R}", manaValue: 2, typeLine: "Instant", oracleText: "Lightning Strike deals 3 damage to any target." }),
  card({ name: "Phoenix Chick", manaCost: "{R}", manaValue: 1, typeLine: "Creature — Phoenix", oracleText: "Flying, haste." }),
  card({ name: "Four Drop", manaCost: "{3}{R}", manaValue: 4, typeLine: "Creature", oracleText: "A large threat." })
]);

const redAggroDeck = counts([
  ["Mountain", 20],
  ["Monastery Swiftspear", 4],
  ["Lightning Strike", 4],
  ["Phoenix Chick", 4],
  ["Four Drop", 4],
  ["Plains", 24]
]);

const correctColor = scoreHandDeckRelative({
  mainCounts: redAggroDeck,
  handNames: ["Mountain", "Mountain", "Monastery Swiftspear", "Lightning Strike", "Phoenix Chick", "Four Drop", "Mountain"],
  cardData: redAggroCards,
  playDraw: "play",
  profileLabel: "Low-curve pressure",
  seed: "correct-color",
  settings: fastSettings
});

const wrongColor = scoreHandDeckRelative({
  mainCounts: redAggroDeck,
  handNames: ["Plains", "Plains", "Monastery Swiftspear", "Lightning Strike", "Phoenix Chick", "Four Drop", "Plains"],
  cardData: redAggroCards,
  playDraw: "play",
  profileLabel: "Low-curve pressure",
  seed: "wrong-color",
  settings: fastSettings
});

assert.ok(correctColor.score > wrongColor.score, "correct-color sources score higher than the same land count in wrong colors");
assert.ok(wrongColor.utility.catastrophicFailureRate > correctColor.utility.catastrophicFailureRate, "wrong-color hands carry higher fail-state risk");

const balanced = scoreHandDeckRelative({
  mainCounts: redAggroDeck,
  handNames: ["Mountain", "Mountain", "Mountain", "Monastery Swiftspear", "Lightning Strike", "Phoenix Chick", "Four Drop"],
  cardData: redAggroCards,
  playDraw: "draw",
  profileLabel: "Low-curve pressure",
  seed: "balanced",
  settings: fastSettings
});

const zeroLand = scoreHandDeckRelative({
  mainCounts: redAggroDeck,
  handNames: ["Monastery Swiftspear", "Lightning Strike", "Phoenix Chick", "Four Drop", "Monastery Swiftspear", "Lightning Strike", "Phoenix Chick"],
  cardData: redAggroCards,
  playDraw: "draw",
  profileLabel: "Low-curve pressure",
  seed: "zero-land",
  settings: fastSettings
});

assert.ok(balanced.score > zeroLand.score, "balanced land plus spell hands score above zero-land hands");

const rampCards = cardMap([
  card({ name: "Forest", typeLine: "Basic Land — Forest", oracleText: "{T}: Add {G}.", producedMana: ["G"], isLand: true }),
  card({ name: "Llanowar Elves", manaCost: "{G}", manaValue: 1, typeLine: "Creature — Elf Druid", oracleText: "{T}: Add {G}." }),
  card({ name: "Colossal Payoff", manaCost: "{5}{G}", manaValue: 6, typeLine: "Creature", oracleText: "A payoff for having lots of mana." }),
  card({ name: "Small Bear", manaCost: "{1}{G}", manaValue: 2, typeLine: "Creature", oracleText: "A normal creature." })
]);
const rampDeck = counts([
  ["Forest", 24],
  ["Llanowar Elves", 4],
  ["Colossal Payoff", 8],
  ["Small Bear", 24]
]);
const rampWithPayoff = scoreHandDeckRelative({
  mainCounts: rampDeck,
  handNames: ["Forest", "Forest", "Llanowar Elves", "Colossal Payoff", "Small Bear", "Small Bear", "Forest"],
  cardData: rampCards,
  playDraw: "play",
  profileLabel: "Ramp or big-mana curve",
  seed: "ramp-payoff",
  settings: fastSettings
});
const rampNoPayoff = scoreHandDeckRelative({
  mainCounts: rampDeck,
  handNames: ["Forest", "Forest", "Llanowar Elves", "Small Bear", "Small Bear", "Small Bear", "Forest"],
  cardData: rampCards,
  playDraw: "play",
  profileLabel: "Ramp or big-mana curve",
  seed: "ramp-no-payoff",
  settings: fastSettings
});

assert.ok(rampWithPayoff.score >= rampNoPayoff.score, "ramp is worth more when it accelerates a relevant payoff");

const deterministicA = scoreHandDeckRelative({
  mainCounts: redAggroDeck,
  handNames: ["Mountain", "Mountain", "Monastery Swiftspear", "Lightning Strike", "Phoenix Chick", "Four Drop", "Mountain"],
  cardData: redAggroCards,
  playDraw: "play",
  profileLabel: "Low-curve pressure",
  seed: "deterministic",
  settings: fastSettings
});
const deterministicB = scoreHandDeckRelative({
  mainCounts: redAggroDeck,
  handNames: ["Mountain", "Mountain", "Monastery Swiftspear", "Lightning Strike", "Phoenix Chick", "Four Drop", "Mountain"],
  cardData: redAggroCards,
  playDraw: "play",
  profileLabel: "Low-curve pressure",
  seed: "deterministic",
  settings: fastSettings
});

assert.deepEqual(deterministicA, deterministicB, "seeded deck-relative analysis is deterministic");

const londonSixBaseline = scoreHandDeckRelative({
  mainCounts: redAggroDeck,
  handNames: ["Mountain", "Mountain", "Monastery Swiftspear", "Lightning Strike", "Phoenix Chick", "Four Drop", "Mountain"],
  cardData: redAggroCards,
  playDraw: "play",
  profileLabel: "Low-curve pressure",
  seed: "mulligan-mode",
  settings: fastSettings
});
const freeSevenBaseline = scoreHandDeckRelative({
  mainCounts: redAggroDeck,
  handNames: ["Mountain", "Mountain", "Monastery Swiftspear", "Lightning Strike", "Phoenix Chick", "Four Drop", "Mountain"],
  cardData: redAggroCards,
  playDraw: "play",
  profileLabel: "Low-curve pressure",
  freeMulligan: true,
  seed: "mulligan-mode",
  settings: fastSettings
});

assert.ok(
  (freeSevenBaseline.mulliganExpectedValue ?? 0) >= (londonSixBaseline.mulliganExpectedValue ?? 0),
  "free-mulligan formats compare against a fresh seven instead of a London six"
);

console.log("handScoring tests passed");
