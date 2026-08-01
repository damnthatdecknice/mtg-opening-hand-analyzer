import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateSeededOpeningHand } from "../src/lib/seededHandGenerator";
import {
  calculateMagicPuzzleStats,
  canUseMagicPuzzleArchive,
  canUseMagicPuzzles,
  generateMagicPuzzleForDate,
  publicMagicPuzzle,
  revealMagicPuzzle,
  type MagicPuzzleAttempt
} from "../src/lib/magicPuzzles";

const decklist = `Deck
4 Lightning Bolt
4 Monastery Swiftspear
4 Play with Fire
48 Mountain

Sideboard
4 Smash to Smithereens`;

const handA = generateSeededOpeningHand(decklist, "2026-08-02:test:0").hand;
const handB = generateSeededOpeningHand(decklist, "2026-08-02:test:0").hand;
const handC = generateSeededOpeningHand(decklist, "2026-08-03:test:0").hand;

assert.deepEqual(handA, handB, "same seed creates the same opening hand");
assert.notDeepEqual(handA, handC, "different seeds can create different opening hands");
assert.equal(handA.length, 7, "seeded generator produces seven cards");
assert.equal(handA.includes("Smash to Smithereens"), false, "seeded generator uses only main-deck cards");

const generated = generateMagicPuzzleForDate("2026-08-02");
assert.equal(generated.id, "opening-hand:2026-08-02", "daily puzzle id is date-stable");
assert.equal(generated.hand.length, 7, "daily puzzle contains seven cards");
assert.ok(generated.analysisSummary.scoreMargin >= 8, "daily puzzle passes ambiguity margin");
assert.ok(generated.explanation.keyFactors.length > 0, "daily puzzle has explanation factors");

const publicPuzzle = publicMagicPuzzle(generated);
assert.equal("correctAnswer" in publicPuzzle, false, "public puzzle does not expose the correct answer before attempt");
assert.equal(publicPuzzle.reveal, undefined, "public puzzle does not reveal explanation before attempt");
assert.equal(publicPuzzle.lessonCategory, undefined, "public puzzle hides lesson category before attempt");

const reveal = revealMagicPuzzle(generated, generated.correctAnswer);
assert.equal(reveal.correct, true, "reveal marks the correct answer");
assert.equal(reveal.correctAnswer, generated.correctAnswer, "reveal returns the correct answer after attempt");

const attemptedPublicPuzzle = publicMagicPuzzle(generated, {
  puzzleDate: generated.puzzleDate,
  selectedAnswer: generated.correctAnswer,
  correct: true
});
assert.equal(attemptedPublicPuzzle.completed, true, "attempted puzzle is marked complete");
assert.equal(attemptedPublicPuzzle.reveal?.correctAnswer, generated.correctAnswer, "attempted puzzle includes reveal");

const attempts: MagicPuzzleAttempt[] = [
  { puzzleDate: "2026-08-01", selectedAnswer: "keep", correct: true },
  { puzzleDate: "2026-08-02", selectedAnswer: "mulligan", correct: false },
  { puzzleDate: "2026-08-03", selectedAnswer: "keep", correct: true }
];
const stats = calculateMagicPuzzleStats(attempts);
assert.equal(stats.attempts, 3, "stats count attempts");
assert.equal(stats.correct, 2, "stats count correct answers");
assert.equal(stats.currentStreak, 3, "daily streak counts completed puzzle days");
assert.equal(stats.longestStreak, 3, "longest streak counts completed puzzle days");
assert.equal(Math.round(stats.accuracy * 100), 67, "accuracy is correct-answer percentage");

assert.equal(canUseMagicPuzzles({ isOpenBeta: true, rank: "basic" }), true, "open beta users can use today's puzzle");
assert.equal(canUseMagicPuzzles({ rank: "beta_premium" }), true, "beta premium users can use today's puzzle");
assert.equal(canUseMagicPuzzles({ rank: "basic" }), false, "non-beta basic entitlement object is not enough by itself");
assert.equal(canUseMagicPuzzleArchive({ tierId: "deck_pro" }), true, "pro tier can use archive");
assert.equal(canUseMagicPuzzleArchive({ rank: "basic" }), false, "basic tier cannot use archive");

const handAnalyzer = readFileSync("src/components/HandAnalyzer.tsx", "utf8");
assert.equal(handAnalyzer.includes("Random 7 and analyze"), false, "Random 7 button is removed from the analyzer");
assert.equal(handAnalyzer.includes("Math.random"), false, "analyzer no longer uses random hand generation");

console.log("magicPuzzles tests passed");
