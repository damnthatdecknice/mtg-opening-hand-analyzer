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
import { cardPresentationsFromLookups } from "../src/lib/serverCardPresentation";
import type { CardLookup } from "../src/lib/analyzer";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

function lookup(name: string, imageUrl: string, faces: CardLookup["faces"] = []): CardLookup {
  return {
    name,
    typeLine: "",
    manaValue: 0,
    scryfallManaValue: 0,
    manaValueSource: "test fixture",
    manaCost: "",
    oracleText: "",
    colors: [],
    producedMana: [],
    layout: "normal",
    faces,
    isLand: false,
    isMultiface: faces.length > 0,
    imageUrl,
    imageUrls: [imageUrl],
    artCropUrl: "",
    artCropUrls: [],
    mtgoIds: [],
    legalities: {},
  };
}

const duplicateImage = "https://cards.example/island.png";
const duplicatePresentation = cardPresentationsFromLookups(
  ["Island", "Island", "Lightning Bolt"],
  new Map([
    ["Island", lookup("Island", duplicateImage)],
    ["Lightning Bolt", lookup("Lightning Bolt", "https://cards.example/bolt.png")]
  ])
);
assert.equal(duplicatePresentation.cards.length, 3, "card presentation preserves duplicate cards");
assert.equal(duplicatePresentation.cards[0].imageUrl, duplicateImage, "first duplicate keeps its image");
assert.equal(duplicatePresentation.cards[1].imageUrl, duplicateImage, "second duplicate keeps its image");
assert.equal(duplicatePresentation.imageWarnings.length, 0, "resolved duplicate cards do not warn");

const splitPresentation = cardPresentationsFromLookups(
  ["Roaring Furnace"],
  new Map([
    [
      "Roaring Furnace // Steaming Sauna",
      lookup("Roaring Furnace // Steaming Sauna", "https://cards.example/room.png", [
        { name: "Roaring Furnace", manaCost: "{1}{R}", typeLine: "Enchantment - Room", oracleText: "", manaValue: 2 },
        { name: "Steaming Sauna", manaCost: "{4}{U}", typeLine: "Enchantment - Room", oracleText: "", manaValue: 5 }
      ])
    ]
  ])
);
assert.equal(splitPresentation.cards[0].canonicalName, "Roaring Furnace // Steaming Sauna", "face names map back to their full card lookup");
assert.equal(splitPresentation.cards[0].imageStatus, "ready", "split/room face names can use the parent card image");

const missingPresentation = cardPresentationsFromLookups(["Unknown Card"], new Map());
assert.equal(missingPresentation.cards[0].imageStatus, "missing", "missing images are represented per card");
assert.equal(missingPresentation.imageWarnings.length, 1, "missing images produce explicit warnings");

const answerRouteSource = readFileSync(
  join(process.cwd(), "src/app/api/trainer/hands/[handId]/answer/route.ts"),
  "utf8"
);
assert.equal(answerRouteSource.includes("keepTrainerScoringSettings"), false, "trainer answers do not use reduced scoring settings");
assert.equal(answerRouteSource.includes("fallbackTrainerAnswer"), false, "trainer answers do not use heuristic fallback scoring");

console.log("keepTrainer tests passed");
