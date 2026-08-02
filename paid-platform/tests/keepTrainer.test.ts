import assert from "node:assert/strict";
import { generateSeededOpeningHand } from "../src/lib/seededHandGenerator";
import {
  calculateTrainerRating,
  calculateTrainerStats,
  isTrainerAnswer,
  publicTrainerHand,
  trainerAttemptFromRow,
  type TrainerAttempt
} from "../src/lib/keepTrainer";

const decklist = `Deck
4 Lightning Bolt
4 Monastery Swiftspear
4 Play with Fire
48 Mountain

Sideboard
4 Smash to Smithereens`;

const firstDeal = generateSeededOpeningHand(decklist, "trainer:fresh:1").hand;
const secondDeal = generateSeededOpeningHand(decklist, "trainer:fresh:2").hand;

assert.equal(firstDeal.length, 7, "trainer generator deals seven cards");
assert.equal(firstDeal.includes("Smash to Smithereens"), false, "trainer generator uses the main deck only");
assert.notDeepEqual(firstDeal, secondDeal, "different on-demand trainer seeds can deal different hands");

assert.equal(isTrainerAnswer("keep"), true, "keep is a trainer answer");
assert.equal(isTrainerAnswer("mulligan"), true, "mulligan is a trainer answer");
assert.equal(isTrainerAnswer("maybe"), false, "unexpected values are rejected");

const attempts: TrainerAttempt[] = [
  { selectedAnswer: "keep", correct: true, ratingAfter: 1014, attemptedAt: "2026-08-01T10:00:00.000Z" },
  { selectedAnswer: "mulligan", correct: false, ratingAfter: 1003, attemptedAt: "2026-08-01T11:00:00.000Z" },
  { selectedAnswer: "keep", correct: true, ratingAfter: 1017, attemptedAt: "2026-08-01T12:00:00.000Z" }
];

const stats = calculateTrainerStats(attempts);
assert.equal(stats.attempts, 3, "trainer stats count attempts");
assert.equal(stats.correct, 2, "trainer stats count correct answers");
assert.equal(stats.currentStreak, 1, "current streak is consecutive correct answers from the latest attempt");
assert.equal(stats.longestStreak, 1, "longest streak resets after a miss");
assert.equal(stats.rating, 1017, "latest stored rating is surfaced");
assert.equal(Math.round(stats.accuracy * 100), 67, "accuracy is correct-answer percentage");
assert.deepEqual(stats.recentResults.map((result) => result.correct), [true, false, true], "recent results are newest first");

assert.equal(calculateTrainerRating([{ selectedAnswer: "keep", correct: true }, { selectedAnswer: "keep", correct: false }]), 1003, "fallback rating uses trainer K values");

const rowAttempt = trainerAttemptFromRow({
  selected_answer: "mulligan",
  is_correct: true,
  rating_before: 1000,
  rating_after: 1014,
  attempted_at: "2026-08-01T13:00:00.000Z"
});
assert.equal(rowAttempt.selectedAnswer, "mulligan", "attempt rows map selected answer");
assert.equal(rowAttempt.correct, true, "attempt rows map correctness");

const publicHand = publicTrainerHand({
  id: "hand-1",
  deck_id: "deck-1",
  deck_name: "Mono-Red",
  format: "Modern",
  hand: JSON.stringify(firstDeal),
  play_draw: "play"
});
assert.equal(publicHand.hand.length, 7, "public trainer hand parses stored JSON hands");
assert.equal(publicHand.reveal, undefined, "public trainer hand does not reveal unanswered hands");

console.log("keepTrainer tests passed");
