import assert from "node:assert/strict";
import { generateSeededOpeningHand } from "../src/lib/seededHandGenerator";
import {
  calculateTrainerRating,
  calculateTrainerStats,
  isTrainerAnswer,
  publicTrainerHand,
  trainerAttemptFromRow,
  trainerExplanationFromAnalysis,
  trainerRatingDeltaFromAnalysis,
  type TrainerAttempt
} from "../src/lib/keepTrainer";
import type { AnalyzerResult } from "../src/lib/analyzer";
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
assert.equal(trainerRatingDeltaFromAnalysis({ keepAdvantage: 0.001 }, false), -3, "close trainer decisions only lose a small rating amount");
assert.equal(trainerRatingDeltaFromAnalysis({ keepAdvantage: -0.001 }, true), 6, "close trainer decisions only gain a small rating amount");
assert.equal(trainerRatingDeltaFromAnalysis({ keepAdvantage: 0.12 }, false), -14, "clear trainer misses lose the full rating amount");
assert.equal(trainerRatingDeltaFromAnalysis({ keepAdvantage: -0.12 }, true), 16, "clear trainer hits gain the full rating amount");

const coachingExplanation = trainerExplanationFromAnalysis(
  {
    landsInHand: 2,
    effectiveLandsInHand: 2,
    handTextureScore: 62,
    recommendation: "Keep",
    deckRelativePercentile: 0.62,
    severeFailureProbability: 0.18,
    keepAdvantage: 0.046,
    scoringVersion: "deck-relative-v1",
    scoreFactors: [
      { label: "development", value: 0.7666, tone: "good" },
      { label: "color access", value: 1, tone: "good" },
      { label: "mana use", value: 0, tone: "neutral" }
    ],
    watchouts: ["The hand can stumble if it misses the third land drop."]
  } as AnalyzerResult,
  "keep"
);
assert.equal(coachingExplanation.decisionMarginLabel, "Keep edge: +4.6%", "trainer reveal formats keep edge as a percentage");
assert.equal(coachingExplanation.decisionConfidence, "moderate", "trainer reveal classifies decision confidence from keep advantage");
assert.equal(coachingExplanation.summaryMetrics?.some((metric) => metric.label === "Deck percentile"), true, "trainer reveal includes deck-relative percentile");
assert.equal(coachingExplanation.coachingFactors?.[0].label, "Color access", "trainer reveal maps raw factor keys to coaching labels");
assert.equal(
  JSON.stringify(coachingExplanation).includes("development: +0.7666"),
  false,
  "trainer reveal does not expose raw score-factor arithmetic in player-facing copy"
);
assert.equal(
  coachingExplanation.technicalRows?.some((row) => row.label === "Scoring version" && row.value === "deck-relative-v1"),
  true,
  "trainer reveal keeps scoring version in collapsed technical details"
);

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
assert.equal(answerRouteSource.includes("preparedAnalysisFromRow"), true, "trainer answers reuse prepared full-model analysis");
assert.equal(answerRouteSource.includes("prepareTrainerAnalysis"), false, "trainer answers do not run full-model scoring synchronously");
assert.equal(answerRouteSource.includes("TRAINER_ANALYSIS_PENDING"), true, "trainer answers return a pending response while scoring finishes");

const prepareRouteSource = readFileSync(
  join(process.cwd(), "src/app/api/trainer/hands/[handId]/prepare/route.ts"),
  "utf8"
);
assert.equal(prepareRouteSource.includes("prepareTrainerAnalysis"), true, "trainer preparation uses the shared full model");
assert.equal(/answered_at\s*:/.test(prepareRouteSource), false, "background preparation does not answer the hand");

const trainerComponentSource = readFileSync(
  join(process.cwd(), "src/components/KeepTrainer.tsx"),
  "utf8"
);
assert.equal(trainerComponentSource.includes("/prepare`"), true, "dealt trainer hands start background preparation");
assert.equal(trainerComponentSource.includes("await preparationPromiseRef.current"), false, "answer submission does not wait for unfinished preparation");
assert.equal(trainerComponentSource.includes("Retry reveal now"), true, "trainer can retry reveal after a pending answer");

console.log("keepTrainer tests passed");
