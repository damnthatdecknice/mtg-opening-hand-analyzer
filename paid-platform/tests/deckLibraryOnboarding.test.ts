import assert from "node:assert/strict";
import { parseDecklist } from "../src/lib/deckParser";
import { buildOnboardingReview, gateDeckVerification, onboardingExampleDeck } from "../src/lib/firstDeckOnboarding";

const blankReview = buildOnboardingReview("", "Standard");
assert.equal(blankReview.status, "empty", "blank Deck Vault editor has an empty review state");
assert.equal(blankReview.mainCount, 0, "blank Deck Vault editor has no main-deck cards");
assert.equal(blankReview.sideboardCount, 0, "blank Deck Vault editor has no sideboard cards");

const blankGate = gateDeckVerification(blankReview.status, false, blankReview.mainCount);
assert.equal(blankGate.allowed, false, "blank Deck Vault editor cannot be saved");

const exampleParsed = parseDecklist(onboardingExampleDeck);
assert.ok(exampleParsed.mainCount > 0, "Load Example Deck supplies main-deck rows");
assert.ok(exampleParsed.sideboardCount > 0, "Load Example Deck supplies sideboard rows");

const exampleReview = buildOnboardingReview(onboardingExampleDeck, "Standard", exampleParsed);
assert.equal(exampleReview.status, "checking", "loaded example enters the normal verification flow");
assert.equal(exampleReview.suggestedName, "Monastery Swiftspear Deck", "loaded example has a suitable inferred name");

console.log("deckLibraryOnboarding tests passed");
