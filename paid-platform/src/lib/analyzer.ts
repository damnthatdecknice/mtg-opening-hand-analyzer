import { parseDecklist, type ParsedDeckCard } from "./deckParser";
import { buildManaCurveAnalysis } from "./manaCurve";
import {
  castabilityScoreAdjustment,
  manaSufficiencyAdjustment,
  solveManaPayment,
  scoreHandDeckRelative,
  type DeckRelativeScoreResult,
  type HandScoringSettings,
  type KeepRecommendation,
  type ManaColor,
  type ScoreAdjustment
} from "./handScoring";

export type PlayDraw = "play" | "draw";

function clampScore(value: number) {
  return Math.max(1, Math.min(100, Math.round(value)));
}

export type CardLookup = {
  name: string;
  manaCost: string;
  manaValue: number;
  scryfallManaValue: number;
  manaValueSource: string;
  typeLine: string;
  oracleText: string;
  colors: string[];
  producedMana: string[];
  layout?: string;
  faces: Array<{ name: string; manaCost: string; manaValue: number; typeLine: string; oracleText: string }>;
  imageUrl: string;
  imageUrls: string[];
  artCropUrl: string;
  artCropUrls: string[];
  mtgoIds: number[];
  legalities?: Record<string, string>;
  isLand: boolean;
  isMultiface: boolean;
};

export type SourceNote = {
  cardName: string;
  sourceType: string;
  timing: string;
  text: string;
};

export type CastabilityRow = {
  cardName: string;
  manaValue: number;
  turn1: number;
  turn2: number;
  turn3: number;
};

export type TurnProbability = {
  turn: number;
  naturalDraws: number;
  extraLooks: number;
  nextLandNatural: number;
  nextLandWithDraw: number;
  landDropNatural: number;
  landDropWithDraw: number;
  effectiveLandDrop: number;
};

export type CurveRow = {
  manaValue: string;
  spells: number;
};

export type ManaAuditRow = {
  status: "OK" | "Review" | "Missing" | "Card data only";
  card: string;
  qty: number;
  appManaValue: number;
  symbolCheck: number | null;
  checkSource: string;
  manaCostUsed: string;
  typeLine: string;
  multiface: boolean;
};

export type SourceAssumptionRow = {
  cardName: string;
  kind: "Land" | "Ramp" | "Land equivalent" | "Draw/look";
  timing: string;
  assumption: string;
};

export type MulliganSummary = {
  average: number;
  median: number;
  better: number;
  p25: number;
  p75: number;
  comparison: "london-six" | "free-seven";
  deckContext: {
    label: string;
    adjustment: number;
    note: string;
  };
};

export type PlayDrawComparison = {
  playScore: number;
  drawScore: number;
  playRecommendation: string;
  drawRecommendation: string;
  playTone: "good" | "neutral" | "bad";
  drawTone: "good" | "neutral" | "bad";
  summary: string;
};

export type ScoreFactor = DeckRelativeScoreResult["factors"][number];

export type DeckProfile = {
  label: string;
  landCount: number;
  spellCount: number;
  averageManaValue: number;
  curveTop: number;
  cheapSpellCount: number;
  expensiveSpellCount: number;
  drawSpellCount: number;
  rampSpellCount: number;
  suggestedKeepLandRange: string;
  handLandContext: string;
  handLandTone: "good" | "neutral" | "bad";
  scoreAdjustment: number;
  notes: string[];
};

export type AnalyzerResult = {
  mainCount: number;
  librarySize: number;
  landsInHand: number;
  effectiveLandsInHand: number;
  landsRemaining: number;
  effectiveLandsRemaining: number;
  averageManaValue: number;
  handTextureScore: number;
  baseHandTextureScore: number;
  castabilityTextureAdjustment: number;
  manaTextureAdjustment: number;
  deckRelativePercentile: number;
  riskAdjustedUtility: number;
  scoreConfidence: number;
  scoringVersion: string;
  keepExpectedValue: number;
  mulliganExpectedValue?: number;
  keepAdvantage?: number;
  severeFailureProbability: number;
  scoreFactors: ScoreFactor[];
  handTextureLabel: string;
  recommendation: string;
  recommendationTone: "good" | "neutral" | "bad";
  turnProbabilities: TurnProbability[];
  castability: CastabilityRow[];
  curve: CurveRow[];
  manaAudit: ManaAuditRow[];
  sourceAssumptions: SourceAssumptionRow[];
  drawSources: SourceNote[];
  rampSources: SourceNote[];
  landEquivalentSources: SourceNote[];
  tags: Array<{ label: string; tone: "good" | "neutral" | "bad" }>;
  watchouts: string[];
  mulligan: MulliganSummary | null;
  playDrawComparison: PlayDrawComparison | null;
  deckProfile: DeckProfile;
  commanderCard: string;
  landNames: string[];
  missingCards: string[];
  lookupFailures: string[];
  notes: string[];
};

type ScryfallCard = {
  name: string;
  layout?: string;
  mtgo_id?: number;
  mtgo_foil_id?: number;
  cmc?: number;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  produced_mana?: string[];
  legalities?: Record<string, string>;
  prints_search_uri?: string;
  image_uris?: {
    small?: string;
    normal?: string;
    art_crop?: string;
  };
  card_faces?: Array<{
    name?: string;
    cmc?: number;
    mana_cost?: string;
    type_line?: string;
    oracle_text?: string;
    colors?: string[];
    image_uris?: {
      small?: string;
      normal?: string;
      art_crop?: string;
    };
  }>;
};

function normalizeName(name: string) {
  return name.trim().toLowerCase();
}

function countsFromCards(cards: ParsedDeckCard[], includeSideboard = false) {
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (!includeSideboard && card.section !== "main") {
      continue;
    }
    counts.set(card.name, (counts.get(card.name) ?? 0) + card.qty);
  }
  return counts;
}

function isCommanderStyleFormat(format = "") {
  return ["commander", "brawl"].includes(format.trim().toLowerCase());
}

function commanderCardsFromSideboard(cards: ParsedDeckCard[], format = "") {
  if (!isCommanderStyleFormat(format)) {
    return [];
  }

  return cards
    .filter((card) => card.section === "sideboard")
    .flatMap((card) => Array.from({ length: card.qty }, () => card.name))
    .slice(0, 1);
}

function chooseCastableFace(card: ScryfallCard) {
  if (!card.card_faces?.length) {
    return null;
  }
  return (
    card.card_faces.find((face) => !face.type_line?.toLowerCase().includes("land")) ??
    card.card_faces[0]
  );
}

function isCombinedFaceCostCard(card: ScryfallCard) {
  const layout = card.layout?.toLowerCase() ?? "";
  const typeLine = card.type_line?.toLowerCase() ?? "";
  return (
    Boolean(card.card_faces?.length && card.mana_cost?.includes("//")) &&
    !layout.includes("adventure") &&
    !typeLine.includes("adventure")
  );
}

function cheapestNonlandFace(card: ScryfallCard) {
  const faces = (card.card_faces ?? []).filter((face) => !face.type_line?.toLowerCase().includes("land") && face.mana_cost);
  if (!faces.length) {
    return null;
  }
  return [...faces].sort((a, b) => manaValueFromCost(a.mana_cost) - manaValueFromCost(b.mana_cost))[0] ?? null;
}

function manaValueFromCost(cost = "") {
  const symbols = Array.from(cost.matchAll(/\{([^}]+)\}/g)).map((match) => match[1] ?? "");
  return symbols.reduce((total, symbol) => {
    if (/^\d+$/.test(symbol)) {
      return total + Number(symbol);
    }
    if (symbol === "X") {
      return total;
    }
    if (symbol.includes("/")) {
      return total + 1;
    }
    return total + 1;
  }, 0);
}

function parsedManaRequirements(cost = "") {
  const requiredColors: string[] = [];
  let generic = 0;
  for (const match of Array.from(cost.matchAll(/\{([^}]+)\}/g))) {
    const symbol = (match[1] ?? "").toUpperCase();
    if (/^\d+$/.test(symbol)) {
      generic += Number(symbol);
      continue;
    }
    if (symbol === "X") {
      continue;
    }
    const colors = symbol.split("/").filter((part) => "WUBRGC".includes(part));
    if (colors.length) {
      requiredColors.push(colors[0] ?? "");
    } else {
      generic += 1;
    }
  }
  return { requiredColors: requiredColors.filter(Boolean), generic };
}

function checkedManaValueDetails(
  card: ScryfallCard,
  castableFace: NonNullable<ScryfallCard["card_faces"]>[number] | null
) {
  if (isCombinedFaceCostCard(card)) {
    const cheapestFace = cheapestNonlandFace(card) ?? castableFace;
    const faceCostValue = manaValueFromCost(cheapestFace?.mana_cost);
    if (cheapestFace?.mana_cost) {
      return {
        value: faceCostValue,
        source: "cheapest split face mana cost",
        manaCost: cheapestFace.mana_cost,
        symbolCheck: faceCostValue
      };
    }
  }

  const cardCostValue = manaValueFromCost(card.mana_cost);
  if (cardCostValue) {
    return { value: cardCostValue, source: "mana cost", manaCost: card.mana_cost ?? "", symbolCheck: cardCostValue };
  }

  if (castableFace?.mana_cost) {
    const faceCostValue = manaValueFromCost(castableFace.mana_cost);
    if (faceCostValue) {
      return {
        value: faceCostValue,
        source: "face mana cost",
        manaCost: castableFace.mana_cost,
        symbolCheck: faceCostValue
      };
    }
  }

  const nonlandFace = card.card_faces?.find((face) => !face.type_line?.toLowerCase().includes("land") && face.mana_cost);
  if (nonlandFace?.mana_cost) {
    const faceCostValue = manaValueFromCost(nonlandFace.mana_cost);
    if (faceCostValue) {
      return {
        value: faceCostValue,
        source: "nonland face mana cost",
        manaCost: nonlandFace.mana_cost,
        symbolCheck: faceCostValue
      };
    }
  }

  const typeLine = castableFace?.type_line ?? card.type_line ?? "";
  if (typeLine.toLowerCase().includes("land")) {
    return { value: 0, source: "land", manaCost: "", symbolCheck: 0 };
  }

  return {
    value: card.cmc ?? castableFace?.cmc ?? 0,
    source: "card data value only",
    manaCost: card.mana_cost ?? castableFace?.mana_cost ?? "",
    symbolCheck: null
  };
}

function allText(card: CardLookup) {
  return [card.oracleText, ...card.faces.map((face) => face.oracleText)].join(" ").toLowerCase();
}

function allTypeText(card: CardLookup) {
  return [card.typeLine, ...card.faces.map((face) => face.typeLine)].join(" ");
}

function mapScryfallCard(card: ScryfallCard): CardLookup {
  const castableFace = chooseCastableFace(card);
  const typeLine = castableFace?.type_line ?? card.type_line ?? "";
  const manaCheck = checkedManaValueDetails(card, castableFace);
  const imageUrls = Array.from(
    new Set(
      [
        card.image_uris?.normal,
        card.image_uris?.small,
        castableFace?.image_uris?.normal,
        castableFace?.image_uris?.small,
        ...(card.card_faces ?? []).flatMap((face) => [face.image_uris?.normal, face.image_uris?.small])
      ].filter((url): url is string => Boolean(url))
    )
  );
  return {
    name: card.name,
    manaCost: manaCheck.manaCost,
    manaValue: manaCheck.value,
    scryfallManaValue: card.cmc ?? castableFace?.cmc ?? manaCheck.value,
    manaValueSource: manaCheck.source,
    typeLine,
    oracleText: card.oracle_text ?? castableFace?.oracle_text ?? "",
    colors: card.colors ?? castableFace?.colors ?? [],
    producedMana: card.produced_mana ?? [],
    layout: card.layout,
    faces:
      card.card_faces?.map((face) => ({
        name: face.name ?? "",
        manaCost: face.mana_cost ?? "",
        manaValue: face.mana_cost ? manaValueFromCost(face.mana_cost) : face.cmc ?? 0,
        typeLine: face.type_line ?? "",
        oracleText: face.oracle_text ?? ""
      })) ?? [],
    imageUrl: imageUrls[0] ?? "",
    imageUrls,
    artCropUrl: card.image_uris?.art_crop ?? castableFace?.image_uris?.art_crop ?? "",
    artCropUrls: Array.from(
      new Set(
        [
          card.image_uris?.art_crop,
          castableFace?.image_uris?.art_crop,
          ...(card.card_faces ?? []).map((face) => face.image_uris?.art_crop)
        ].filter((url): url is string => Boolean(url))
      )
    ),
    mtgoIds: [card.mtgo_id, card.mtgo_foil_id].filter((id): id is number => Boolean(id)),
    legalities: card.legalities,
    isLand: typeLine.toLowerCase().includes("land"),
    isMultiface: Boolean(card.card_faces?.length)
  };
}

function mergeLookupImages(base: CardLookup, exact: CardLookup): CardLookup {
  const imageUrls = Array.from(new Set([...exact.imageUrls, exact.imageUrl, ...base.imageUrls, base.imageUrl].filter(Boolean)));
  const artCropUrls = Array.from(
    new Set([...exact.artCropUrls, exact.artCropUrl, ...base.artCropUrls, base.artCropUrl].filter(Boolean))
  );
  return {
    ...base,
    imageUrl: imageUrls[0] ?? base.imageUrl,
    imageUrls,
    artCropUrl: artCropUrls[0] ?? base.artCropUrl,
    artCropUrls,
    mtgoIds: Array.from(new Set([...exact.mtgoIds, ...base.mtgoIds]))
  };
}

function replaceLookupImagesWithExact(base: CardLookup, exact: CardLookup): CardLookup {
  const imageUrls = Array.from(new Set([exact.imageUrl, ...exact.imageUrls].filter(Boolean)));
  const artCropUrls = Array.from(new Set([exact.artCropUrl, ...exact.artCropUrls].filter(Boolean)));
  return {
    ...base,
    imageUrl: imageUrls[0] ?? base.imageUrl,
    imageUrls,
    artCropUrl: artCropUrls[0] ?? base.artCropUrl,
    artCropUrls,
    mtgoIds: Array.from(new Set([...exact.mtgoIds, ...base.mtgoIds]))
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scryfallErrorMessage(status: number) {
  if (status === 404) {
    return "Card name not found";
  }
  if (status === 429) {
    return "Card database rate limit";
  }
  if (status >= 500) {
    return "Card database is temporarily unavailable";
  }
  return `Card database returned ${status}`;
}

export type CardDataProgress = {
  completed: number;
  total: number;
  percent: number;
};

type FetchCardDataOptions = {
  exactMtgoImagesOnly?: boolean;
  includePrintImages?: boolean;
  mtgoIdsByName?: Record<string, number[]>;
  onProgress?: (progress: CardDataProgress) => void;
  retryFailures?: boolean;
  signal?: AbortSignal;
};

export type CardDataOperationFailure = {
  kind: "network" | "rate-limit" | "server" | "timeout" | "request-budget";
  message: string;
  retryable: true;
};

export type CardDataLookupResult = {
  lookups: Map<string, CardLookup>;
  failures: string[];
  unresolvedCards?: string[];
  operationFailure?: CardDataOperationFailure;
};

type CardDataRequestBudget = {
  startedAt: number;
  deadlineAt: number;
  requestCount: number;
  maxRequests: number;
};

type CachedCardLookup = {
  lookup: CardLookup;
  expiresAt: number;
};

type CachedLookupFailure = {
  failure: string;
  expiresAt: number;
};

const SUCCESS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const NOT_FOUND_CACHE_TTL_MS = 10 * 60 * 1000;
const TRANSIENT_FAILURE_CACHE_TTL_MS = 15 * 1000;
const MAX_CARD_DATA_CACHE_ENTRIES = 1500;
const CARD_DATA_BATCH_SIZE = 75;
const MAX_BATCH_ATTEMPTS = 3;
const MAX_OPERATION_MS = 12_000;
const MAX_ANOMALOUS_FALLBACKS = 5;

const successfulCardLookupCache = new Map<string, CachedCardLookup>();
const failedCardLookupCache = new Map<string, CachedLookupFailure>();
const inflightCardLookupBatches = new Map<string, Promise<CardDataLookupResult>>();

function lookupAliasKeys(lookup: CardLookup) {
  return new Set([lookup.name, ...lookup.faces.map((face) => face.name)].map(normalizeName).filter(Boolean));
}

function pruneCache<T>(cache: Map<string, T>) {
  while (cache.size > MAX_CARD_DATA_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) {
      return;
    }
    cache.delete(oldestKey);
  }
}

function cacheLookupSuccess(lookup: CardLookup, requestedNames: string[] = []) {
  const expiresAt = Date.now() + SUCCESS_CACHE_TTL_MS;
  for (const key of Array.from(new Set([...Array.from(lookupAliasKeys(lookup)), ...requestedNames.map(normalizeName)].filter(Boolean)))) {
    successfulCardLookupCache.set(key, { lookup, expiresAt });
  }
  pruneCache(successfulCardLookupCache);
}

function getCachedLookup(name: string) {
  const key = normalizeName(name);
  const cached = successfulCardLookupCache.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    successfulCardLookupCache.delete(key);
    return null;
  }
  return cached.lookup;
}

function failureTtl(status?: number) {
  return status === 404 ? NOT_FOUND_CACHE_TTL_MS : TRANSIENT_FAILURE_CACHE_TTL_MS;
}

function cacheLookupFailure(name: string, failure: string, status?: number) {
  if (!failure) {
    return;
  }
  failedCardLookupCache.set(normalizeName(name), { failure, expiresAt: Date.now() + failureTtl(status) });
  pruneCache(failedCardLookupCache);
}

function getCachedFailure(name: string) {
  const key = normalizeName(name);
  const cached = failedCardLookupCache.get(key);
  if (!cached) {
    return null;
  }
  if (cached.expiresAt <= Date.now()) {
    failedCardLookupCache.delete(key);
    return null;
  }
  return cached.failure;
}

function addLookupAliases(lookups: Map<string, CardLookup>, lookup: CardLookup, requestedName?: string) {
  if (requestedName) {
    lookups.set(normalizeName(requestedName), lookup);
  }
  lookups.set(normalizeName(lookup.name), lookup);
  for (const face of lookup.faces) {
    if (face.name) {
      lookups.set(normalizeName(face.name), lookup);
    }
  }
}

export function clearCardDataCacheForTests() {
  successfulCardLookupCache.clear();
  failedCardLookupCache.clear();
  inflightCardLookupBatches.clear();
}

export function cardDataCacheStatsForTests() {
  return {
    successes: successfulCardLookupCache.size,
    failures: failedCardLookupCache.size,
    inflight: inflightCardLookupBatches.size
  };
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function createCardDataBudget(cardCount: number, maxRequests?: number): CardDataRequestBudget {
  const batchCount = Math.max(1, Math.ceil(Math.max(0, cardCount) / CARD_DATA_BATCH_SIZE));
  return {
    startedAt: Date.now(),
    deadlineAt: Date.now() + MAX_OPERATION_MS,
    requestCount: 0,
    maxRequests: maxRequests ?? batchCount * MAX_BATCH_ATTEMPTS + MAX_ANOMALOUS_FALLBACKS
  };
}

function operationFailure(kind: CardDataOperationFailure["kind"], message: string): CardDataOperationFailure {
  return { kind, message, retryable: true };
}

class CardDataOperationError extends Error {
  failure: CardDataOperationFailure;

  constructor(failure: CardDataOperationFailure) {
    super(failure.message);
    this.name = "CardDataOperationError";
    this.failure = failure;
    Object.setPrototypeOf(this, CardDataOperationError.prototype);
  }
}

function operationFailureFromStatus(status: number): CardDataOperationFailure {
  if (status === 429) {
    return operationFailure("rate-limit", "Opening Edge is being rate limited by the card database. Please retry in a moment.");
  }
  if (status === 408) {
    return operationFailure("timeout", "Opening Edge could not finish card lookup before the request timed out. Please retry.");
  }
  if (status >= 500) {
    return operationFailure("server", "The card database is temporarily unavailable. Please retry in a moment.");
  }
  return operationFailure("network", `Opening Edge could not finish card lookup. Please retry. (${status})`);
}

function isRetryableCardDataStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function checkCardDataBudget(signal: AbortSignal | undefined, budget: CardDataRequestBudget | undefined) {
  if (signal?.aborted) {
    throw new DOMException("The operation was aborted.", "AbortError");
  }
  if (!budget) {
    return;
  }
  if (Date.now() >= budget.deadlineAt) {
    throw new CardDataOperationError(
      operationFailure("timeout", "Opening Edge could not finish card lookup before the time limit. Please retry.")
    );
  }
  if (budget.requestCount >= budget.maxRequests) {
    throw new CardDataOperationError(
      operationFailure("request-budget", "Opening Edge stopped card lookup after too many requests. Please retry.")
    );
  }
}

async function abortableSleep(ms: number, signal?: AbortSignal, budget?: CardDataRequestBudget) {
  checkCardDataBudget(signal, budget);
  await new Promise<void>((resolve, reject) => {
    const timeout = globalThis.setTimeout(resolve, ms);
    const onAbort = () => {
      globalThis.clearTimeout(timeout);
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }).finally(() => {
    checkCardDataBudget(signal, budget);
  });
}

async function fetchWithRetries(
  url: string,
  init?: RequestInit,
  options: {
    attempts?: number;
    budget?: CardDataRequestBudget;
    retryableStatuses?: (status: number) => boolean;
    signal?: AbortSignal;
  } = {}
) {
  const attempts = options.attempts ?? MAX_BATCH_ATTEMPTS;
  const signal = options.signal ?? init?.signal ?? undefined;
  const retryableStatuses = options.retryableStatuses ?? isRetryableCardDataStatus;
  let response: Response | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      checkCardDataBudget(signal, options.budget);
      if (options.budget) {
        options.budget.requestCount += 1;
      }
      response = await fetch(url, init);
    } catch (error) {
      if (isAbortError(error) || error instanceof CardDataOperationError) {
        throw error;
      }
      response = null;
      if (attempt === attempts - 1) {
        throw new CardDataOperationError(
          operationFailure("network", "Opening Edge could not reach the card database. Check your connection and retry.")
        );
      }
      await abortableSleep(attempt === 0 ? 300 : 900, signal, options.budget);
      continue;
    }
    if (response.ok || response.status === 404 || !retryableStatuses(response.status)) {
      return response;
    }
    if (attempt === attempts - 1) {
      return response;
    }
    const retryAfter = Number(response.headers.get("retry-after") ?? 0);
    await abortableSleep(retryAfter ? Math.min(retryAfter * 1000, 900) : attempt === 0 ? 300 : 900, signal, options.budget);
  }
  return response;
}

async function fetchSingleCard(name: string, signal?: AbortSignal, budget?: CardDataRequestBudget) {
  let response: Response | null = null;
  try {
    response = await fetchWithRetries(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`,
      { signal },
      { attempts: MAX_BATCH_ATTEMPTS, budget, signal }
    );
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }
    return {
      card: null,
      failure: `${name}: ${error instanceof CardDataOperationError ? error.failure.message : "Network error"}`,
      status: undefined
    };
  }
  if (!response?.ok) {
    return { card: null, failure: `${name}: ${response ? scryfallErrorMessage(response.status) : "Network error"}`, status: response?.status };
  }
  return { card: (await response.json()) as ScryfallCard, failure: "", status: response.status };
}

async function fetchMtgoCard(mtgoId: number, signal?: AbortSignal) {
  const response = await fetchWithRetries(`https://api.scryfall.com/cards/mtgo/${mtgoId}`, { signal }, { signal }).catch((error) => {
    if (isAbortError(error)) {
      throw error;
    }
    return null;
  });
  if (!response?.ok) {
    return { card: null, failure: `Exact .dek art lookup: ${response ? scryfallErrorMessage(response.status) : "Network error"}` };
  }
  return { card: (await response.json()) as ScryfallCard, failure: "" };
}

async function fetchPrintImages(name: string, signal?: AbortSignal) {
  const response = await fetchWithRetries(
    `https://api.scryfall.com/cards/search?unique=prints&order=released&q=${encodeURIComponent(`!"${name}"`)}`,
    { signal },
    { signal }
  ).catch((error) => {
    if (isAbortError(error)) {
      throw error;
    }
    return null;
  });
  if (!response?.ok) {
    return { imageUrls: [], artCropUrls: [] };
  }
  const payload = (await response.json()) as { data?: ScryfallCard[] };
  const cards = payload.data ?? [];
  return {
    imageUrls: Array.from(
      new Set(
        cards
          .flatMap((card) => [card.image_uris?.normal, ...(card.card_faces ?? []).map((face) => face.image_uris?.normal)])
          .filter((url): url is string => Boolean(url))
      )
    ).slice(0, 48),
    artCropUrls: Array.from(
      new Set(
        cards
          .flatMap((card) => [card.image_uris?.art_crop, ...(card.card_faces ?? []).map((face) => face.image_uris?.art_crop)])
          .filter((url): url is string => Boolean(url))
      )
    ).slice(0, 48)
  };
}

function reportCardDataProgress(options: Pick<FetchCardDataOptions, "onProgress">, completed: number, total: number) {
  if (!options.onProgress) {
    return;
  }
  const safeTotal = Math.max(0, total);
  const safeCompleted = Math.max(0, Math.min(completed, safeTotal));
  options.onProgress({
    completed: safeCompleted,
    total: safeTotal,
    percent: safeTotal ? Math.round((safeCompleted / safeTotal) * 100) : 100
  });
}

async function fetchUncachedBaseCardData(
  cardNames: string[],
  options: Pick<FetchCardDataOptions, "onProgress" | "signal"> = {}
): Promise<CardDataLookupResult> {
  const uniqueNames = Array.from(new Set(cardNames.map((name) => name.trim()).filter(Boolean)));
  const lookups = new Map<string, CardLookup>();
  const failures: string[] = [];
  const unresolvedCards: string[] = [];
  const budget = createCardDataBudget(uniqueNames.length);
  let completed = 0;
  reportCardDataProgress(options, completed, uniqueNames.length);

  for (let index = 0; index < uniqueNames.length; index += CARD_DATA_BATCH_SIZE) {
    const batch = uniqueNames.slice(index, index + CARD_DATA_BATCH_SIZE);
    let response: Response | null = null;

    try {
      response = await fetchWithRetries("https://api.scryfall.com/cards/collection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) }),
        signal: options.signal
      }, {
        attempts: MAX_BATCH_ATTEMPTS,
        budget,
        signal: options.signal,
        retryableStatuses: isRetryableCardDataStatus
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      const failure =
        error instanceof CardDataOperationError
          ? error.failure
          : operationFailure("network", "Opening Edge could not reach the card database. Check your connection and retry.");
      return { lookups, failures, unresolvedCards: uniqueNames.slice(completed), operationFailure: failure };
    }

    if (!response?.ok) {
      const failure = response
        ? operationFailureFromStatus(response.status)
        : operationFailure("network", "Opening Edge could not reach the card database. Check your connection and retry.");
      return { lookups, failures, unresolvedCards: uniqueNames.slice(completed), operationFailure: failure };
    }

    const payload = (await response.json()) as {
      data?: ScryfallCard[];
      not_found?: Array<{ name?: string }>;
    };
    const resolvedNames = new Set<string>();
    const authoritativeMissingNames = new Set<string>();

    for (const card of payload.data ?? []) {
      const mapped = mapScryfallCard(card);
      const aliasKeys = lookupAliasKeys(mapped);
      const requestedAliases = batch.filter((name) => aliasKeys.has(normalizeName(name)));
      requestedAliases.forEach((name) => resolvedNames.add(normalizeName(name)));
      addLookupAliases(lookups, mapped, requestedAliases[0]);
      cacheLookupSuccess(mapped, requestedAliases);
    }

    for (const missing of payload.not_found ?? []) {
      if (missing.name) {
        const missingName = missing.name;
        const requestedName = batch.find((name) => normalizeName(name) === normalizeName(missingName)) ?? missingName;
        authoritativeMissingNames.add(normalizeName(requestedName));
        const failure = `${requestedName}: Card name not found`;
        failures.push(failure);
        cacheLookupFailure(requestedName, failure, 404);
      }
    }

    const anomalousMissing = batch.filter((name) => !resolvedNames.has(normalizeName(name)) && !authoritativeMissingNames.has(normalizeName(name)));
    for (const name of anomalousMissing.slice(0, MAX_ANOMALOUS_FALLBACKS)) {
      try {
        const fallback = await fetchSingleCard(name, options.signal, budget);
        if (fallback.card) {
          const mapped = mapScryfallCard(fallback.card);
          addLookupAliases(lookups, mapped, name);
          cacheLookupSuccess(mapped, [name]);
        } else {
          const failure = fallback.failure || `${name}: Card lookup did not return a card`;
          failures.push(failure);
          cacheLookupFailure(name, failure, fallback.status);
        }
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }
        const failure = error instanceof CardDataOperationError ? error.failure.message : `${name}: Card lookup failed`;
        failures.push(`${name}: ${failure}`);
        cacheLookupFailure(name, `${name}: ${failure}`);
      }
    }
    for (const name of anomalousMissing.slice(MAX_ANOMALOUS_FALLBACKS)) {
      const failure = `${name}: Card lookup did not return a result`;
      failures.push(failure);
      unresolvedCards.push(name);
      cacheLookupFailure(name, failure);
    }

    completed += batch.length;
    reportCardDataProgress(options, completed, uniqueNames.length);
  }

  return { lookups, failures, unresolvedCards };
}

async function fetchBaseCardDataWithInflightDedupe(cardNames: string[], options: FetchCardDataOptions) {
  if (options.signal) {
    return fetchUncachedBaseCardData(cardNames, { onProgress: options.onProgress, signal: options.signal });
  }
  const key = cardNames.map(normalizeName).sort().join("|");
  const existing = inflightCardLookupBatches.get(key);
  if (existing) {
    return existing;
  }
  const request = fetchUncachedBaseCardData(cardNames).finally(() => {
    inflightCardLookupBatches.delete(key);
  });
  inflightCardLookupBatches.set(key, request);
  return request;
}

export async function fetchCardData(cardNames: string[], options: FetchCardDataOptions = {}): Promise<CardDataLookupResult> {
  const uniqueNames = Array.from(new Set(cardNames.map((name) => name.trim()).filter(Boolean)));
  const lookups = new Map<string, CardLookup>();
  const failures: string[] = [];
  const uncachedNames: string[] = [];
  let completed = 0;
  reportCardDataProgress(options, completed, uniqueNames.length);

  for (const name of uniqueNames) {
    const cached = getCachedLookup(name);
    if (cached) {
      addLookupAliases(lookups, cached, name);
      completed += 1;
      reportCardDataProgress(options, completed, uniqueNames.length);
      continue;
    }
    const cachedFailure = options.retryFailures ? null : getCachedFailure(name);
    if (cachedFailure) {
      failures.push(cachedFailure);
      completed += 1;
      reportCardDataProgress(options, completed, uniqueNames.length);
      continue;
    }
    uncachedNames.push(name);
  }

  if (uncachedNames.length) {
    const fetched = await fetchBaseCardDataWithInflightDedupe(uncachedNames, {
      ...options,
      onProgress: (progress) => {
        reportCardDataProgress(options, completed + progress.completed, uniqueNames.length);
      }
    });
    for (const [key, lookup] of Array.from(fetched.lookups)) {
      lookups.set(key, lookup);
    }
    failures.push(...fetched.failures);
    if (fetched.operationFailure) {
      return {
        lookups,
        failures,
        unresolvedCards: fetched.unresolvedCards ?? uncachedNames,
        operationFailure: fetched.operationFailure
      };
    }
    completed += uncachedNames.length;
    reportCardDataProgress(options, completed, uniqueNames.length);
  }

  const mtgoEntries = Object.entries(options.mtgoIdsByName ?? {})
    .map(([name, ids]) => ({
      name,
      ids: Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)))
    }))
    .filter((entry) => entry.ids.length);

  for (const entry of mtgoEntries) {
    for (const mtgoId of entry.ids) {
      const exact = await fetchMtgoCard(mtgoId, options.signal);
      if (!exact.card) {
        failures.push(exact.failure || "Exact .dek art lookup: Card not found");
        continue;
      }

      const mapped = mapScryfallCard(exact.card);
      const deckKey = normalizeName(entry.name);
      const current = lookups.get(deckKey) ?? lookups.get(normalizeName(mapped.name));
      const merged = current
        ? options.exactMtgoImagesOnly
          ? replaceLookupImagesWithExact(current, mapped)
          : mergeLookupImages(current, mapped)
        : mapped;
      lookups.set(deckKey, merged);
      lookups.set(normalizeName(mapped.name), merged);
      for (const face of merged.faces) {
        if (face.name) {
          lookups.set(normalizeName(face.name), merged);
        }
      }
      cacheLookupSuccess(merged, [entry.name]);
    }
  }

  if (options.includePrintImages) {
    const canonicalCards = Array.from(new Map(Array.from(lookups.values()).map((card) => [card.name, card])).values());
    await Promise.all(
      canonicalCards.map(async (card) => {
        const printImages = await fetchPrintImages(card.name, options.signal).catch((error) => {
          if (isAbortError(error)) {
            throw error;
          }
          return { imageUrls: [], artCropUrls: [] };
        });
        card.imageUrls = Array.from(new Set([...card.imageUrls, ...printImages.imageUrls]));
        card.artCropUrls = Array.from(new Set([...card.artCropUrls, ...printImages.artCropUrls]));
        cacheLookupSuccess(card);
      })
    );
  }

  return { lookups, failures, unresolvedCards: [] };
}

function comb(n: number, k: number): number {
  if (k < 0 || k > n) {
    return 0;
  }
  const adjustedK = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= adjustedK; i += 1) {
    result = (result * (n - adjustedK + i)) / i;
  }
  return result;
}

function hypergeometric(population: number, successes: number, draws: number, hits: number) {
  const failures = population - successes;
  if (successes > population || draws > population || hits > successes || draws - hits > failures) {
    return 0;
  }
  return (comb(successes, hits) * comb(failures, draws - hits)) / comb(population, draws);
}

function probabilityAtLeast(population: number, successes: number, draws: number, minimumHits: number) {
  if (minimumHits <= 0) {
    return 1;
  }
  const cappedDraws = Math.max(0, Math.min(draws, population));
  let total = 0;
  for (let hits = minimumHits; hits <= Math.min(successes, cappedDraws); hits += 1) {
    total += hypergeometric(population, successes, cappedDraws, hits);
  }
  return Math.max(0, Math.min(1, total));
}

function probabilityWithFractionalLooks(
  population: number,
  successes: number,
  naturalDraws: number,
  extraLooks: number,
  minimumHits: number
) {
  const lower = Math.floor(extraLooks);
  const fraction = extraLooks - lower;
  const low = probabilityAtLeast(population, successes, naturalDraws + lower, minimumHits);
  const high = probabilityAtLeast(population, successes, naturalDraws + lower + 1, minimumHits);
  return low * (1 - fraction) + high * fraction;
}

function probabilityWithFractionalLooksAndRemovedSuccesses(
  population: number,
  successes: number,
  naturalDraws: number,
  extraLooks: number,
  minimumHits: number,
  removedSuccesses: number
) {
  const lowerRemoved = Math.floor(Math.max(0, removedSuccesses));
  const removedFraction = Math.max(0, removedSuccesses) - lowerRemoved;
  const calculate = (removed: number) =>
    probabilityWithFractionalLooks(
      Math.max(0, population - removed),
      Math.max(0, successes - removed),
      naturalDraws,
      extraLooks,
      minimumHits
    );
  const low = calculate(lowerRemoved);
  const high = calculate(lowerRemoved + 1);
  return low * (1 - removedFraction) + high * removedFraction;
}

function drawsByTurn(turn: number, playDraw: PlayDraw) {
  return playDraw === "play" ? Math.max(0, turn - 1) : turn;
}

function numberWord(raw: string) {
  const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
  return /^\d+$/.test(raw) ? Number(raw) : words[raw.toLowerCase()] ?? 0;
}

function drawDepth(card: CardLookup) {
  const text = allText(card);
  if (text.includes("each player draws") || text.includes("target player draws")) {
    return { drawn: 0, seen: 0 };
  }
  const drawMatches = Array.from(text.matchAll(/\bdraw\s+(a|an|one|two|three|four|five|\d+)\s+cards?\b/g));
  const selectionMatches = [
    ...Array.from(text.matchAll(/\bscry\s+(\d+|one|two|three|four|five)\b/g)),
    ...Array.from(text.matchAll(/\bsurveil\s+(\d+|one|two|three|four|five)\b/g)),
    ...Array.from(text.matchAll(/\blook at the top\s+(\d+|one|two|three|four|five)\s+cards?\b/g))
  ];
  const drawn = Math.max(0, ...drawMatches.map((match) => numberWord(match[1] ?? "0")));
  const selected = Math.max(0, ...selectionMatches.map((match) => numberWord(match[1] ?? "0")));
  return { drawn, seen: drawn + selected };
}

function rampSource(card: CardLookup): SourceNote | null {
  if (card.isLand) {
    return null;
  }
  const text = allText(card);
  const typeText = allTypeText(card);
  if (text.includes("treasure token")) {
    return { cardName: card.name, sourceType: "Treasure", timing: "temporary mana", text: card.oracleText };
  }
  if (text.includes("search your library") && text.includes("land") && text.includes("battlefield")) {
    return { cardName: card.name, sourceType: "Land ramp", timing: "extra land source", text: card.oracleText };
  }
  if (text.includes("add one mana") || text.includes("add mana") || text.includes("add {")) {
    const permanent = ["Creature", "Artifact", "Enchantment"].some((kind) => typeText.includes(kind));
    return {
      cardName: card.name,
      sourceType: permanent ? "Mana permanent" : "Mana burst",
      timing: permanent ? "repeatable mana" : "temporary mana",
      text: card.oracleText
    };
  }
  if (text.includes("costs {1} less") || text.includes("costs one less")) {
    return { cardName: card.name, sourceType: "Cost reduction", timing: "virtual mana", text: card.oracleText };
  }
  return null;
}

function landEquivalent(card: CardLookup): SourceNote | null {
  if (card.isLand) {
    return null;
  }
  const landFace = card.faces.find((face) => face.typeLine.includes("Land"));
  if (landFace) {
    return {
      cardName: card.name,
      sourceType: "MDFC land face",
      timing: "uses land drop",
      text: `Can be played as ${landFace.name || "a land face"}.`
    };
  }
  const ramp = rampSource(card);
  if (!ramp) {
    return null;
  }
  if ((ramp.sourceType === "Mana permanent" || ramp.sourceType === "Treasure") && card.manaValue <= 1) {
    return { ...ramp, sourceType: ramp.sourceType === "Treasure" ? "Temporary source" : "Castable mana source" };
  }
  return null;
}

type ManaSource = {
  name: string;
  colors: string[];
  availableTurn: number;
  entersTapped: boolean;
};

function basicLandColors(name: string) {
  const basics: Record<string, string[]> = {
    plains: ["W"],
    island: ["U"],
    swamp: ["B"],
    mountain: ["R"],
    forest: ["G"],
    wastes: ["C"]
  };
  return basics[normalizeName(name)] ?? [];
}

function colorsFromAddText(text: string) {
  const colors = new Set<string>();
  if (text.includes("any color")) {
    ["W", "U", "B", "R", "G"].forEach((color) => colors.add(color));
  }
  for (const match of Array.from(text.matchAll(/\{([WUBRGC])\}/gi))) {
    colors.add((match[1] ?? "").toUpperCase());
  }
  for (const word of Array.from(text.matchAll(/\b(white|blue|black|red|green|colorless)\b/gi))) {
    const map: Record<string, string> = { white: "W", blue: "U", black: "B", red: "R", green: "G", colorless: "C" };
    colors.add(map[(word[1] ?? "").toLowerCase()] ?? "");
  }
  return Array.from(colors).filter(Boolean);
}

function sourceProfile(card: CardLookup): Omit<ManaSource, "availableTurn"> {
  const text = allText(card);
  const produced = card.producedMana.length
    ? card.producedMana.map((color) => color.toUpperCase())
    : [...basicLandColors(card.name), ...colorsFromAddText(text)];
  const uniqueColors = Array.from(new Set(produced.length ? produced : ["C"]));
  const conditionalTapped = text.includes("enters tapped unless") || text.includes("enters the battlefield tapped unless");
  const entersTapped =
    (text.includes("enters tapped") || text.includes("enters the battlefield tapped")) && !conditionalTapped;
  return { name: card.name, colors: uniqueColors, entersTapped };
}

function costReductionAmount(text: string) {
  const symbolMatch = text.match(/costs?\s+\{(\d+)\}\s+less/);
  if (symbolMatch) {
    return Number(symbolMatch[1] ?? 0);
  }
  const wordMatch = text.match(/costs?\s+(one|two|three|four|five|a|an|\d+)\s+less/);
  if (!wordMatch) {
    return 0;
  }
  const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
  const raw = (wordMatch[1] ?? "").toLowerCase();
  return /^\d+$/.test(raw) ? Number(raw) : words[raw] ?? 0;
}

function selfCostReduction(card: CardLookup) {
  const text = allText(card);
  if (!/\bthis spell costs?\b/.test(text)) {
    return 0;
  }
  return costReductionAmount(text);
}

function canPay(cost: string, sources: ManaSource[], genericReduction = 0) {
  return solveManaPayment(
    cost,
    manaValueFromCost(cost),
    sources.map((source) => ({
      name: source.name,
      colors: source.colors.filter((color): color is ManaColor =>
        (["W", "U", "B", "R", "G", "C"] as string[]).includes(color)
      )
    })),
    { genericReduction }
  ).canPay;
}

function castabilityCost(card: CardLookup) {
  if (card.manaCost) {
    return card.manaCost;
  }
  if (card.manaValue <= 0) {
    return "";
  }
  const requiredColors = Array.from(new Set(card.colors.map((color) => color.toUpperCase()).filter(Boolean)));
  if (!requiredColors.length) {
    return `{${Math.ceil(card.manaValue)}}`;
  }
  const coloredSymbols = requiredColors.slice(0, Math.ceil(card.manaValue)).map((color) => `{${color}}`).join("");
  const generic = Math.max(0, Math.ceil(card.manaValue) - requiredColors.length);
  return `${generic ? `{${generic}}` : ""}${coloredSymbols}`;
}

function chooseBestLand(availableLands: Array<{ id: number; card: CardLookup }>, currentSources: ManaSource[], turn: number) {
  let best = availableLands[0] ?? null;
  let bestScore = -1;
  for (const candidate of availableLands) {
    const profile = sourceProfile(candidate.card);
    const source: ManaSource = {
      ...profile,
      availableTurn: profile.entersTapped ? turn + 1 : turn
    };
    const colors = new Set(
      [...currentSources, source]
        .filter((item) => item.availableTurn <= turn + 1)
        .flatMap((item) => item.colors)
    );
    const untappedNow = source.availableTurn <= turn ? 2 : 0;
    const score = colors.size * 10 + untappedNow + source.colors.length;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function rampManaSource(card: CardLookup, turn: number): ManaSource | null {
  const ramp = rampSource(card);
  if (!ramp) {
    return null;
  }
  if (ramp.sourceType === "Cost reduction") {
    return null;
  }
  const text = allText(card);
  const colors = text.includes("treasure token")
    ? ["W", "U", "B", "R", "G"]
    : Array.from(new Set([...card.producedMana.map((color) => color.toUpperCase()), ...colorsFromAddText(text)]));
  if (!colors.length) {
    return null;
  }
  return {
    name: card.name,
    colors,
    availableTurn: ramp.sourceType === "Mana permanent" ? turn + 1 : turn,
    entersTapped: false
  };
}

function seededRandom(seedStart: number) {
  let seed = seedStart;
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

function shuffledSample(cards: string[], count: number, random: () => number) {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled.slice(0, count);
}

function castabilityMonteCarlo(
  hand: string[],
  library: Map<string, number>,
  cardData: Map<string, CardLookup>,
  playDraw: PlayDraw,
  trials = 3000
) {
  const spells = Array.from(
    new Map(
      hand
        .map((name) => cardData.get(normalizeName(name)))
        .filter((card): card is CardLookup => Boolean(card && !card.isLand))
        .map((card) => [card.name, card])
    ).values()
  );
  const deckCards = Array.from(library.entries()).flatMap(([name, qty]) =>
    Array.from({ length: Math.max(0, qty) }, () => name)
  );
  const successes = new Map(spells.map((spell) => [spell.name, [0, 0, 0]]));
  const random = seededRandom(20260717);
  const maxTurn = 3;
  const drawsToSee = drawsByTurn(maxTurn, playDraw) + 6;

  for (let trial = 0; trial < trials; trial += 1) {
    const drawnNames = [...hand, ...shuffledSample(deckCards, drawsToSee, random)];
    const drawn = drawnNames
      .map((name, id) => ({ id, name, card: cardData.get(normalizeName(name)) }))
      .filter((entry): entry is { id: number; name: string; card: CardLookup } => Boolean(entry.card));
    const playedLandIds = new Set<number>();
    const usedValueSpellIds = new Set<number>();
    const sources: ManaSource[] = [];
    let extraSeen = 0;

    for (let turn = 1; turn <= maxTurn; turn += 1) {
      let seenCount = Math.min(drawn.length, hand.length + drawsByTurn(turn, playDraw) + extraSeen);
      const availableLands = drawn
        .slice(0, seenCount)
        .filter((entry) => entry.card.isLand && !playedLandIds.has(entry.id));
      const land = chooseBestLand(availableLands, sources, turn);
      if (land) {
        playedLandIds.add(land.id);
        const profile = sourceProfile(land.card);
        sources.push({
          ...profile,
          availableTurn: profile.entersTapped ? turn + 1 : turn
        });
      }

      let usableSources = sources.filter((source) => source.availableTurn <= turn);
      for (const entry of drawn.slice(0, seenCount)) {
        if (entry.card.isLand || usedValueSpellIds.has(entry.id)) {
          continue;
        }
        const cost = castabilityCost(entry.card);
        if (!canPay(cost, usableSources, selfCostReduction(entry.card))) {
          continue;
        }
        const depth = drawDepth(entry.card);
        const rampSourceProfile = rampManaSource(entry.card, turn);
        if (depth.drawn > 0 || depth.seen > 0 || rampSourceProfile) {
          usedValueSpellIds.add(entry.id);
        }
        if (depth.drawn > 0 || depth.seen > 0) {
          extraSeen += Math.max(depth.drawn, depth.seen);
          seenCount = Math.min(drawn.length, hand.length + drawsByTurn(turn, playDraw) + extraSeen);
        }
        if (rampSourceProfile && !sources.some((source) => source.name === rampSourceProfile.name)) {
          sources.push(rampSourceProfile);
          usableSources = sources.filter((source) => source.availableTurn <= turn);
        }
      }

      usableSources = sources.filter((source) => source.availableTurn <= turn);
      for (const spell of spells) {
        const cost = castabilityCost(spell);
        if (canPay(cost, usableSources, selfCostReduction(spell))) {
          successes.get(spell.name)![turn - 1] += 1;
        }
      }
    }
  }

  return spells.map((spell) => {
    const row = successes.get(spell.name) ?? [0, 0, 0];
    return {
      cardName: spell.name,
      manaValue: spell.manaValue,
      turn1: Math.min(1, row[0] / trials),
      turn2: Math.min(1, row[1] / trials),
      turn3: Math.min(1, row[2] / trials)
    };
  });
}

function textureScore(landsInHand: number, effectiveLandsInHand: number, averageManaValue: number, earlySpellCount: number) {
  const landScore = Math.max(0, 44 - Math.abs(effectiveLandsInHand - 3) * 15);
  const curveScore = Math.max(0, 32 - Math.max(0, averageManaValue - 2.8) * 14);
  const earlyScore = Math.min(24, earlySpellCount * 8);
  const floodPenalty = landsInHand >= 5 ? 10 : 0;
  return Math.max(0, Math.min(100, Math.round(landScore + curveScore + earlyScore - floodPenalty)));
}

function deckCurveTop(spellManaValues: number[]) {
  if (!spellManaValues.length) {
    return 0;
  }
  const sorted = [...spellManaValues].sort((a, b) => a - b);
  return Math.ceil(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.85))] ?? 0);
}

function deckProfile(
  mainCounts: Map<string, number>,
  cardData: Map<string, CardLookup>,
  landsInHand: number,
  effectiveLandsInHand: number
): DeckProfile {
  const spellManaValues: number[] = [];
  let landCount = 0;
  let spellCount = 0;
  let cheapSpellCount = 0;
  let expensiveSpellCount = 0;
  let topEndCount = 0;
  let drawSpellCount = 0;
  let rampSpellCount = 0;

  for (const [name, qty] of Array.from(mainCounts.entries())) {
    const card = cardData.get(normalizeName(name));
    if (!card) {
      continue;
    }
    if (card.isLand) {
      landCount += qty;
      continue;
    }

    spellCount += qty;
    for (let copy = 0; copy < qty; copy += 1) {
      spellManaValues.push(card.manaValue);
    }
    if (card.manaValue <= 2) {
      cheapSpellCount += qty;
    }
    if (card.manaValue >= 4) {
      expensiveSpellCount += qty;
    }
    if (card.manaValue >= 5) {
      topEndCount += qty;
    }
    const depth = drawDepth(card);
    if (depth.drawn > 0 || depth.seen > 0) {
      drawSpellCount += qty;
    }
    if (rampSource(card)) {
      rampSpellCount += qty;
    }
  }

  const averageManaValue = spellManaValues.length
    ? spellManaValues.reduce((total, value) => total + value, 0) / spellManaValues.length
    : 0;
  const curveTop = deckCurveTop(spellManaValues);
  const expensiveShare = spellCount ? expensiveSpellCount / spellCount : 0;
  const topEndShare = spellCount ? topEndCount / spellCount : 0;
  const cheapShare = spellCount ? cheapSpellCount / spellCount : 0;

  let label = "Midrange curve";
  let suggestedKeepLandRange = "2-4 lands";
  let scoreAdjustment = 0;
  const notes: string[] = [];

  if (averageManaValue <= 2.25 && curveTop <= 3 && expensiveShare < 0.18) {
    label = "Low-curve pressure";
    suggestedKeepLandRange = "2-3 lands";
    if (landsInHand >= 5) {
      scoreAdjustment -= landsInHand >= 6 ? 24 : 20;
      notes.push("This deck is low to the ground, so a 5+ land opener is heavy flood pressure.");
    } else if (landsInHand === 4) {
      scoreAdjustment -= 10;
      notes.push("Four lands is already above this curve's preferred opener; this deck usually wants action over extra mana.");
    } else if (landsInHand >= 2 && landsInHand <= 3) {
      scoreAdjustment += 3;
      notes.push("The land count matches this deck's low curve.");
    }
  } else if (rampSpellCount >= 6 || topEndShare >= 0.22 || curveTop >= 5) {
    label = "Ramp or big-mana curve";
    suggestedKeepLandRange = "3-4 lands, or 2 with ramp";
    if (effectiveLandsInHand < 3) {
      scoreAdjustment -= 10;
      notes.push("This deck has meaningful top-end, so missing early mana development is more punishing.");
    } else if (effectiveLandsInHand <= 4) {
      scoreAdjustment += 4;
      notes.push("The hand has enough mana to support the deck's higher curve.");
    } else if (landsInHand >= 6) {
      scoreAdjustment -= 8;
      notes.push("Even a big-mana deck can flood on six lands without card velocity.");
    }
  } else if (drawSpellCount >= 8 && averageManaValue >= 2.55) {
    label = "Control/value curve";
    suggestedKeepLandRange = "3-4 lands";
    if (landsInHand < 3) {
      scoreAdjustment -= 7;
      notes.push("This deck has value/card draw, but it still wants stable land drops.");
    } else if (landsInHand <= 4) {
      scoreAdjustment += 3;
      notes.push("The hand's land count lines up with a value deck's early needs.");
    } else if (landsInHand >= 6) {
      scoreAdjustment -= 8;
      notes.push("Six lands is still too many unless the hand has strong card draw.");
    }
  } else {
    if (landsInHand < 2) {
      scoreAdjustment -= 10;
      notes.push("This curve usually wants at least two lands to function.");
    } else if (landsInHand >= 5) {
      scoreAdjustment -= 8;
      notes.push("Five lands is above this deck's normal opener range.");
    } else {
      scoreAdjustment += 2;
      notes.push("The land count is within the normal range for this deck's curve.");
    }
  }

  if (cheapShare >= 0.55 && landsInHand === 2) {
    scoreAdjustment += 2;
    notes.push("The deck has a high cheap-spell density, which makes two-land starts more functional.");
  }
  if (drawSpellCount >= 8 && landsInHand <= 2) {
    scoreAdjustment += 2;
    notes.push("Card selection in the deck slightly improves lean keeps.");
  }

  const handLandTone =
    scoreAdjustment <= -7 ? "bad" : scoreAdjustment >= 3 ? "good" : "neutral";
  const handLandContext =
    scoreAdjustment <= -7
      ? `${landsInHand} land(s) is awkward for a ${label.toLowerCase()} deck.`
      : scoreAdjustment >= 3
        ? `${landsInHand} land(s) fits a ${label.toLowerCase()} deck well.`
        : `${landsInHand} land(s) is defensible for a ${label.toLowerCase()} deck, but context matters.`;

  return {
    label,
    landCount,
    spellCount,
    averageManaValue,
    curveTop,
    cheapSpellCount,
    expensiveSpellCount,
    drawSpellCount,
    rampSpellCount,
    suggestedKeepLandRange,
    handLandContext,
    handLandTone,
    scoreAdjustment,
    notes
  };
}

function textureLabel(score: number) {
  if (score >= 78) {
    return "Smooth";
  }
  if (score >= 58) {
    return "Playable";
  }
  if (score >= 40) {
    return "Risky";
  }
  return "Mulligan pressure";
}

function recommendation(score: number, lands: number, landTurn3: number) {
  if (lands === 0 || lands >= 6 || score < 42) {
    return { label: "Mulligan Pressure", tone: "bad" as const };
  }
  if (score >= 72 && (lands >= 3 || landTurn3 >= 0.58)) {
    return { label: "Keep Lean", tone: "good" as const };
  }
  return { label: "Context-Dependent", tone: "neutral" as const };
}

function recommendationFromModel(modelRecommendation: ReturnType<typeof scoreHandDeckRelative>["keepRecommendation"]) {
  if (modelRecommendation === "strong_keep" || modelRecommendation === "keep") {
    return { label: "Keep Lean", tone: "good" as const };
  }
  if (modelRecommendation === "mulligan" || modelRecommendation === "strong_mulligan") {
    return { label: "Mulligan Pressure", tone: "bad" as const };
  }
  return { label: "Context-Dependent", tone: "neutral" as const };
}

function riskAdjustedTextureScore(
  rawScore: number,
  profile: DeckProfile,
  castabilityAdjustment: ReturnType<typeof castabilityScoreAdjustment>,
  manaAdjustment: ScoreAdjustment
) {
  const curvePenalty = Math.min(0, profile.scoreAdjustment);
  const smallCurveBonus = Math.min(3, Math.max(0, profile.scoreAdjustment));
  const adjusted = rawScore + curvePenalty + smallCurveBonus + castabilityAdjustment.adjustment + manaAdjustment.adjustment;
  return Math.min(clampScore(adjusted), manaAdjustment.cap);
}

function recommendationFromRiskContext(
  modelRecommendation: KeepRecommendation,
  score: number,
  mulligan: MulliganSummary | null,
  profile: DeckProfile,
  castabilityAdjustment: ReturnType<typeof castabilityScoreAdjustment>,
  manaAdjustment: ScoreAdjustment
) {
  if (manaAdjustment.cap <= 52 || castabilityAdjustment.adjustment <= -28) {
    return { label: "Mulligan Pressure", tone: "bad" as const };
  }

  if (mulligan) {
    const scoreVsMulligan = score - mulligan.average;
    if (scoreVsMulligan <= -6 || mulligan.better >= 0.62) {
      return { label: "Mulligan Pressure", tone: "bad" as const };
    }
    if (scoreVsMulligan < 3 || mulligan.better >= 0.48) {
      return { label: "Context-Dependent", tone: "neutral" as const };
    }
  }

  if (profile.scoreAdjustment <= -12 && score < 76) {
    return { label: "Context-Dependent", tone: "neutral" as const };
  }

  return recommendationFromModel(modelRecommendation);
}

function recommendationPhrase(tone: "good" | "neutral" | "bad") {
  if (tone === "good") {
    return "a keep";
  }
  if (tone === "bad") {
    return "under mulligan pressure";
  }
  return "borderline";
}

function playDrawScoreAdjustment(mode: PlayDraw, lands: number, profile: DeckProfile) {
  if (mode === "play") {
    return profile.label === "Low-curve pressure" ? 1 : 0;
  }

  let adjustment = 0;
  if (lands <= 1) {
    adjustment += 5;
  } else if (lands === 2) {
    adjustment += 2;
  } else if (lands >= 5) {
    adjustment -= 2;
  }

  if (profile.label === "Low-curve pressure") {
    adjustment -= 2;
  }
  if (profile.label === "Control/value curve") {
    adjustment += 2;
  }
  return adjustment;
}

function buildPlayDrawComparison(
  score: number,
  landsInHand: number,
  librarySize: number,
  landsRemaining: number,
  profile: DeckProfile
): PlayDrawComparison {
  const scoreFor = (mode: PlayDraw) =>
    Math.max(0, Math.min(100, score + playDrawScoreAdjustment(mode, landsInHand, profile)));
  const turn3For = (mode: PlayDraw) =>
    probabilityAtLeast(librarySize, landsRemaining, drawsByTurn(3, mode), Math.max(0, 3 - landsInHand));
  const playScore = scoreFor("play");
  const drawScore = scoreFor("draw");
  const playRec = recommendation(playScore, landsInHand, turn3For("play"));
  const drawRec = recommendation(drawScore, landsInHand, turn3For("draw"));
  const playPhrase = recommendationPhrase(playRec.tone);
  const drawPhrase = recommendationPhrase(drawRec.tone);
  return {
    playScore,
    drawScore,
    playRecommendation: playRec.label,
    drawRecommendation: drawRec.label,
    playTone: playRec.tone,
    drawTone: drawRec.tone,
    summary:
      playRec.tone === drawRec.tone
        ? `This looks like ${playPhrase} on both play and draw.`
        : `This is ${playPhrase} on the play, ${drawPhrase} on the draw.`
  };
}

function buildModelPlayDrawComparison(
  playScore: ReturnType<typeof scoreHandDeckRelative>,
  drawScore: ReturnType<typeof scoreHandDeckRelative>
): PlayDrawComparison {
  const playRec = recommendationFromModel(playScore.keepRecommendation);
  const drawRec = recommendationFromModel(drawScore.keepRecommendation);
  const playPhrase = recommendationPhrase(playRec.tone);
  const drawPhrase = recommendationPhrase(drawRec.tone);
  return {
    playScore: playScore.score,
    drawScore: drawScore.score,
    playRecommendation: playRec.label,
    drawRecommendation: drawRec.label,
    playTone: playRec.tone,
    drawTone: drawRec.tone,
    summary:
      playRec.tone === drawRec.tone
        ? `This looks like ${playPhrase} on both play and draw.`
        : `This is ${playPhrase} on the play, ${drawPhrase} on the draw.`
  };
}

function mulliganDeckContext(profile: DeckProfile, freeSeven: boolean): MulliganSummary["deckContext"] {
  if (freeSeven) {
    return {
      label: "Commander/Brawl",
      adjustment: 0,
      note: "Commander and Brawl get a free first mulligan, so this comparison models a second seven-card hand."
    };
  }
  if (profile.label === "Low-curve pressure") {
    return {
      label: "Low-curve pressure",
      adjustment: -4,
      note: "Low-curve pressure decks tend to punish card disadvantage, so the simulated six is graded a little stricter."
    };
  }
  if (profile.label === "Control/value curve") {
    return {
      label: "Control/value",
      adjustment: 2,
      note: "Control and value decks can tolerate a functional six slightly better when mana and interaction are intact."
    };
  }
  if (profile.label === "Ramp or big-mana curve") {
    return {
      label: "Ramp/big mana",
      adjustment: -2,
      note: "Ramp and big-mana decks care heavily about early mana development, so shaky sixes are graded cautiously."
    };
  }
  return {
    label: "Midrange",
    adjustment: 0,
    note: "Midrange decks usually treat mulligans close to raw hand quality, with fewer archetype-specific adjustments."
  };
}

function scoreSeven(cards: string[], cardData: Map<string, CardLookup>) {
  const lands = cards.filter((name) => cardData.get(normalizeName(name))?.isLand).length;
  const nonlands = cards
    .map((name) => cardData.get(normalizeName(name)))
    .filter((card): card is CardLookup => Boolean(card && !card.isLand));
  const avgMv = nonlands.length ? nonlands.reduce((total, card) => total + card.manaValue, 0) / nonlands.length : 0;
  const early = nonlands.filter((card) => card.manaValue <= 2).length;
  return textureScore(lands, lands, avgMv, early);
}

function mulliganSummary(
  mainCounts: Map<string, number>,
  cardData: Map<string, CardLookup>,
  currentScore: number,
  extraAvailableCards: string[] = [],
  freeSeven = false,
  deckContext: MulliganSummary["deckContext"] = {
    label: "Generic",
    adjustment: 0,
    note: "Generic mulligan comparison."
  }
): MulliganSummary | null {
  const deckCards = Array.from(mainCounts.entries()).flatMap(([name, qty]) => Array.from({ length: qty }, () => name));
  if (deckCards.length < 7) {
    return null;
  }
  let seed = 20260717;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const scores: number[] = [];
  for (let sample = 0; sample < 600; sample += 1) {
    const shuffled = [...deckCards];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const seven = shuffled.slice(0, 7);
    if (freeSeven) {
      scores.push(Math.max(0, Math.min(100, scoreSeven([...seven, ...extraAvailableCards], cardData) + deckContext.adjustment)));
    } else {
      const sixScores = seven.map((_card, index) =>
        scoreSeven([...seven.filter((__, cardIndex) => cardIndex !== index), ...extraAvailableCards], cardData)
      );
      scores.push(Math.max(0, Math.min(100, Math.max(...sixScores) + deckContext.adjustment)));
    }
  }
  scores.sort((a, b) => a - b);
  const average = scores.reduce((total, score) => total + score, 0) / scores.length;
  return {
    average,
    median: scores[Math.floor(scores.length / 2)] ?? 0,
    better: scores.filter((score) => score > currentScore).length / scores.length,
    p25: scores[Math.floor(scores.length * 0.25)] ?? 0,
    p75: scores[Math.floor(scores.length * 0.75)] ?? 0,
    comparison: freeSeven ? "free-seven" : "london-six",
    deckContext
  };
}

function manaValueAuditRows(mainCounts: Map<string, number>, cardData: Map<string, CardLookup>): ManaAuditRow[] {
  return Array.from(mainCounts.entries()).map(([name, qty]) => {
    const card = cardData.get(normalizeName(name));
    if (!card) {
      return {
        status: "Missing",
        card: name,
        qty,
        appManaValue: 0,
        symbolCheck: null,
        checkSource: "missing card data",
        manaCostUsed: "(none)",
        typeLine: "",
        multiface: false
      };
    }

    const symbolCheck = card.manaCost ? manaValueFromCost(card.manaCost) : card.isLand ? 0 : null;
    const status =
      card.manaValueSource === "card data value only"
        ? "Card data only"
        : symbolCheck === null
          ? "Review"
          : Math.abs(symbolCheck - card.manaValue) < 0.01
            ? "OK"
            : "Review";

    return {
      status,
      card: name,
      qty,
      appManaValue: card.manaValue,
      symbolCheck,
      checkSource: card.manaValueSource,
      manaCostUsed: card.manaCost || "(none)",
      typeLine: card.typeLine,
      multiface: card.isMultiface
    };
  });
}

function sourceAssumptionRows(
  mainCounts: Map<string, number>,
  cardData: Map<string, CardLookup>,
  drawSources: SourceNote[],
  rampSources: SourceNote[],
  landEquivalentSources: SourceNote[]
): SourceAssumptionRow[] {
  const rows: SourceAssumptionRow[] = [];
  for (const [name] of Array.from(mainCounts.entries())) {
    const card = cardData.get(normalizeName(name));
    if (!card?.isLand) {
      continue;
    }
    const profile = sourceProfile(card);
    rows.push({
      cardName: name,
      kind: "Land",
      timing: profile.entersTapped ? "available next turn" : "available immediately",
      assumption: `Produces ${profile.colors.join("/") || "unknown"} mana${profile.entersTapped ? "; modeled as tapped" : ""}.`
    });
  }

  for (const source of drawSources) {
    rows.push({
      cardName: source.cardName,
      kind: "Draw/look",
      timing: source.timing,
      assumption: "Modeled as fractional extra looks when estimating future land drops."
    });
  }
  for (const source of rampSources) {
    rows.push({
      cardName: source.cardName,
      kind: "Ramp",
      timing: source.timing,
      assumption: `${source.sourceType} is included in the castability sequencing model when it can be cast from available sources.`
    });
  }
  for (const source of landEquivalentSources) {
    rows.push({
      cardName: source.cardName,
      kind: "Land equivalent",
      timing: source.timing,
      assumption: source.text
    });
  }
  return rows;
}

export function analyzeOpeningHand(
  decklist: string,
  handNames: string[],
  cardData: Map<string, CardLookup>,
  playDraw: PlayDraw,
  options: { format?: string; scoringSettings?: Partial<HandScoringSettings> } = {}
): AnalyzerResult {
  const parsed = parseDecklist(decklist);
  const mainCounts = countsFromCards(parsed.cards);
  const hand = handNames.map((name) => name.trim()).filter(Boolean);
  const commanderCards = commanderCardsFromSideboard(parsed.cards, options.format);
  const analysisHand = [...hand, ...commanderCards];
  const commanderCard = commanderCards[0] ?? "";
  const missingCards: string[] = [];
  const notes: string[] = [];

  const normalizedMain = new Map<string, string>();
  for (const name of Array.from(mainCounts.keys())) {
    normalizedMain.set(normalizeName(name), name);
  }

  const library = new Map(mainCounts);
  for (const rawName of hand) {
    const deckName = normalizedMain.get(normalizeName(rawName));
    if (!deckName) {
      missingCards.push(rawName);
      continue;
    }
    library.set(deckName, (library.get(deckName) ?? 0) - 1);
  }

  for (const [name, qty] of Array.from(library.entries())) {
    if (qty <= 0) {
      library.delete(name);
    }
  }

  const landNames = Array.from(mainCounts.keys()).filter((name) => cardData.get(normalizeName(name))?.isLand);
  const landSet = new Set(landNames.map(normalizeName));
  const landEquivalentSources = analysisHand
    .map((name) => cardData.get(normalizeName(name)))
    .filter((card): card is CardLookup => Boolean(card))
    .map(landEquivalent)
    .filter((source): source is SourceNote => Boolean(source));
  const effectiveLandSet = new Set([
    ...Array.from(landSet),
    ...landEquivalentSources.map((source) => normalizeName(source.cardName))
  ]);
  const landsInHand = analysisHand.filter((name) => landSet.has(normalizeName(name))).length;
  const effectiveLandsInHand = analysisHand.filter((name) => effectiveLandSet.has(normalizeName(name))).length;
  const librarySize = Array.from(library.values()).reduce((total, qty) => total + qty, 0);
  const landsRemaining = Array.from(library.entries()).reduce(
    (total, [name, qty]) => total + (landSet.has(normalizeName(name)) ? qty : 0),
    0
  );
  const effectiveLandsRemaining = Array.from(library.entries()).reduce(
    (total, [name, qty]) => total + (effectiveLandSet.has(normalizeName(name)) ? qty : 0),
    0
  );

  const handCards = analysisHand
    .map((name) => cardData.get(normalizeName(name)))
    .filter((card): card is CardLookup => Boolean(card));
  const nonlands = handCards.filter((card) => !card.isLand);
  const averageManaValue = nonlands.length
    ? nonlands.reduce((total, card) => total + card.manaValue, 0) / nonlands.length
    : 0;
  const earlySpellCount = nonlands.filter((card) => card.manaValue <= 2).length;
  const baseHandTextureScore = textureScore(landsInHand, effectiveLandsInHand, averageManaValue, earlySpellCount);
  const profile = deckProfile(mainCounts, cardData, landsInHand, effectiveLandsInHand);
  const castability = castabilityMonteCarlo(analysisHand, library, cardData, playDraw);
  const castabilityAdjustment = castabilityScoreAdjustment(castability);
  const drawSources = handCards
    .map((card) => ({ card, depth: drawDepth(card) }))
    .filter(({ depth }) => depth.drawn > 0 || depth.seen > 0)
    .map(({ card, depth }) => ({
      cardName: card.name,
      sourceType: depth.drawn > 0 ? `Draw ${depth.drawn}` : "Selection",
      timing: `sees ${depth.seen} card(s)`,
      text: card.oracleText
    }));
  const rampSources = handCards.map(rampSource).filter((source): source is SourceNote => Boolean(source));
  const manaAudit = manaValueAuditRows(mainCounts, cardData);
  const sourceAssumptions = sourceAssumptionRows(
    mainCounts,
    cardData,
    drawSources,
    rampSources,
    landEquivalentSources
  );

  const extraLooksByTurn = (turn: number) =>
    drawSources.reduce((total, source) => {
      const castRow = castability.find((row) => row.cardName === source.cardName);
      const castChance = turn <= 2 ? castRow?.turn1 ?? 0 : turn === 3 ? castRow?.turn2 ?? 0 : castRow?.turn3 ?? 0;
      const seen = Number(source.timing.match(/\d+/)?.[0] ?? 0);
      return total + seen * castChance;
    }, 0);

  const castChanceByTurn = (cardName: string, turn: number) => {
    const castRow = castability.find((row) => row.cardName === cardName);
    if (!castRow || turn <= 0) {
      return 0;
    }
    if (turn === 1) {
      return castRow.turn1;
    }
    if (turn === 2) {
      return castRow.turn2;
    }
    return castRow.turn3;
  };
  const libraryLandRampSources = rampSources.filter((source) => source.sourceType === "Land ramp");
  const rampLandsRemovedByTurn = (turn: number) =>
    libraryLandRampSources.reduce((total, source) => total + castChanceByTurn(source.cardName, turn - 1), 0);

  const turnProbabilities = Array.from({ length: 7 }, (_, index) => {
    const turn = index + 2;
    const naturalDraws = drawsByTurn(turn, playDraw);
    const extraLooks = extraLooksByTurn(turn);
    const rampLandsRemoved = rampLandsRemovedByTurn(turn);
    const neededForDrop = Math.max(0, turn - landsInHand);
    const neededForEffectiveDrop = Math.max(0, turn - effectiveLandsInHand);
    return {
      turn,
      naturalDraws,
      extraLooks,
      nextLandNatural: probabilityAtLeast(librarySize, landsRemaining, naturalDraws, 1),
      nextLandWithDraw: probabilityWithFractionalLooksAndRemovedSuccesses(
        librarySize,
        landsRemaining,
        naturalDraws,
        extraLooks,
        1,
        rampLandsRemoved
      ),
      landDropNatural: probabilityAtLeast(librarySize, landsRemaining, naturalDraws, neededForDrop),
      landDropWithDraw: probabilityWithFractionalLooksAndRemovedSuccesses(
        librarySize,
        landsRemaining,
        naturalDraws,
        extraLooks,
        neededForDrop,
        rampLandsRemoved
      ),
      effectiveLandDrop: probabilityAtLeast(librarySize, effectiveLandsRemaining, naturalDraws, neededForEffectiveDrop)
    };
  });

  const curve = buildManaCurveAnalysis(decklist, cardData, { format: options.format, scope: "main" }).curve;

  const turn2 = turnProbabilities.find((row) => row.turn === 2);
  const turn3 = turnProbabilities.find((row) => row.turn === 3)?.landDropWithDraw ?? 0;
  const turn4 = turnProbabilities.find((row) => row.turn === 4)?.landDropWithDraw ?? 0;
  const hasCastableRamp = rampSources.some((source) => {
    const castRow = castability.find((row) => row.cardName === source.cardName);
    return Boolean(castRow && Math.max(castRow.turn1, castRow.turn2) >= 0.55);
  });
  const manaAdjustment = manaSufficiencyAdjustment({
    landsInHand,
    effectiveLandsInHand,
    profileLabel: profile.label,
    curveTop: profile.curveTop,
    averageManaValue: profile.averageManaValue,
    turn2LandDrop: turn2?.landDropWithDraw ?? 0,
    turn3LandDrop: turn3,
    turn4LandDrop: turn4,
    hasCastableRamp
  });
  const hasCommanderFreeMulligan = isCommanderStyleFormat(options.format);
  const deckRelativeScore = scoreHandDeckRelative({
    mainCounts,
    handNames: analysisHand,
    cardData,
    playDraw,
    format: options.format,
    profileLabel: profile.label,
    freeMulligan: hasCommanderFreeMulligan,
    settings: options.scoringSettings
  });
  const handTextureScore = deckRelativeScore.score;
  const hasEarlyCastabilityConcern = castability.some((row) => row.manaValue <= 2 && row.turn2 < 0.55);
  const deckMulliganContext = mulliganDeckContext(profile, hasCommanderFreeMulligan);
  const mulligan = mulliganSummary(
    mainCounts,
    cardData,
    handTextureScore,
    commanderCards,
    hasCommanderFreeMulligan,
    deckMulliganContext
  );
  const rec = recommendationFromModel(deckRelativeScore.keepRecommendation);
  const playScore = playDraw === "play" ? deckRelativeScore : scoreHandDeckRelative({
    mainCounts,
    handNames: analysisHand,
    cardData,
    playDraw: "play",
    format: options.format,
    profileLabel: profile.label,
    freeMulligan: hasCommanderFreeMulligan,
    settings: options.scoringSettings
  });
  const drawScore = playDraw === "draw" ? deckRelativeScore : scoreHandDeckRelative({
    mainCounts,
    handNames: analysisHand,
    cardData,
    playDraw: "draw",
    format: options.format,
    profileLabel: profile.label,
    freeMulligan: hasCommanderFreeMulligan,
    settings: options.scoringSettings
  });
  const playDrawComparison = buildModelPlayDrawComparison(playScore, drawScore);
  const tags: AnalyzerResult["tags"] = [
    {
      label: profile.label.toLowerCase(),
      tone: "neutral"
    },
    {
      label: landsInHand >= 2 && landsInHand <= 4 ? "normal land count" : "land count concern",
      tone: landsInHand >= 2 && landsInHand <= 4 ? "good" : "bad"
    },
    {
      label: drawSources.length ? "has card selection" : "no card selection",
      tone: drawSources.length ? "good" : "neutral"
    },
    {
      label: rampSources.length ? "has ramp" : "no ramp",
      tone: rampSources.length ? "good" : "neutral"
    },
    {
      label: hasEarlyCastabilityConcern ? "castability concern" : "early spells castable",
      tone: hasEarlyCastabilityConcern ? "bad" : "good"
    },
    {
      label: profile.scoreAdjustment > 0 ? "curve likes this mana" : profile.scoreAdjustment < 0 ? "curve dislikes this mana" : "curve-neutral mana",
      tone: profile.handLandTone
    }
  ];
  const watchouts = [
    profile.handLandContext,
    ...profile.notes,
    landsInHand < 2 ? "Low land count: this hand needs help quickly." : "",
    landsInHand > 4 ? "High land count: this hand may flood without card velocity." : "",
    turn3 < 0.55 && landsInHand < 3 ? "Third land by turn 3 is not especially reliable." : "",
    castabilityAdjustment.note,
    manaAdjustment.note,
    ...deckRelativeScore.warnings,
    drawSources.length ? `Draw/look spells add about ${extraLooksByTurn(3).toFixed(1)} card(s) of expected depth by turn 3.` : "",
    landEquivalentSources.length ? `Land-equivalent source counted: ${landEquivalentSources.map((source) => source.cardName).join(", ")}.` : "",
    mulligan && mulligan.better >= 0.45
      ? mulligan.comparison === "free-seven"
        ? `Commander/Brawl free mulligan: a second seven scores better about ${Math.round(mulligan.better * 100)}% of the time.`
        : `A fresh seven then bottom one scores better about ${Math.round(mulligan.better * 100)}% of the time.`
      : ""
  ].filter(Boolean);

  if (!landNames.length) {
    notes.push("No lands were identified from card data. Check card lookup status.");
  }
  if (hand.length !== 7) {
    notes.push("Enter exactly seven cards for opening-hand math.");
  }
  if (commanderCard) {
    notes.push(`${commanderCard} is being treated as an eighth available card from the command zone.`);
    notes.push("Commander/Brawl uses a free first mulligan, so the mulligan comparison is a second seven rather than a six.");
  }

  return {
    mainCount: parsed.mainCount,
    librarySize,
    landsInHand,
    effectiveLandsInHand,
    landsRemaining,
    effectiveLandsRemaining,
    averageManaValue,
    handTextureScore,
    baseHandTextureScore,
    castabilityTextureAdjustment: castabilityAdjustment.adjustment,
    manaTextureAdjustment: manaAdjustment.adjustment,
    deckRelativePercentile: deckRelativeScore.percentile,
    riskAdjustedUtility: deckRelativeScore.utility.riskAdjustedUtility,
    scoreConfidence: deckRelativeScore.confidence,
    scoringVersion: deckRelativeScore.scoringVersion,
    keepExpectedValue: deckRelativeScore.keepExpectedValue,
    mulliganExpectedValue: deckRelativeScore.mulliganExpectedValue,
    keepAdvantage: deckRelativeScore.keepAdvantage,
    severeFailureProbability: deckRelativeScore.utility.catastrophicFailureRate,
    scoreFactors: deckRelativeScore.factors,
    handTextureLabel: textureLabel(handTextureScore),
    recommendation: rec.label,
    recommendationTone: rec.tone,
    turnProbabilities,
    castability,
    curve,
    manaAudit,
    sourceAssumptions,
    drawSources,
    rampSources,
    landEquivalentSources,
    tags,
    watchouts,
    mulligan,
    playDrawComparison,
    deckProfile: profile,
    commanderCard,
    landNames,
    missingCards,
    lookupFailures: [],
    notes
  };
}
