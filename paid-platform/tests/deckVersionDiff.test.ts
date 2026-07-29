import assert from "node:assert/strict";
import { diffDecklistsBySection } from "../src/lib/deckVersionDiff";

const oldList = `Deck
2 Lightning Bolt
1 lightning   bolt
1 Counterspell
2 Opt

Sideboard
1 Negate
1 Opt`;

const newList = `Deck
4 Lightning Bolt
1 Negate

Sideboard
2 Opt
1 COUNTERSPELL`;

const diff = diffDecklistsBySection(oldList, newList);

const byKey = new Map(diff.map((row) => [row.key, row]));

assert.equal(byKey.get("main:lightning bolt")?.oldQty, 3, "duplicate old rows are aggregated");
assert.equal(byKey.get("main:lightning bolt")?.newQty, 4, "duplicate new rows are aggregated");
assert.equal(byKey.get("main:lightning bolt")?.delta, 1, "aggregated duplicate delta is correct");

assert.equal(byKey.get("main:counterspell")?.oldQty, 1, "main-deck old copy is tracked separately");
assert.equal(byKey.get("main:counterspell")?.newQty, 0, "main-deck removed copy is tracked separately");
assert.equal(byKey.get("sideboard:counterspell")?.oldQty, 0, "sideboard added copy is tracked separately");
assert.equal(byKey.get("sideboard:counterspell")?.newQty, 1, "case-insensitive sideboard row is normalized");

assert.equal(byKey.get("sideboard:opt")?.oldQty, 1, "sideboard rows do not merge into main rows");
assert.equal(byKey.get("sideboard:opt")?.newQty, 2, "sideboard duplicate comparison stays in sideboard");
assert.equal(byKey.get("main:opt")?.oldQty, 2, "moving cards out of main reports the main-deck removal");
assert.equal(byKey.get("main:opt")?.newQty, 0, "main-deck moved card does not disappear");

console.log("deckVersionDiff tests passed");
