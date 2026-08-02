import { analyzeOpeningHand, type AnalyzerResult, type CardLookup, type PlayDraw } from "./analyzer";
import { parseDecklist } from "./deckParser";
import { puzzleDecks, type PuzzleDeck } from "../data/puzzleDecks";
import { deterministicIndex, generateSeededOpeningHand } from "./seededHandGenerator";

export type MagicPuzzleAnswer = "keep" | "mulligan";
export type MagicPuzzleType = "opening-hand";

export type MagicPuzzleExplanation = {
  verdict: MagicPuzzleAnswer;
  headline: string;
  lesson: string;
  keyFactors: string[];
  supportingPoints: string[];
  watchFor: string[];
  risk: string;
  score: number;
  recommendation: string;
  percentile: number;
  severeFailureProbability: number;
  keepAdvantage?: number;
};

export type MagicPuzzle = {
  id: string;
  puzzleDate: string;
  type: MagicPuzzleType;
  seed: string;
  deckId: string;
  deckName: string;
  format: string;
  archetype: string;
  decklist: string;
  hand: string[];
  playDraw: PlayDraw;
  difficulty: "beginner" | "intermediate" | "advanced";
  lessonCategory: string;
  correctAnswer: MagicPuzzleAnswer;
  explanation: MagicPuzzleExplanation;
  analysisSummary: {
    score: number;
    mulliganAverage?: number;
    severeFailureProbability: number;
    scoreMargin: number;
  };
  qualityScore: number;
  source: "generated" | "fallback";
  generatorVersion: string;
};

export type PublicMagicPuzzle = {
  id: string;
  puzzleDate: string;
  type: MagicPuzzleType;
  deckName: string;
  format: string;
  archetype: string;
  hand: string[];
  playDraw: PlayDraw;
  difficulty: MagicPuzzle["difficulty"];
  lessonCategory?: string;
  completed?: boolean;
  selectedAnswer?: MagicPuzzleAnswer;
  reveal?: MagicPuzzleReveal;
};

export type MagicPuzzleReveal = {
  correct: boolean;
  correctAnswer: MagicPuzzleAnswer;
  explanation: MagicPuzzleExplanation;
};

export type MagicPuzzleAttempt = {
  puzzleDate: string;
  selectedAnswer: MagicPuzzleAnswer;
  correct: boolean;
  createdAt?: string;
};

export type MagicPuzzleStats = {
  attempts: number;
  correct: number;
  accuracy: number;
  currentStreak: number;
  longestStreak: number;
  rating: number;
  recentResults: Array<{ puzzleDate: string; correct: boolean }>;
};

export type MagicPuzzleDeckOption = {
  id: string;
  name: string;
  format: string;
  mainCount: number;
};

export type MagicPuzzleDeckInput = {
  id: string;
  name: string;
  format?: string | null;
  decklist: string;
};

export const magicPuzzleGeneratorVersion = "opening-edge-puzzles-v1";
const lightweightTrainerGeneratorVersion = `${magicPuzzleGeneratorVersion}-trainer-lightweight`;
const completedTrainerGeneratorVersion = `${magicPuzzleGeneratorVersion}-trainer`;

const puzzleScoringSettings = {
  handSimulations: 12,
  baselineHands: 48,
  drawsPerBaselineHand: 8,
  analysisHorizon: 5,
  beamWidth: 18,
  mulliganHands: 18
};

export type MagicPuzzleDatabaseRow = {
  id: string;
  puzzle_date: string;
  puzzle_type: string;
  format: string;
  deck_name: string;
  archetype: string | null;
  decklist: string;
  hand: string[] | string;
  play_draw: PlayDraw;
  correct_answer: MagicPuzzleAnswer;
  difficulty: MagicPuzzle["difficulty"];
  lesson_category: string;
  analysis_json: MagicPuzzle["analysisSummary"];
  explanation_json: MagicPuzzleExplanation;
  source_type: MagicPuzzle["source"];
  seed: string;
  generator_version: string;
};

export type MagicPuzzleAttemptDatabaseRow = {
  puzzle_date: string;
  selected_answer: MagicPuzzleAnswer;
  is_correct: boolean;
  attempted_at?: string;
};

const colorByBasic: Record<string, string[]> = {
  Plains: ["W"],
  Island: ["U"],
  Swamp: ["B"],
  Mountain: ["R"],
  Forest: ["G"]
};

const landProduction: Record<string, string[]> = {
  "Steam Vents": ["U", "R"],
  "Spirebluff Canal": ["U", "R"],
  "Riverpyre Verge": ["U", "R"],
  "Stormcarved Coast": ["U", "R"],
  "Battlefield Forge": ["W", "R"],
  "Inspiring Vantage": ["W", "R"],
  "Sacred Foundry": ["W", "R"],
  "Arid Mesa": ["W", "R"],
  "Marsh Flats": ["W", "B"],
  "Blooming Marsh": ["B", "G"],
  "Llanowar Wastes": ["B", "G"],
  "Overgrown Tomb": ["B", "G"],
  "Restless Cottage": ["B", "G"],
  "Riverglide Pathway": ["U", "R"],
  "Volcanic Island": ["U", "R"],
  "Wasteland": ["C"],
  "Scalding Tarn": ["U", "R"],
  "Misty Rainforest": ["U", "G"],
  "Simic Growth Chamber": ["U", "G"],
  "Gruul Turf": ["R", "G"],
  "Selesnya Sanctuary": ["W", "G"],
  "The Mycosynth Gardens": ["C"],
  "Urza's Saga": ["C"],
  "Boseiju, Who Endures": ["G"],
  "Castle Garenbrig": ["G"]
};

const cardOverrides: Record<string, Partial<CardLookup>> = {
  "Boomerang Basics": { manaCost: "{1}{U}", manaValue: 2, typeLine: "Instant", colors: ["U"] },
  "Burst Lightning": { manaCost: "{R}", manaValue: 1, typeLine: "Instant", colors: ["R"], oracleText: "Kicker {4}. Burst Lightning deals 2 damage to any target." },
  "Eddymurk Crab": { manaCost: "{1}{U}", manaValue: 2, typeLine: "Creature", colors: ["U"] },
  "Flow State": { manaCost: "{U}", manaValue: 1, typeLine: "Instant", colors: ["U"], oracleText: "Draw a card." },
  "Get Out": { manaCost: "{1}{U}", manaValue: 2, typeLine: "Instant", colors: ["U"] },
  "Into the Flood Maw": { manaCost: "{U}", manaValue: 1, typeLine: "Instant", colors: ["U"] },
  "Opt": { manaCost: "{U}", manaValue: 1, typeLine: "Instant", colors: ["U"], oracleText: "Scry 1. Draw a card." },
  "Roaring Furnace // Steaming Sauna": {
    manaCost: "{1}{R} // {4}{U}",
    manaValue: 2,
    scryfallManaValue: 7,
    manaValueSource: "cheapest split face mana cost",
    typeLine: "Enchantment - Room",
    colors: ["U", "R"],
    layout: "room",
    faces: [
      { name: "Roaring Furnace", manaCost: "{1}{R}", manaValue: 2, typeLine: "Enchantment - Room", oracleText: "" },
      { name: "Steaming Sauna", manaCost: "{4}{U}", manaValue: 5, typeLine: "Enchantment - Room", oracleText: "" }
    ]
  },
  "Secret Identity": { manaCost: "{U}", manaValue: 1, typeLine: "Instant", colors: ["U"] },
  "Sleight of Hand": { manaCost: "{U}", manaValue: 1, typeLine: "Sorcery", colors: ["U"], oracleText: "Look at the top two cards of your library. Put one into your hand and the other on the bottom." },
  "Slickshot Show-Off": { manaCost: "{1}{R}", manaValue: 2, typeLine: "Creature", colors: ["R"] },
  "Stormchaser's Talent": { manaCost: "{U}", manaValue: 1, typeLine: "Enchantment", colors: ["U"], oracleText: "When this Class enters, create a token. Level abilities." },
  "Monastery Swiftspear": { manaCost: "{R}", manaValue: 1, typeLine: "Creature", colors: ["R"] },
  "Lightning Strike": { manaCost: "{1}{R}", manaValue: 2, typeLine: "Instant", colors: ["R"] },
  "Lightning Bolt": { manaCost: "{R}", manaValue: 1, typeLine: "Instant", colors: ["R"] },
  "Play with Fire": { manaCost: "{R}", manaValue: 1, typeLine: "Instant", colors: ["R"], oracleText: "Deal 2 damage. Scry 1." },
  "Phoenix Chick": { manaCost: "{R}", manaValue: 1, typeLine: "Creature", colors: ["R"] },
  "Kumano Faces Kakkazan": { manaCost: "{R}", manaValue: 1, typeLine: "Enchantment", colors: ["R"] },
  "Charming Scoundrel": { manaCost: "{1}{R}", manaValue: 2, typeLine: "Creature", colors: ["R"] },
  "Wrenn's Resolve": { manaCost: "{1}{R}", manaValue: 2, typeLine: "Sorcery", colors: ["R"], oracleText: "Exile the top two cards of your library." },
  "Galvanic Discharge": { manaCost: "{R}", manaValue: 1, typeLine: "Instant", colors: ["R"] },
  "Guide of Souls": { manaCost: "{W}", manaValue: 1, typeLine: "Creature", colors: ["W"] },
  "Ocelot Pride": { manaCost: "{W}", manaValue: 1, typeLine: "Creature", colors: ["W"] },
  "Ragavan, Nimble Pilferer": { manaCost: "{R}", manaValue: 1, typeLine: "Creature", colors: ["R"] },
  "Amped Raptor": { manaCost: "{1}{R}", manaValue: 2, typeLine: "Creature", colors: ["R"] },
  "Ajani, Nacatl Pariah": { manaCost: "{1}{W}", manaValue: 2, typeLine: "Creature", colors: ["W"] },
  "Phlage, Titan of Fire's Fury": { manaCost: "{1}{R}{W}", manaValue: 3, typeLine: "Creature", colors: ["W", "R"] },
  "Static Prison": { manaCost: "{W}", manaValue: 1, typeLine: "Enchantment", colors: ["W"] },
  "Unstable Amulet": { manaCost: "{1}{R}", manaValue: 2, typeLine: "Artifact", colors: ["R"] },
  "Consider": { manaCost: "{U}", manaValue: 1, typeLine: "Instant", colors: ["U"], oracleText: "Surveil 1. Draw a card." },
  "Fiery Impulse": { manaCost: "{R}", manaValue: 1, typeLine: "Instant", colors: ["R"] },
  "Lightning Axe": { manaCost: "{R}", manaValue: 1, typeLine: "Instant", colors: ["R"] },
  "Picklock Prankster": { manaCost: "{1}{U}", manaValue: 2, typeLine: "Creature", colors: ["U"] },
  "Ledger Shredder": { manaCost: "{1}{U}", manaValue: 2, typeLine: "Creature", colors: ["U"] },
  "Arclight Phoenix": { manaCost: "{3}{R}", manaValue: 4, typeLine: "Creature", colors: ["R"] },
  "Pieces of the Puzzle": { manaCost: "{2}{U}", manaValue: 3, typeLine: "Sorcery", colors: ["U"] },
  "Treasure Cruise": { manaCost: "{7}{U}", manaValue: 8, typeLine: "Sorcery", colors: ["U"] },
  "Fatal Push": { manaCost: "{B}", manaValue: 1, typeLine: "Instant", colors: ["B"] },
  "Thoughtseize": { manaCost: "{B}", manaValue: 1, typeLine: "Sorcery", colors: ["B"] },
  "Mosswood Dreadknight": { manaCost: "{1}{G}", manaValue: 2, typeLine: "Creature", colors: ["B", "G"] },
  "Caustic Bronco": { manaCost: "{1}{B}", manaValue: 2, typeLine: "Creature", colors: ["B"] },
  "Glissa Sunslayer": { manaCost: "{1}{B}{G}", manaValue: 3, typeLine: "Creature", colors: ["B", "G"] },
  "Go for the Throat": { manaCost: "{1}{B}", manaValue: 2, typeLine: "Instant", colors: ["B"] },
  "Duress": { manaCost: "{B}", manaValue: 1, typeLine: "Sorcery", colors: ["B"] },
  "Archfiend of the Dross": { manaCost: "{2}{B}{B}", manaValue: 4, typeLine: "Creature", colors: ["B"] },
  "Sheoldred, the Apocalypse": { manaCost: "{2}{B}{B}", manaValue: 4, typeLine: "Creature", colors: ["B"] },
  "Amulet of Vigor": { manaCost: "{1}", manaValue: 1, typeLine: "Artifact", colors: [] },
  "Arboreal Grazer": { manaCost: "{G}", manaValue: 1, typeLine: "Creature", colors: ["G"], oracleText: "You may put a land card from your hand onto the battlefield tapped." },
  "Explore": { manaCost: "{1}{G}", manaValue: 2, typeLine: "Sorcery", colors: ["G"], oracleText: "You may play an additional land this turn. Draw a card." },
  "Dryad of the Ilysian Grove": { manaCost: "{2}{G}", manaValue: 3, typeLine: "Creature", colors: ["G"], oracleText: "You may play an additional land on each of your turns." },
  "Primeval Titan": { manaCost: "{4}{G}{G}", manaValue: 6, typeLine: "Creature", colors: ["G"] },
  "Cultivator Colossus": { manaCost: "{4}{G}{G}{G}", manaValue: 7, typeLine: "Creature", colors: ["G"] },
  "Summoner's Pact": { manaCost: "{0}", manaValue: 0, typeLine: "Instant", colors: ["G"] },
  "Brainstorm": { manaCost: "{U}", manaValue: 1, typeLine: "Instant", colors: ["U"], oracleText: "Draw three cards, then put two cards from your hand on top." },
  "Daze": { manaCost: "{1}{U}", manaValue: 2, typeLine: "Instant", colors: ["U"] },
  "Delver of Secrets": { manaCost: "{U}", manaValue: 1, typeLine: "Creature", colors: ["U"] },
  "Dragon's Rage Channeler": { manaCost: "{R}", manaValue: 1, typeLine: "Creature", colors: ["R"] },
  "Force of Will": { manaCost: "{3}{U}{U}", manaValue: 5, typeLine: "Instant", colors: ["U"] },
  "Murktide Regent": { manaCost: "{5}{U}{U}", manaValue: 7, typeLine: "Creature", colors: ["U"] },
  "Ponder": { manaCost: "{U}", manaValue: 1, typeLine: "Sorcery", colors: ["U"], oracleText: "Look at the top three cards, then draw a card." },
  "Expressive Iteration": { manaCost: "{U}{R}", manaValue: 2, typeLine: "Sorcery", colors: ["U", "R"] },
  "Desperate Ritual": { manaCost: "{1}{R}", manaValue: 2, typeLine: "Instant", colors: ["R"], oracleText: "Add {R}{R}{R}." },
  "Pyretic Ritual": { manaCost: "{1}{R}", manaValue: 2, typeLine: "Instant", colors: ["R"], oracleText: "Add {R}{R}{R}." },
  "Manamorphose": { manaCost: "{1}{R}", manaValue: 2, typeLine: "Instant", colors: ["R"], oracleText: "Add two mana in any combination of colors. Draw a card." },
  "Ruby Medallion": { manaCost: "{2}", manaValue: 2, typeLine: "Artifact", colors: [], oracleText: "Red spells you cast cost {1} less to cast." },
  "Strike It Rich": { manaCost: "{R}", manaValue: 1, typeLine: "Sorcery", colors: ["R"], oracleText: "Create a Treasure token." },
  "Wish": { manaCost: "{2}{R}", manaValue: 3, typeLine: "Sorcery", colors: ["R"] },
  "Reckless Impulse": { manaCost: "{1}{R}", manaValue: 2, typeLine: "Sorcery", colors: ["R"] },
  "Glimpse the Impossible": { manaCost: "{2}{R}", manaValue: 3, typeLine: "Sorcery", colors: ["R"] },
  "Flame of Anor": { manaCost: "{1}{U}{R}", manaValue: 3, typeLine: "Instant", colors: ["U", "R"] },
  "Ral, Monsoon Mage": { manaCost: "{1}{R}", manaValue: 2, typeLine: "Creature", colors: ["R"] },
  "Past in Flames": { manaCost: "{3}{R}", manaValue: 4, typeLine: "Sorcery", colors: ["R"] }
};

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, " ");
}

function lookupTemplate(name: string): CardLookup {
  const basicColors = colorByBasic[name] ?? [];
  const landColors = landProduction[name] ?? basicColors;
  const isLand = Boolean(landColors.length);
  return {
    name,
    manaCost: "",
    manaValue: isLand ? 0 : 2,
    scryfallManaValue: isLand ? 0 : 2,
    manaValueSource: isLand ? "land" : "curated puzzle fallback",
    typeLine: isLand ? `Land${basicColors.length ? ` - ${name}` : ""}` : "Spell",
    oracleText: isLand ? `{T}: Add ${landColors.join(" or ")}.` : "",
    colors: [],
    producedMana: landColors,
    layout: "normal",
    faces: [],
    imageUrl: "",
    imageUrls: [],
    artCropUrl: "",
    artCropUrls: [],
    mtgoIds: [],
    legalities: {},
    isLand,
    isMultiface: false
  };
}

export function buildCuratedCardData(decklist: string) {
  const lookups = new Map<string, CardLookup>();
  for (const card of parseDecklist(decklist).cards) {
    const base = lookupTemplate(card.name);
    const override = cardOverrides[card.name] ?? {};
    const lookup = {
      ...base,
      ...override,
      name: card.name,
      scryfallManaValue: override.scryfallManaValue ?? override.manaValue ?? base.scryfallManaValue,
      manaValueSource: override.manaValueSource ?? base.manaValueSource,
      faces: override.faces ?? base.faces,
      isLand: override.isLand ?? base.isLand,
      isMultiface: Boolean(override.faces?.length)
    };
    lookups.set(normalizeName(card.name), lookup);
    for (const face of lookup.faces) {
      if (face.name) {
        lookups.set(normalizeName(face.name), lookup);
      }
    }
  }
  return lookups;
}

function puzzleDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function answerFromAnalysis(analysis: AnalyzerResult): MagicPuzzleAnswer {
  if (analysis.recommendationTone === "bad") {
    return "mulligan";
  }
  if (analysis.keepAdvantage !== undefined && analysis.keepAdvantage < -0.035) {
    return "mulligan";
  }
  return "keep";
}

function marginFromAnalysis(analysis: AnalyzerResult) {
  const mulliganMargin = analysis.mulligan ? Math.abs(analysis.handTextureScore - analysis.mulligan.average) : 0;
  const evMargin = Math.abs(analysis.keepAdvantage ?? 0) * 100;
  return Math.max(mulliganMargin, evMargin);
}

function lessonCategoryFromAnalysis(analysis: AnalyzerResult) {
  const searchable = [
    ...analysis.scoreFactors.map((factor) => `${factor.label} ${factor.value}`),
    ...analysis.watchouts,
    ...analysis.tags.map((tag) => tag.label)
  ].join(" ");
  if (/color|castability|cast/i.test(searchable)) {
    return "functional mana";
  }
  if (/land count|one land|zero land|third land|screw/i.test(searchable)) {
    return "land development";
  }
  if (/flood|too many land/i.test(searchable)) {
    return "flood risk";
  }
  if (/ramp/i.test(searchable)) {
    return "ramp payoff";
  }
  if (/selection|draw|cantrip|look/i.test(searchable)) {
    return "card selection";
  }
  return "opening-hand texture";
}

function difficultyFromAnalysis(analysis: AnalyzerResult, margin: number): MagicPuzzle["difficulty"] {
  const landExtreme = analysis.landsInHand <= 1 || analysis.landsInHand >= 5;
  const colorWarning = analysis.tags.some((tag) => /color|castability/i.test(tag.label));
  if (margin >= 18 && (landExtreme || colorWarning || analysis.severeFailureProbability >= 0.3)) {
    return "beginner";
  }
  if (margin <= 11 || Math.abs((analysis.keepAdvantage ?? 0) * 100) <= 4) {
    return "advanced";
  }
  return "intermediate";
}

function explanationFromAnalysis(analysis: AnalyzerResult, answer: MagicPuzzleAnswer): MagicPuzzleExplanation {
  const factors = analysis.scoreFactors
    .slice(0, 3)
    .map((factor) => `${factor.label}: ${factor.value > 0 ? "+" : ""}${factor.value}`)
    .filter(Boolean);
  const risk =
    analysis.watchouts.find((note) => /land|color|cast|mulligan|failure|flood/i.test(note)) ??
    "The main risk is whether the hand converts its early mana into useful action.";

  return {
    verdict: answer,
    headline:
      answer === "keep"
        ? "Keep. The hand clears the puzzle filter because its keep value is meaningfully above the mulligan baseline."
        : "Mulligan. The hand fails the puzzle filter because the mulligan baseline is meaningfully better.",
    lesson:
      answer === "keep"
        ? "A keepable hand is one that can turn its mana, colors, and early cards into a real sequence."
        : "A hand can contain powerful cards and still be a mulligan if the mana or timing does not function.",
    keyFactors: factors.length ? factors : [
      `${analysis.landsInHand} land(s), ${analysis.effectiveLandsInHand} effective source(s), score ${analysis.handTextureScore}/100.`
    ],
    supportingPoints: [
      `Opening Hand Score: ${analysis.handTextureScore}/100.`,
      `Severe failure risk: ${Math.round(analysis.severeFailureProbability * 100)}%.`,
      analysis.mulligan
        ? `Mulligan baseline: ${analysis.mulligan.average.toFixed(1)}.`
        : "Mulligan baseline was not available for this puzzle."
    ],
    watchFor: analysis.watchouts.slice(0, 3),
    risk,
    score: analysis.handTextureScore,
    recommendation: analysis.recommendation,
    percentile: analysis.deckRelativePercentile,
    severeFailureProbability: analysis.severeFailureProbability,
    keepAdvantage: analysis.keepAdvantage
  };
}

function pendingTrainerExplanation(hand: string[], playDraw: PlayDraw): MagicPuzzleExplanation {
  return {
    verdict: "keep",
    headline: "Make your keep or mulligan call first. Opening Edge is preparing the scored reveal.",
    lesson: "The trainer deals the hand immediately, then runs the slower scoring model in the background.",
    keyFactors: [
      `${hand.length} cards dealt ${playDraw === "play" ? "on the play" : "on the draw"}.`
    ],
    supportingPoints: ["Analysis is still preparing."],
    watchFor: [],
    risk: "The trainer has not revealed the scored risk profile yet.",
    score: 0,
    recommendation: "Analysis pending",
    percentile: 0,
    severeFailureProbability: 0
  };
}

function buildPuzzle(deck: PuzzleDeck, puzzleDate: string, attempt: number, source: MagicPuzzle["source"]): MagicPuzzle | null {
  const seed = `${puzzleDate}:${deck.id}:${attempt}`;
  const hand = generateSeededOpeningHand(deck.decklist, seed).hand;
  if (hand.length !== 7) {
    return null;
  }

  const playDraw: PlayDraw = deterministicIndex(`${seed}:play-draw`, 2) === 0 ? "play" : "draw";
  const cardData = buildCuratedCardData(deck.decklist);
  const analysis = analyzeOpeningHand(deck.decklist, hand, cardData, playDraw, {
    format: deck.format,
    scoringSettings: puzzleScoringSettings
  });
  if (analysis.missingCards.length || analysis.notes.some((note) => /exactly seven|No lands were identified/i.test(note))) {
    return null;
  }

  const scoreMargin = marginFromAnalysis(analysis);
  const answer = answerFromAnalysis(analysis);
  const lessonCategory = lessonCategoryFromAnalysis(analysis);
  const difficulty = difficultyFromAnalysis(analysis, scoreMargin);
  const hasTakeaway = analysis.scoreFactors.length > 0 || analysis.watchouts.length > 0;
  if (source === "generated" && (scoreMargin < 8 || !hasTakeaway || analysis.recommendationTone === "neutral")) {
    return null;
  }

  return {
    id: `opening-hand:${puzzleDate}`,
    puzzleDate,
    type: "opening-hand",
    seed,
    deckId: deck.id,
    deckName: deck.name,
    format: deck.format,
    archetype: deck.archetype,
    decklist: deck.decklist,
    hand,
    playDraw,
    difficulty,
    lessonCategory,
    correctAnswer: answer,
    explanation: explanationFromAnalysis(analysis, answer),
    analysisSummary: {
      score: analysis.handTextureScore,
      mulliganAverage: analysis.mulligan?.average,
      severeFailureProbability: analysis.severeFailureProbability,
      scoreMargin
    },
    qualityScore: scoreMargin + Math.abs(analysis.handTextureScore - 50) / 4,
    source,
    generatorVersion: magicPuzzleGeneratorVersion
  };
}

function buildTrainingPuzzle(deck: MagicPuzzleDeckInput, seed: string): MagicPuzzle | null {
  const hand = generateSeededOpeningHand(deck.decklist, seed).hand;
  if (hand.length !== 7) {
    return null;
  }

  const playDraw: PlayDraw = deterministicIndex(`${seed}:play-draw`, 2) === 0 ? "play" : "draw";
  const cardData = buildCuratedCardData(deck.decklist);
  const analysis = analyzeOpeningHand(deck.decklist, hand, cardData, playDraw, {
    format: deck.format ?? "Unknown",
    scoringSettings: puzzleScoringSettings
  });
  if (analysis.missingCards.length || analysis.notes.some((note) => /exactly seven|No lands were identified/i.test(note))) {
    return null;
  }

  const scoreMargin = marginFromAnalysis(analysis);
  const answer = answerFromAnalysis(analysis);
  const puzzleDate = new Date().toISOString().slice(0, 10);

  return {
    id: `trainer:${deck.id}:${seed.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    puzzleDate,
    type: "opening-hand",
    seed,
    deckId: deck.id,
    deckName: deck.name,
    format: deck.format ?? "Unknown",
    archetype: "Saved deck",
    decklist: deck.decklist,
    hand,
    playDraw,
    difficulty: difficultyFromAnalysis(analysis, scoreMargin),
    lessonCategory: lessonCategoryFromAnalysis(analysis),
    correctAnswer: answer,
    explanation: explanationFromAnalysis(analysis, answer),
    analysisSummary: {
      score: analysis.handTextureScore,
      mulliganAverage: analysis.mulligan?.average,
      severeFailureProbability: analysis.severeFailureProbability,
      scoreMargin
    },
    qualityScore: scoreMargin + Math.abs(analysis.handTextureScore - 50) / 4,
    source: "generated",
    generatorVersion: completedTrainerGeneratorVersion
  };
}

function buildFastTrainingPuzzle(deck: MagicPuzzleDeckInput, seed: string): MagicPuzzle | null {
  const hand = generateSeededOpeningHand(deck.decklist, seed).hand;
  if (hand.length !== 7) {
    return null;
  }

  const playDraw: PlayDraw = deterministicIndex(`${seed}:play-draw`, 2) === 0 ? "play" : "draw";
  const puzzleDate = new Date().toISOString().slice(0, 10);

  return {
    id: `trainer:${deck.id}:${seed.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    puzzleDate,
    type: "opening-hand",
    seed,
    deckId: deck.id,
    deckName: deck.name,
    format: deck.format ?? "Unknown",
    archetype: "Saved deck",
    decklist: deck.decklist,
    hand,
    playDraw,
    difficulty: "intermediate",
    lessonCategory: "opening-hand texture",
    correctAnswer: "keep",
    explanation: pendingTrainerExplanation(hand, playDraw),
    analysisSummary: {
      score: 0,
      severeFailureProbability: 0,
      scoreMargin: 0
    },
    qualityScore: 0,
    source: "generated",
    generatorVersion: lightweightTrainerGeneratorVersion
  };
}

export function generateMagicPuzzleForDeck(deck: MagicPuzzleDeckInput, seedInput?: string) {
  const seed = seedInput ?? `${deck.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const puzzle = buildTrainingPuzzle(deck, `${seed}:${attempt}`);
    if (puzzle) {
      return puzzle;
    }
  }
  throw new Error("Could not generate a seven-card training hand for this deck.");
}

export function generateFastMagicPuzzleForDeck(deck: MagicPuzzleDeckInput, seedInput?: string) {
  const seed = seedInput ?? `${deck.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const puzzle = buildFastTrainingPuzzle(deck, `${seed}:${attempt}`);
    if (puzzle) {
      return puzzle;
    }
  }
  throw new Error("Could not deal a seven-card training hand for this deck.");
}

export function isLightweightTrainerPuzzle(puzzle: MagicPuzzle) {
  return puzzle.generatorVersion === lightweightTrainerGeneratorVersion;
}

export function completeMagicPuzzleAnalysis(puzzle: MagicPuzzle): MagicPuzzle {
  if (!isLightweightTrainerPuzzle(puzzle)) {
    return puzzle;
  }

  const cardData = buildCuratedCardData(puzzle.decklist);
  const analysis = analyzeOpeningHand(puzzle.decklist, puzzle.hand, cardData, puzzle.playDraw, {
    format: puzzle.format,
    scoringSettings: puzzleScoringSettings
  });

  if (analysis.missingCards.length || analysis.notes.some((note) => /exactly seven|No lands were identified/i.test(note))) {
    throw new Error("Opening Edge could not finish scoring this trainer hand.");
  }

  const scoreMargin = marginFromAnalysis(analysis);
  const answer = answerFromAnalysis(analysis);

  return {
    ...puzzle,
    difficulty: difficultyFromAnalysis(analysis, scoreMargin),
    lessonCategory: lessonCategoryFromAnalysis(analysis),
    correctAnswer: answer,
    explanation: explanationFromAnalysis(analysis, answer),
    analysisSummary: {
      score: analysis.handTextureScore,
      mulliganAverage: analysis.mulligan?.average,
      severeFailureProbability: analysis.severeFailureProbability,
      scoreMargin
    },
    qualityScore: scoreMargin + Math.abs(analysis.handTextureScore - 50) / 4,
    generatorVersion: completedTrainerGeneratorVersion
  };
}

export function generateMagicPuzzleForDate(dateInput: Date | string = new Date()) {
  const puzzleDate = typeof dateInput === "string" ? dateInput : puzzleDateString(dateInput);
  const startIndex = deterministicIndex(`${puzzleDate}:deck`, puzzleDecks.length);
  const candidates: MagicPuzzle[] = [];

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const deck = puzzleDecks[(startIndex + attempt) % puzzleDecks.length];
    if (!deck) {
      continue;
    }
    const puzzle = buildPuzzle(deck, puzzleDate, attempt, "generated");
    if (puzzle) {
      candidates.push(puzzle);
    }
  }

  return candidates.sort((a, b) => b.qualityScore - a.qualityScore)[0] ?? fallbackPuzzleForDate(puzzleDate);
}

export function magicPuzzleToDatabaseRow(puzzle: MagicPuzzle): MagicPuzzleDatabaseRow {
  return {
    id: puzzle.id,
    puzzle_date: puzzle.puzzleDate,
    puzzle_type: puzzle.type,
    format: puzzle.format,
    deck_name: puzzle.deckName,
    archetype: puzzle.archetype,
    decklist: puzzle.decklist,
    hand: puzzle.hand,
    play_draw: puzzle.playDraw,
    correct_answer: puzzle.correctAnswer,
    difficulty: puzzle.difficulty,
    lesson_category: puzzle.lessonCategory,
    analysis_json: puzzle.analysisSummary,
    explanation_json: puzzle.explanation,
    source_type: puzzle.source,
    seed: puzzle.seed,
    generator_version: puzzle.generatorVersion
  };
}

export function magicPuzzleFromDatabaseRow(row: MagicPuzzleDatabaseRow): MagicPuzzle {
  return {
    id: row.id,
    puzzleDate: row.puzzle_date,
    type: "opening-hand",
    seed: row.seed,
    deckId: row.id,
    deckName: row.deck_name,
    format: row.format,
    archetype: row.archetype ?? row.deck_name,
    decklist: row.decklist,
    hand: Array.isArray(row.hand) ? row.hand : JSON.parse(row.hand),
    playDraw: row.play_draw,
    difficulty: row.difficulty,
    lessonCategory: row.lesson_category,
    correctAnswer: row.correct_answer,
    explanation: row.explanation_json,
    analysisSummary: row.analysis_json,
    qualityScore: row.analysis_json.scoreMargin,
    source: row.source_type,
    generatorVersion: row.generator_version
  };
}

export function magicPuzzleAttemptFromDatabaseRow(row: MagicPuzzleAttemptDatabaseRow): MagicPuzzleAttempt {
  return {
    puzzleDate: row.puzzle_date,
    selectedAnswer: row.selected_answer,
    correct: row.is_correct,
    createdAt: row.attempted_at
  };
}

export function fallbackPuzzleForDate(dateInput: Date | string = new Date()) {
  const puzzleDate = typeof dateInput === "string" ? dateInput : puzzleDateString(dateInput);
  const deck = puzzleDecks[deterministicIndex(`${puzzleDate}:fallback`, puzzleDecks.length)] ?? puzzleDecks[0];
  const puzzle = deck ? buildPuzzle(deck, puzzleDate, 1000 + deterministicIndex(`${puzzleDate}:attempt`, 7), "fallback") : null;
  if (puzzle) {
    return puzzle;
  }
  throw new Error("No valid fallback puzzle decks are configured.");
}

export function publicMagicPuzzle(puzzle: MagicPuzzle, attempt?: MagicPuzzleAttempt): PublicMagicPuzzle {
  return {
    id: puzzle.id,
    puzzleDate: puzzle.puzzleDate,
    type: puzzle.type,
    deckName: puzzle.deckName,
    format: puzzle.format,
    archetype: puzzle.archetype,
    hand: puzzle.hand,
    playDraw: puzzle.playDraw,
    difficulty: puzzle.difficulty,
    lessonCategory: attempt ? puzzle.lessonCategory : undefined,
    completed: Boolean(attempt),
    selectedAnswer: attempt?.selectedAnswer,
    reveal: attempt ? revealMagicPuzzle(puzzle, attempt.selectedAnswer) : undefined
  };
}

export function revealMagicPuzzle(puzzle: MagicPuzzle, selectedAnswer: MagicPuzzleAnswer): MagicPuzzleReveal {
  return {
    correct: selectedAnswer === puzzle.correctAnswer,
    correctAnswer: puzzle.correctAnswer,
    explanation: puzzle.explanation
  };
}

export function calculateMagicPuzzleStats(attempts: MagicPuzzleAttempt[]): MagicPuzzleStats {
  const sorted = [...attempts].sort(
    (a, b) => a.puzzleDate.localeCompare(b.puzzleDate) || (a.createdAt ?? "").localeCompare(b.createdAt ?? "")
  );
  let currentStreak = sorted.length ? 1 : 0;
  let longestStreak = 0;
  let running = 0;
  let previousDate = "";
  for (const attempt of sorted) {
    if (!previousDate || daysBetween(previousDate, attempt.puzzleDate) === 1) {
      running += 1;
    } else if (previousDate !== attempt.puzzleDate) {
      running = 1;
    }
    previousDate = attempt.puzzleDate;
    longestStreak = Math.max(longestStreak, running);
  }
  currentStreak = running;
  const correct = sorted.filter((attempt) => attempt.correct).length;
  return {
    attempts: sorted.length,
    correct,
    accuracy: sorted.length ? correct / sorted.length : 0,
    currentStreak,
    longestStreak,
    rating: calculateMagicPuzzleRating(sorted),
    recentResults: sorted.slice(-7).reverse().map((attempt) => ({
      puzzleDate: attempt.puzzleDate,
      correct: attempt.correct
    }))
  };
}

export function calculateMagicPuzzleRating(attempts: MagicPuzzleAttempt[]) {
  return attempts.reduce((rating, attempt) => {
    const next = rating + (attempt.correct ? 14 : -11);
    return Math.max(100, Math.min(2500, next));
  }, 1000);
}

function daysBetween(previousDate: string, nextDate: string) {
  const previous = Date.parse(`${previousDate}T00:00:00.000Z`);
  const next = Date.parse(`${nextDate}T00:00:00.000Z`);
  return Math.round((next - previous) / 86_400_000);
}

export function canUseMagicPuzzles(entitlements: { rank?: string; isOpenBeta?: boolean; isPermanent?: boolean }) {
  return Boolean(entitlements.isOpenBeta || entitlements.isPermanent || entitlements.rank === "beta_premium");
}

export function canUseMagicPuzzleArchive(entitlements: { rank?: string; tierId?: string; isPermanent?: boolean }) {
  return Boolean(entitlements.isPermanent || entitlements.rank === "beta_premium" || ["deck_pro", "grinder"].includes(entitlements.tierId ?? ""));
}
