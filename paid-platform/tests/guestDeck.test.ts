import assert from "node:assert/strict";
import { parseDecklist, parseDekImport } from "../src/lib/deckParser";
import { shouldPersistHandSession } from "../src/lib/analyzerMode";
import { buildOnboardingReview, onboardingExampleDeck } from "../src/lib/firstDeckOnboarding";
import {
  guestDeckFromParsed,
  parseGuestDeck,
  serializeGuestDeck
} from "../src/lib/guestDeck";

const decklist = `Deck
4 Lightning Bolt
4 Monastery Swiftspear
52 Mountain

Sideboard
2 Smash to Smithereens`;

const parsed = parseDecklist(decklist);
const now = Date.UTC(2026, 6, 28);
const guestDeck = guestDeckFromParsed({
  decklist,
  format: "Modern",
  name: "Burn Test",
  parsed,
  now
});

assert.deepEqual(
  parseGuestDeck(serializeGuestDeck(guestDeck), now + 1000),
  guestDeck,
  "guest deck serializes and parses without changing the data"
);

assert.equal(
  parseGuestDeck(serializeGuestDeck(guestDeck), now + 8 * 24 * 60 * 60 * 1000),
  null,
  "guest deck expires after the scoped browser-storage window"
);

const imported = parseDekImport(`
<Deck>
  <Cards CatID="1" Quantity="4" Sideboard="false" Name="Lightning Bolt" />
  <Cards CatID="2" Quantity="56" Sideboard="false" Name="Mountain" />
  <Cards CatID="3" Quantity="2" Sideboard="true" Name="Smash to Smithereens" />
</Deck>
`);
const importReview = buildOnboardingReview(imported.decklist, "Modern", imported.parsed);
assert.equal(importReview.mainCount, 60, ".dek import populates main count");
assert.equal(importReview.sideboardCount, 2, ".dek import populates sideboard count");
assert.match(importReview.suggestedName, /Lightning Bolt|Mountain/, ".dek import produces a suggested deck name");

const pasteReview = buildOnboardingReview(onboardingExampleDeck, "Standard");
assert.equal(pasteReview.status, "ready", "example pasted deck is ready");
assert.equal(pasteReview.mainCount, 60, "example pasted deck has 60 main cards");
assert.equal(pasteReview.sideboardCount, 5, "example pasted deck has sideboard cards");

const incompleteReview = buildOnboardingReview("Deck\n4 Lightning Bolt", "Modern");
assert.equal(incompleteReview.status, "partial", "incomplete decks are flagged as partial");
assert.match(incompleteReview.messages.join(" "), /Deck is incomplete/i, "incomplete decks explain limited analysis");

assert.equal(shouldPersistHandSession("guest"), false, "guest mode never saves hand sessions");
assert.equal(shouldPersistHandSession("sample"), false, "sample mode never saves hand sessions");
assert.equal(shouldPersistHandSession("account"), true, "account mode can save hand sessions");

console.log("guestDeck tests passed");
