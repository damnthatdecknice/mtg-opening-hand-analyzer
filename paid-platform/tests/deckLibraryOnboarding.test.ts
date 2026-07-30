import assert from "node:assert/strict";
import { parseDecklist } from "../src/lib/deckParser";
import {
  buildDeckFingerprint,
  buildOnboardingReview,
  gateDeckVerification,
  onboardingExampleDeck
} from "../src/lib/firstDeckOnboarding";

const blankReview = buildOnboardingReview("", "Standard");
assert.equal(blankReview.status, "empty", "blank Deck Vault editor has an empty review state");
assert.equal(blankReview.mainCount, 0, "blank Deck Vault editor has no main-deck cards");
assert.equal(blankReview.sideboardCount, 0, "blank Deck Vault editor has no sideboard cards");

const blankGate = gateDeckVerification({
  status: blankReview.status,
  acknowledgedWarnings: false,
  mainCount: blankReview.mainCount,
  verifiedFingerprint: blankReview.deckFingerprint,
  currentFingerprint: buildDeckFingerprint("", "Standard")
});
assert.equal(blankGate.allowed, false, "blank Deck Vault editor cannot be saved");

const unparseableReview = buildOnboardingReview("Lightning Bolt\nIsland", "Modern");
assert.equal(unparseableReview.status, "unparseable", "nonempty deck text without quantities is unparseable, not empty");
assert.equal(unparseableReview.mainCount, 0, "unparseable text does not invent parsed cards");
assert.match(
  gateDeckVerification({
    status: unparseableReview.status,
    acknowledgedWarnings: false,
    mainCount: unparseableReview.mainCount,
    verifiedFingerprint: unparseableReview.deckFingerprint,
    currentFingerprint: buildDeckFingerprint("Lightning Bolt\nIsland", "Modern")
  }).message ?? "",
  /No cards could be parsed/,
  "unparseable decks receive a specific correction message"
);

const exampleParsed = parseDecklist(onboardingExampleDeck);
assert.ok(exampleParsed.mainCount > 0, "Load Example Deck supplies main-deck rows");
assert.ok(exampleParsed.sideboardCount > 0, "Load Example Deck supplies sideboard rows");

const exampleReview = buildOnboardingReview(onboardingExampleDeck, "Standard", exampleParsed);
assert.equal(exampleReview.status, "checking", "loaded example enters the normal verification flow");
assert.equal(exampleReview.suggestedName, "Monastery Swiftspear Deck", "loaded example has a suitable inferred name");

const verifiedFingerprint = buildDeckFingerprint(onboardingExampleDeck, "Standard");
const matchingGate = gateDeckVerification({
  status: "verified",
  acknowledgedWarnings: false,
  mainCount: exampleParsed.mainCount,
  verifiedFingerprint,
  currentFingerprint: buildDeckFingerprint(onboardingExampleDeck, "Standard")
});
assert.equal(matchingGate.allowed, true, "matching fingerprints allow a verified deck to proceed");

function gateForEditedDeck(editedDecklist: string, format = "Standard") {
  return gateDeckVerification({
    status: "verified",
    acknowledgedWarnings: false,
    mainCount: parseDecklist(editedDecklist).mainCount,
    verifiedFingerprint,
    currentFingerprint: buildDeckFingerprint(editedDecklist, format)
  });
}

assert.equal(gateForEditedDeck(onboardingExampleDeck.replace("4 Lightning Strike", "3 Lightning Strike")).allowed, false, "quantity changes invalidate verification");
assert.equal(gateForEditedDeck(onboardingExampleDeck.replace("Lightning Strike", "Lightning Bolt")).allowed, false, "card-name changes invalidate verification");
assert.equal(gateForEditedDeck(onboardingExampleDeck, "Modern").allowed, false, "format changes invalidate verification");
assert.equal(
  gateForEditedDeck(onboardingExampleDeck.replace("4 Lightning Strike", "Sideboard\n4 Lightning Strike")).allowed,
  false,
  "main-to-sideboard movement invalidates verification"
);

const reorderedDeck = `Deck
8 Plains
12 Mountain
4 Battlefield Forge
4 Inspiring Vantage
4 Warden of the Inner Sky
4 Imodane's Recruiter
4 Charming Scoundrel
4 Kumano Faces Kakkazan
4 Phoenix Chick
4 Play with Fire
4 Lightning Strike
4 Monastery Swiftspear

Sideboard
2 Lithomantic Barrage
3 Destroy Evil`;
assert.equal(buildDeckFingerprint(reorderedDeck, " Standard "), verifiedFingerprint, "row ordering and harmless format whitespace do not change fingerprints");

const duplicateRowsDeck = onboardingExampleDeck.replace("4 Lightning Strike", "2 Lightning Strike\n2 Lightning Strike");
assert.equal(buildDeckFingerprint(duplicateRowsDeck, "Standard"), verifiedFingerprint, "duplicate rows aggregate into the same fingerprint");

const apostropheStraight = buildDeckFingerprint("Deck\n4 Imodane's Recruiter\n56 Mountain", "Standard");
const actualCurlyApostrophe = buildDeckFingerprint("Deck\n4 Imodane\u2019s Recruiter\n56 Mountain", "Standard");
const apostropheCurly = buildDeckFingerprint("Deck\n4 Imodane’s Recruiter\n56 Mountain", "Standard");
assert.equal(actualCurlyApostrophe, apostropheStraight, "real curly and straight apostrophes normalize consistently");
assert.equal(apostropheCurly, apostropheStraight, "curly and straight apostrophes normalize consistently");

const staleGate = gateDeckVerification({
  status: "verified",
  acknowledgedWarnings: false,
  mainCount: exampleParsed.mainCount,
  verifiedFingerprint,
  currentFingerprint: buildDeckFingerprint(onboardingExampleDeck.replace("4 Play with Fire", "4 Shock"), "Standard")
});
assert.equal(staleGate.allowed, false, "simulated edit-immediately-before-save action is blocked");

console.log("deckLibraryOnboarding tests passed");
