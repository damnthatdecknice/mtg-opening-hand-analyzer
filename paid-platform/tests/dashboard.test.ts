import assert from "node:assert/strict";
import { selectRecentDashboardDeck } from "../src/lib/dashboard";

const decks = [
  { id: "old", name: "Old Deck", updated_at: "2026-07-01T00:00:00.000Z" },
  { id: "new", name: "New Deck", updated_at: "2026-07-20T00:00:00.000Z" },
  { id: "played", name: "Recently Played", updated_at: "2026-07-05T00:00:00.000Z" }
];

assert.equal(selectRecentDashboardDeck([], "played"), null, "zero-deck dashboard has no recent deck");
assert.equal(selectRecentDashboardDeck(decks, "played")?.id, "played", "recently analyzed deck wins");
assert.equal(selectRecentDashboardDeck(decks, "missing")?.id, "new", "updated deck is fallback when session deck is unavailable");
assert.equal(selectRecentDashboardDeck(decks)?.id, "new", "updated deck is fallback without hand history");

console.log("dashboard tests passed");
