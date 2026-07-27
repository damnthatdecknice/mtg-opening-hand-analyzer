import assert from "node:assert/strict";
import { castabilityScoreAdjustment, manaSufficiencyAdjustment } from "../src/lib/handScoring";

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

console.log("handScoring tests passed");
