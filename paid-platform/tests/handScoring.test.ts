import assert from "node:assert/strict";
import { castabilityScoreAdjustment } from "../src/lib/handScoring";

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

console.log("handScoring tests passed");
