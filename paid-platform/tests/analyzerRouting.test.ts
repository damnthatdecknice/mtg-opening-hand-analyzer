import assert from "node:assert/strict";
import { selectAnalyzerDeck } from "../src/lib/analyzerRouting";

const decks = [
  { id: "alpha", name: "Alpha" },
  { id: "beta", name: "Beta" }
];

assert.equal(
  selectAnalyzerDeck({ decks, requestedDeckId: "beta", rememberedDeckId: "alpha" }).deck?.id,
  "beta",
  "requested deck query takes precedence over remembered deck"
);

assert.equal(
  selectAnalyzerDeck({ decks, rememberedDeckId: "alpha" }).deck?.id,
  "alpha",
  "remembered deck is used when no URL deck is requested"
);

const invalid = selectAnalyzerDeck({ decks, requestedDeckId: "missing", rememberedDeckId: "alpha" });
assert.equal(invalid.deck, null, "invalid requested deck does not silently load remembered deck");
assert.match(invalid.message, /could not be found/i, "invalid requested deck explains the safe fallback");
assert.equal(invalid.shouldRemember, false, "invalid requested deck is not remembered");

const blank = selectAnalyzerDeck({ decks });
assert.equal(blank.deck, null, "analyzer starts blank when no URL or remembered deck exists");

console.log("analyzerRouting tests passed");
