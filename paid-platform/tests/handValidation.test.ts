import assert from "node:assert/strict";
import { validateOpeningHandAgainstDeck, validatePastedHandRows } from "../src/lib/handValidation";

const decklist = `Deck
2 Roaring Furnace // Steaming Sauna
4 Lightning Strike
4 Island
4 Mountain
4 Opt`;

assert.equal(
  validatePastedHandRows(["Island", "Mountain", "Opt", "Lightning Strike", "Island"], decklist).error,
  "Paste exactly seven cards. I found 5.",
  "five-card pastes are rejected"
);

assert.match(
  validatePastedHandRows(["Island", "Mountain", "Opt", "Lightning Strike", "Island", "Mountain", "Opt", "Lightning Strike"], decklist).error,
  /found 8/,
  "eight-card pastes are rejected"
);

assert.match(
  validatePastedHandRows(["Island", "Mountain", "Opt", "Lightning Strike", "Island", "Mountain", "Thoughtseize"], decklist).error,
  /not in the main deck/,
  "unknown cards are rejected"
);

assert.match(
  validatePastedHandRows(["Opt", "Opt", "Opt", "Opt", "Opt", "Island", "Mountain"], decklist).error,
  /appears more times/,
  "copy counts are enforced"
);

assert.deepEqual(
  validatePastedHandRows(["Roaring Furnace", "Steaming Sauna", "Opt", "Opt", "Island", "Island", "Mountain"], decklist).hand,
  ["Roaring Furnace // Steaming Sauna", "Roaring Furnace // Steaming Sauna", "Opt", "Opt", "Island", "Island", "Mountain"],
  "split-card face names resolve to the parent deck row within copy limits"
);

assert.deepEqual(
  validatePastedHandRows(["Roating Furnafcer", "Steaming Sauna", "Opt", "Opt", "Island", "Island", "Mountain"], decklist).hand,
  ["Roaring Furnace // Steaming Sauna", "Roaring Furnace // Steaming Sauna", "Opt", "Opt", "Island", "Island", "Mountain"],
  "clear OCR typos in split-card face names resolve to the parent deck row"
);

assert.match(
  validateOpeningHandAgainstDeck(["Island", "Mountain", "Opt", "Lightning Strike", "Island", "Mountain", ""], decklist).error,
  /Card 7 is blank/,
  "final hand validation rejects blank confirmed slots"
);

assert.deepEqual(
  validateOpeningHandAgainstDeck(["Roaring Furnace", "Steaming Sauna", "Opt", "Opt", "Island", "Island", "Mountain"], decklist).hand,
  ["Roaring Furnace // Steaming Sauna", "Roaring Furnace // Steaming Sauna", "Opt", "Opt", "Island", "Island", "Mountain"],
  "final hand validation canonicalizes split-card face aliases"
);

console.log("handValidation tests passed");
