"use client";

import { ClipboardEvent, DragEvent, useEffect, useMemo, useState } from "react";
import {
  analyzeOpeningHand,
  fetchCardData,
  type AnalyzerResult,
  type CardLookup,
  type PlayDraw
} from "@/lib/analyzer";
import { convertDekToDecklist, inferDeckName, parseDecklist } from "@/lib/deckParser";
import type { SavedDeck } from "@/lib/decks";
import { supabase } from "@/lib/supabase";
import { useEntitlements } from "@/components/useEntitlements";

type WorkflowTab = "deck" | "hand" | "screenshot" | "results";
type ResultTab = "overview" | "deep" | "curve" | "mulligan" | "other";
type ScreenshotSource = "mtgo" | "arena";

type CropPreview = {
  index: number;
  src: string;
};

type CropAdjustments = {
  x: number;
  y: number;
  width: number;
  height: number;
  spread: number;
  fan: number;
};

type RecognitionCandidate = {
  cardName: string;
  score: number;
  imageScore: number;
  textScore: number;
  ocrText: string;
  isConflict?: boolean;
};

type RecognitionResult = {
  cropIndex: number;
  candidates: RecognitionCandidate[];
};

type ChartPoint = {
  turn: number;
  chance: number;
};

type ChartSeries = {
  label: string;
  color: string;
  points: ChartPoint[];
};

const sampleDeck = `Deck
4 Monastery Swiftspear
4 Lightning Strike
4 Play with Fire
4 Phoenix Chick
4 Kumano Faces Kakkazan
4 Charming Scoundrel
4 Imodane's Recruiter
4 Warden of the Inner Sky
4 Inspiring Vantage
4 Battlefield Forge
12 Mountain
8 Plains`;

const sampleHand = `Monastery Swiftspear
Lightning Strike
Play with Fire
Mountain
Mountain
Battlefield Forge
Inspiring Vantage`;

const lastDeckStorageKey = "mtg-hand-pro:last-analyzer-deck-id";
const signatureCachePrefix = "mtg-hand-pro:image-signature:";
const defaultCropAdjustments: CropAdjustments = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  spread: 0,
  fan: 0
};

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function number(value: number) {
  return value.toFixed(1).replace(/\.0$/, "");
}

function percentNumber(value: number) {
  return Math.round(value * 1000) / 10;
}

function uniqueDeckOptions(decklist: string) {
  return Array.from(
    new Set(parseDecklist(decklist).cards.map((card) => card.name).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

async function captureScreenFrame() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("This browser does not support direct window capture.");
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false
  });

  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    await new Promise((resolve) => setTimeout(resolve, 250));

    const track = stream.getVideoTracks()[0];
    const settings = track?.getSettings();
    const width = settings?.width ?? video.videoWidth;
    const height = settings?.height ?? video.videoHeight;
    if (!width || !height) {
      throw new Error("Could not read the selected window.");
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Could not capture the selected window.");
    }
    context.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load that screenshot."));
    image.src = src;
  });
}

async function imageSignature(src: string, cacheKey = "", width = 14, height = 20) {
  if (cacheKey) {
    const cached = window.localStorage.getItem(signatureCachePrefix + cacheKey);
    if (cached) {
      return cached.split(",").map((value) => Number(value) / 255);
    }
  }

  const image = await loadImage(src);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("This browser could not inspect card images.");
    }
    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const values: number[] = [];
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      values.push((r + g + b) / 3 / 255);
      values.push((r - b + 255) / 510);
      values.push((g - b + 255) / 510);
    }
    if (cacheKey) {
      try {
        window.localStorage.setItem(
          signatureCachePrefix + cacheKey,
          values.map((value) => Math.round(value * 255)).join(",")
        );
      } catch {
        // Local storage is a speed-up only; recognition still works without it.
      }
    }
    return values;
}

type BrowserTextDetector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

async function readTextSignal(src: string) {
  const textDetectorConstructor = (window as unknown as {
    TextDetector?: new () => BrowserTextDetector;
  }).TextDetector;
  if (!textDetectorConstructor) {
    return "";
  }

  try {
    const image = await loadImage(src);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      return "";
    }
    canvas.width = image.width;
    canvas.height = Math.max(24, Math.round(image.height * 0.22));
    context.drawImage(image, 0, 0, image.width, canvas.height, 0, 0, canvas.width, canvas.height);
    const detector = new textDetectorConstructor();
    const detections = await detector.detect(canvas);
    return detections.map((item) => item.rawValue ?? "").join(" ").trim();
  } catch {
    return "";
  }
}

function fuzzyTextScore(text: string, cardName: string) {
  const cleanText = text.toLowerCase().replace(/[^a-z0-9 ]/g, " ");
  const cleanName = cardName.toLowerCase().replace(/[^a-z0-9 ]/g, " ");
  if (!cleanText || !cleanName) {
    return 0;
  }
  if (cleanText.includes(cleanName)) {
    return 1;
  }
  const tokens = cleanName.split(/\s+/).filter((token) => token.length > 2);
  if (!tokens.length) {
    return 0;
  }
  return tokens.filter((token) => cleanText.includes(token)).length / tokens.length;
}

function signatureDistance(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  if (!length) {
    return Number.POSITIVE_INFINITY;
  }
  let total = 0;
  for (let index = 0; index < length; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    total += delta * delta;
  }
  return Math.sqrt(total / length);
}

async function recognizeCropImages(
  crops: CropPreview[],
  cardData: Map<string, CardLookup>,
  deckOptions: string[]
): Promise<RecognitionResult[]> {
  const uniqueCards = deckOptions
    .map((name) => cardData.get(name.trim().toLowerCase()))
    .filter((card): card is CardLookup => Boolean(card?.imageUrl));
  const cardImageVariants = uniqueCards.flatMap((card) =>
    (card.imageUrls.length ? card.imageUrls : [card.imageUrl]).map((imageUrl) => ({ card, imageUrl }))
  );
  const cardSignatures = (
    await Promise.all(
    cardImageVariants.map(async ({ card, imageUrl }) => ({
      card,
      signature: await imageSignature(imageUrl, `${card.name}:${imageUrl}`).catch(() => null)
    }))
    )
  ).filter((item): item is { card: CardLookup; signature: number[] } => Boolean(item.signature));

  if (!cardSignatures.length) {
    throw new Error("Card images could not be loaded for recognition.");
  }

  return Promise.all(
    crops.map(async (crop) => {
      const cropSignature = await imageSignature(crop.src);
      const ocrText = await readTextSignal(crop.src);
      const scoredByCard = new Map<string, RecognitionCandidate>();
      for (const { card, signature } of cardSignatures) {
        const imageScore = Math.max(0, Math.min(1, 1 - signatureDistance(cropSignature, signature)));
        const textScore = fuzzyTextScore(ocrText, card.name);
        const candidate = {
          cardName: card.name,
          score: Math.max(0, Math.min(1, imageScore * 0.72 + textScore * 0.28)),
          imageScore,
          textScore,
          ocrText
        };
        const current = scoredByCard.get(card.name);
        if (!current || candidate.score > current.score) {
          scoredByCard.set(card.name, candidate);
        }
      }
      const candidates = Array.from(scoredByCard.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      const top = candidates[0];
      const second = candidates[1];
      if (top && second && (Math.abs(top.score - second.score) < 0.08 || (top.textScore > 0.55 && second.imageScore > top.imageScore + 0.08))) {
        top.isConflict = true;
        second.isConflict = true;
      }
      return { cropIndex: crop.index, candidates };
    })
  );
}

async function makeCrops(src: string, source: ScreenshotSource, adjustments: CropAdjustments) {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser could not prepare screenshot crops.");
  }

  const crops: CropPreview[] = [];
  const cropWidth =
    (source === "arena" ? image.width * 0.2 : image.width * 0.112) * (1 + adjustments.width / 100);
  const cropHeight =
    (source === "arena" ? image.height * 0.54 : image.height * 0.25) * (1 + adjustments.height / 100);
  const startX = (source === "arena" ? image.width * 0.035 : image.width * 0.071) + image.width * (adjustments.x / 100);
  const startY = (source === "arena" ? image.height * 0.255 : image.height * 0.705) + image.height * (adjustments.y / 100);
  const step =
    (source === "arena" ? image.width * 0.133 : image.width * 0.115) * (1 + adjustments.spread / 100);
  const arenaBaseAngles = [-13, -8, -4, 0, 4, 8, 13];

  canvas.width = Math.round(cropWidth);
  canvas.height = Math.round(cropHeight);

  for (let index = 0; index < 7; index += 1) {
    const curveOffset =
      source === "arena" ? image.height * 0.018 * Math.abs(index - 3) + image.height * (adjustments.fan / 100) * (Math.abs(index - 3) / 3) : 0;
    const sourceX = Math.round(startX + step * index);
    const sourceY = Math.round(startY + curveOffset);
    const angle = source === "arena" ? ((arenaBaseAngles[index] ?? 0) * Math.PI) / 180 : 0;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(-angle);
    context.drawImage(
      image,
      sourceX,
      sourceY,
      Math.round(cropWidth),
      Math.round(cropHeight),
      -canvas.width / 2,
      -canvas.height / 2,
      canvas.width,
      canvas.height
    );
    context.restore();
    crops.push({ index, src: canvas.toDataURL("image/png") });
  }

  return crops;
}

export function HandAnalyzer() {
  const entitlements = useEntitlements();
  const [workflowTab, setWorkflowTab] = useState<WorkflowTab>("deck");
  const [resultTab, setResultTab] = useState<ResultTab>("overview");
  const [decklist, setDecklist] = useState(sampleDeck);
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState("custom");
  const [isLoadingDecks, setIsLoadingDecks] = useState(false);
  const [handText, setHandText] = useState(sampleHand);
  const [confirmedHand, setConfirmedHand] = useState(sampleHand.split(/\r?\n/));
  const [playDraw, setPlayDraw] = useState<PlayDraw>("play");
  const [screenshotSource, setScreenshotSource] = useState<ScreenshotSource>("mtgo");
  const [screenshotSrc, setScreenshotSrc] = useState("");
  const [cropAdjustments, setCropAdjustments] = useState(defaultCropAdjustments);
  const [crops, setCrops] = useState<CropPreview[]>([]);
  const [recognitionResults, setRecognitionResults] = useState<RecognitionResult[]>([]);
  const [result, setResult] = useState<AnalyzerResult | null>(null);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);

  const parsed = useMemo(() => parseDecklist(decklist), [decklist]);
  const options = useMemo(() => uniqueDeckOptions(decklist), [decklist]);
  const hand = useMemo(
    () => handText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    [handText]
  );

  useEffect(() => {
    async function loadSavedDecks() {
      if (!supabase || !entitlements.canUseDeckVault) {
        return;
      }

      setIsLoadingDecks(true);
      const { data, error } = await supabase
        .from("decks")
        .select("*")
        .eq("is_archived", false)
        .order("updated_at", { ascending: false });
      setIsLoadingDecks(false);

      if (error) {
        setMessage(error.message);
        return;
      }

      const decks = (data ?? []) as SavedDeck[];
      setSavedDecks(decks);
      const requestedId =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("deck") : "";
      const rememberedId = window.localStorage.getItem(lastDeckStorageKey);
      const requestedDeck = decks.find((deck) => deck.id === requestedId);
      const rememberedDeck = decks.find((deck) => deck.id === rememberedId);
      const initialDeck = requestedDeck ?? rememberedDeck ?? decks[0];

      if (initialDeck) {
        setSelectedDeckId(initialDeck.id);
        setDecklist(initialDeck.decklist);
        window.localStorage.setItem(lastDeckStorageKey, initialDeck.id);
        if (requestedDeck) {
          setMessage(`Loaded ${requestedDeck.name}.`);
        }
      }
    }

    if (entitlements.canUseDeckVault) {
      void loadSavedDecks();
    } else if (!entitlements.isLoading) {
      setSavedDecks([]);
      setSelectedDeckId("custom");
      window.localStorage.removeItem(lastDeckStorageKey);
    }
  }, [entitlements.canUseDeckVault, entitlements.isLoading]);

  function chooseSavedDeck(deckId: string) {
    setSelectedDeckId(deckId);
    if (deckId === "custom") {
      window.localStorage.removeItem(lastDeckStorageKey);
      return;
    }

    const deck = savedDecks.find((item) => item.id === deckId);
    if (!deck) {
      return;
    }

    setDecklist(deck.decklist);
    window.localStorage.setItem(lastDeckStorageKey, deck.id);
    setMessage(`Loaded ${deck.name}.`);
  }

  async function handleDeckDekUpload(file: File) {
    setMessage("");
    try {
      const converted = convertDekToDecklist(await file.text());
      const convertedParsed = parseDecklist(converted);
      if (!convertedParsed.mainCount) {
        setMessage("That .dek file did not contain any main-deck cards.");
        return;
      }
      setDecklist(converted);
      setSelectedDeckId("custom");
      window.localStorage.removeItem(lastDeckStorageKey);
      setMessage(`Imported .dek file: ${convertedParsed.mainCount} main, ${convertedParsed.sideboardCount} sideboard.`);
    } catch {
      setMessage("Could not import that .dek file.");
    }
  }

  function applyPastedHand() {
    const next = hand.slice(0, 7);
    while (next.length < 7) {
      next.push(options[0] ?? "");
    }
    setConfirmedHand(next);
    setMessage("Confirmed hand updated from pasted text.");
  }

  function updateConfirmed(index: number, value: string) {
    setConfirmedHand((current) => current.map((card, cardIndex) => (cardIndex === index ? value : card)));
  }

  async function recognizeCrops(nextCrops: CropPreview[]) {
    if (!nextCrops.length) {
      return;
    }
    setIsRecognizing(true);
    setRecognitionResults([]);
    try {
      const namesForLookup = parsed.cards.map((card) => card.name);
      const { lookups, failures } = await fetchCardData(namesForLookup, { includePrintImages: true });
      const recognized = await recognizeCropImages(nextCrops, lookups, options);
      setRecognitionResults(recognized);
      const nextHand = recognized.map((crop) => crop.candidates[0]?.cardName ?? "");
      if (nextHand.filter(Boolean).length === 7) {
        setConfirmedHand(nextHand);
        setHandText(nextHand.join("\n"));
        setMessage(
          failures.length
            ? `Recognition finished, but ${failures.length} card lookup(s) need review. Confirm the seven cards below; dropdowns still work for loaded cards.`
            : "Recognition finished. Confirm the seven cards below, then analyze."
        );
      } else {
        setMessage("Recognition ran, but some cards need manual confirmation.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? `${error.message} You can still choose the seven cards manually.`
          : "Recognition failed. You can still choose the seven cards manually."
      );
    } finally {
      setIsRecognizing(false);
    }
  }

  async function processScreenshotSrc(src: string) {
    setMessage("");
    setIsCropping(true);
    try {
      const nextCrops = await makeCrops(src, screenshotSource, cropAdjustments);
      setScreenshotSrc(src);
      setCrops(nextCrops);
      setWorkflowTab("screenshot");
      setMessage("Screenshot loaded. Reading cards from deck images...");
      await recognizeCrops(nextCrops);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not process that screenshot.");
    } finally {
      setIsCropping(false);
    }
  }

  async function applyCropAdjustments() {
    if (!screenshotSrc) {
      setMessage("Add a screenshot before adjusting crops.");
      return;
    }
    setMessage("");
    setIsCropping(true);
    try {
      const nextCrops = await makeCrops(screenshotSrc, screenshotSource, cropAdjustments);
      setCrops(nextCrops);
      setMessage("Crops updated. Reading cards again...");
      await recognizeCrops(nextCrops);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update crop positions.");
    } finally {
      setIsCropping(false);
    }
  }

  function resetCropAdjustments() {
    setCropAdjustments(defaultCropAdjustments);
  }

  async function handleScreenshotFile(file: File) {
    setMessage("");
    try {
      await processScreenshotSrc(await readFileAsDataUrl(file));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not process that screenshot.");
    }
  }

  async function captureWindowScreenshot() {
    setMessage("");
    try {
      setIsCropping(true);
      const src = await captureScreenFrame();
      setIsCropping(false);
      await processScreenshotSrc(src);
    } catch (error) {
      setIsCropping(false);
      setMessage(
        error instanceof Error
          ? `${error.message} You can still paste, drag/drop, or upload a screenshot.`
          : "Window capture did not complete. You can still paste, drag/drop, or upload a screenshot."
      );
    }
  }

  async function pasteClipboardImage() {
    setMessage("");
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (imageType) {
          await handleScreenshotFile(new File([await item.getType(imageType)], "clipboard.png", { type: imageType }));
          return;
        }
      }
      setMessage("Clipboard did not contain an image.");
    } catch {
      setMessage("Browser clipboard access was blocked. Click the screenshot box and press Ctrl+V instead.");
    }
  }

  async function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith("image/"));
    if (image) {
      await handleScreenshotFile(image);
    }
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const image = Array.from(event.dataTransfer.files).find((file) => file.type.startsWith("image/"));
    if (image) {
      await handleScreenshotFile(image);
    }
  }

  async function runAnalysis(sourceHand = confirmedHand) {
    setMessage("");
    setResult(null);

    const seven = sourceHand.map((name) => name.trim()).filter(Boolean);
    if (parsed.mainCount === 0) {
      setMessage("Paste a main deck before analyzing.");
      setWorkflowTab("deck");
      return;
    }
    if (seven.length !== 7) {
      setMessage("Confirm exactly seven cards before analyzing.");
      setWorkflowTab("hand");
      return;
    }

    setIsBusy(true);
    try {
      const namesForLookup = parsed.cards.map((card) => card.name);
      const { lookups, failures } = await fetchCardData(namesForLookup);
      const analysis = analyzeOpeningHand(decklist, seven, lookups, playDraw);
      const completedAnalysis = { ...analysis, lookupFailures: failures };
      setResult(completedAnalysis);
      setWorkflowTab("results");
      setResultTab("overview");
      await saveHandSession(seven, completedAnalysis);
      if (failures.length) {
        setMessage(`Analysis ran, but ${failures.length} Scryfall lookup(s) need review: ${failures.slice(0, 3).join("; ")}${failures.length > 3 ? "..." : ""}`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not analyze this hand.");
    } finally {
      setIsBusy(false);
    }
  }

  async function saveHandSession(seven: string[], analysis: AnalyzerResult) {
    if (!supabase) {
      return;
    }

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return;
    }

    const { error } = await supabase.from("hand_sessions").insert({
      user_id: userData.user.id,
      deck_id: selectedDeckId === "custom" ? null : selectedDeckId,
      source: screenshotSrc ? "screenshot" : "manual",
      confirmed_hand: seven,
      analysis_json: analysis,
      screenshot_metadata: {
        source: screenshotSrc ? screenshotSource : "none",
        crop_count: crops.length
      },
      decision: analysis.recommendationTone === "good" ? "keep" : analysis.recommendationTone === "bad" ? "mulligan" : "close"
    });

    if (error) {
      setMessage(`Analysis complete. Session count could not be saved: ${error.message}`);
    }
  }

  function renderWorkflowTabs() {
    const tabs: Array<{ id: WorkflowTab; label: string }> = [
      { id: "deck", label: "Deck" },
      { id: "hand", label: "Hand" },
      { id: "screenshot", label: "Screenshot" },
      { id: "results", label: "Results" }
    ];
    return (
      <div className="tool-tabs">
        {tabs.map((tab) => (
          <button
            className={workflowTab === tab.id ? "is-selected" : ""}
            key={tab.id}
            onClick={() => setWorkflowTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  function renderResultTabs() {
    const tabs: Array<{ id: ResultTab; label: string }> = [
      { id: "overview", label: "Overview" },
      { id: "deep", label: "Deep Data" },
      { id: "curve", label: "Mana Curve" },
      { id: "mulligan", label: "Mulligan" },
      { id: "other", label: "Other" }
    ];
    return (
      <div className="tool-tabs result-tabs">
        {tabs.map((tab) => (
          <button
            className={resultTab === tab.id ? "is-selected" : ""}
            key={tab.id}
            onClick={() => setResultTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <section className="analyzer-page">
      <header className="panel dashboard-header">
        <p className="eyebrow">Opening hand analyzer</p>
        <h1>Analyze a Seven</h1>
        <p>
          Paid-version port of the beta workflow: deck matrix, confirmed hand,
          screenshot intake, land math, draw/ramp context, mulligan comparison,
          and mana curve.
        </p>
      </header>

      {renderWorkflowTabs()}
      {message ? <p className="form-message analyzer-message">{message}</p> : null}

      {workflowTab === "deck" ? (
        <section className="panel analyzer-input-panel narrow-tool-panel">
          <div className="section-heading">
            <p className="eyebrow">Deck matrix</p>
            {entitlements.canUseDeckVault ? (
              <label className="field-stack deck-picker">
                Saved deck
                <select
                  className="card-select"
                  disabled={isLoadingDecks}
                  onChange={(event) => chooseSavedDeck(event.target.value)}
                  value={selectedDeckId}
                >
                  <option value="custom">
                    {isLoadingDecks ? "Loading saved decks..." : "Custom pasted deck"}
                  </option>
                  {savedDecks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name} {deck.format ? `(${deck.format})` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <p>
              Paste your main deck first. Put Sideboard on its own line, then list
              sideboard cards below it. Sideboard cards help screenshot
              confirmation, but analysis assumes the main deck unless one appears
              in the confirmed hand.
            </p>
          </div>
          <div className="mini-metrics">
            <span>{parsed.mainCount} main</span>
            <span>{parsed.sideboardCount} sideboard</span>
            <span>{parsed.cards.length} unique rows</span>
          </div>
          {!entitlements.canUseDeckVault && !entitlements.isLoading ? (
            <div className="onboarding-panel">
              <strong>Saved decks unlock with Deck Pro</strong>
              <span>
                Free users can still paste a deck here and run the full analyzer.
                The saved deck dropdown and deck vault are part of the $5/month tier.
              </span>
            </div>
          ) : entitlements.canUseDeckVault && !savedDecks.length ? (
            <div className="onboarding-panel">
              <strong>No saved decks yet</strong>
              <span>
                Paste a list here or use Save a Deck from the top navigation. Saved decks will appear in the dropdown automatically.
              </span>
              <button
                className="secondary-button"
                onClick={() => {
                  setDecklist(sampleDeck);
                  setSelectedDeckId("custom");
                }}
                type="button"
              >
                Load example deck
              </button>
            </div>
          ) : null}
          <label className="field-stack">
            Decklist
            <textarea
              className="analyzer-textarea deck-textarea"
              onChange={(event) => {
                setDecklist(event.target.value);
                setSelectedDeckId("custom");
                window.localStorage.removeItem(lastDeckStorageKey);
              }}
              spellCheck={false}
              value={decklist}
            />
          </label>
          <div className="import-row">
            <span>MTGO .dek file</span>
            <label className="secondary-button file-button">
              Import .dek
              <input
                accept=".dek,text/xml,application/xml"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleDeckDekUpload(file);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </label>
          </div>
        </section>
      ) : null}

      {workflowTab === "hand" ? (
        <section className="panel analyzer-input-panel narrow-tool-panel">
          <div className="section-heading">
            <p className="eyebrow">Manual override</p>
            <h2>Confirm Opening Hand</h2>
            <p>Paste seven names or correct the seven dropdowns directly.</p>
          </div>
          <label className="field-stack">
            Paste a hand list
            <textarea
              className="analyzer-textarea hand-textarea"
              onChange={(event) => setHandText(event.target.value)}
              spellCheck={false}
              value={handText}
            />
          </label>
          <button className="secondary-button" onClick={applyPastedHand} type="button">
            Use pasted hand
          </button>
          <div className="confirmed-hand-grid">
            {Array.from({ length: 7 }, (_, index) => (
              <label className="field-stack" key={index}>
                Card {index + 1}
                <select
                  className="card-select"
                  onChange={(event) => updateConfirmed(index, event.target.value)}
                  value={confirmedHand[index] ?? ""}
                >
                  <option value="">Choose card</option>
                  {options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="segmented-control" aria-label="Play or draw">
            <button className={playDraw === "play" ? "is-selected" : ""} onClick={() => setPlayDraw("play")} type="button">
              On the play
            </button>
            <button className={playDraw === "draw" ? "is-selected" : ""} onClick={() => setPlayDraw("draw")} type="button">
              On the draw
            </button>
          </div>
          <button className="primary-button" disabled={isBusy} onClick={() => runAnalysis()} type="button">
            {isBusy ? "Analyzing..." : "Use this hand and analyze"}
          </button>
        </section>
      ) : null}

      {workflowTab === "screenshot" ? (
        <section className="panel analyzer-input-panel">
          <div className="section-heading">
            <p className="eyebrow">Vision stack</p>
            <h2>Screenshot Recognition</h2>
            <p>
              Capture the MTGO/Arena window with browser permission, or paste,
              drag/drop, or browse for a screenshot. The app compares the seven
              crops against the cards in your deck, fills the confirmed hand, and
              keeps every dropdown editable.
            </p>
          </div>
          <div className="segmented-control" aria-label="Screenshot source">
            <button
              className={screenshotSource === "mtgo" ? "is-selected" : ""}
              onClick={() => {
                setScreenshotSource("mtgo");
                setCropAdjustments(defaultCropAdjustments);
              }}
              type="button"
            >
              Magic Online
            </button>
            <button
              className={screenshotSource === "arena" ? "is-selected" : ""}
              onClick={() => {
                setScreenshotSource("arena");
                setCropAdjustments(defaultCropAdjustments);
              }}
              type="button"
            >
              MTG Arena
            </button>
          </div>
          <div className="onboarding-panel">
            <strong>Best screenshots</strong>
            <span>
              Use a full game window with only the opening seven visible. Arena mode expects the fan across the center; Magic Online mode expects the seven cards along the bottom.
            </span>
          </div>
          <div
            className="screenshot-dropzone"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            onPaste={handlePaste}
            tabIndex={0}
          >
            <strong>Add a screenshot from your clipboard</strong>
            <div className="action-row compact-actions">
              <button className="primary-button" disabled={isCropping || isRecognizing} onClick={captureWindowScreenshot} type="button">
                {isCropping || isRecognizing
                  ? "Reading..."
                  : screenshotSource === "arena"
                    ? "Capture Arena Window"
                    : "Capture MTGO Window"}
              </button>
              <button className="secondary-button" disabled={isCropping} onClick={pasteClipboardImage} type="button">
                {isCropping || isRecognizing ? "Reading..." : "Paste Clipboard"}
              </button>
              <label className="secondary-button file-button">
                Choose Image
                <input
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleScreenshotFile(file);
                  }}
                  type="file"
                />
              </label>
            </div>
            <span>For capture, choose the game window in the browser picker. You can also click this box and press Ctrl+V, or drag/drop an image here.</span>
          </div>
          {screenshotSrc ? (
            <div className="screenshot-preview-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Uploaded gameplay screenshot" src={screenshotSrc} />
            </div>
          ) : null}
          {crops.length ? (
            <>
              <details className="crop-adjust-panel">
                <summary>Adjust detected card row</summary>
                <div className="crop-adjust-grid">
                  <RangeControl label="Move left/right" max={10} min={-10} onChange={(x) => setCropAdjustments((value) => ({ ...value, x }))} value={cropAdjustments.x} />
                  <RangeControl label="Move up/down" max={10} min={-10} onChange={(y) => setCropAdjustments((value) => ({ ...value, y }))} value={cropAdjustments.y} />
                  <RangeControl label="Card width" max={35} min={-25} onChange={(width) => setCropAdjustments((value) => ({ ...value, width }))} value={cropAdjustments.width} />
                  <RangeControl label="Card height" max={35} min={-25} onChange={(height) => setCropAdjustments((value) => ({ ...value, height }))} value={cropAdjustments.height} />
                  <RangeControl label="Spacing" max={25} min={-20} onChange={(spread) => setCropAdjustments((value) => ({ ...value, spread }))} value={cropAdjustments.spread} />
                  <RangeControl label="Arena fan arc" max={12} min={-12} onChange={(fan) => setCropAdjustments((value) => ({ ...value, fan }))} value={cropAdjustments.fan} />
                </div>
                <div className="action-row compact-actions">
                  <button className="secondary-button" disabled={isCropping || isRecognizing} onClick={applyCropAdjustments} type="button">
                    Apply and reread
                  </button>
                  <button className="text-button" onClick={resetCropAdjustments} type="button">
                    Reset
                  </button>
                </div>
              </details>
              <div className="recognition-status-row">
                <strong>{isRecognizing ? "Reading cards..." : "Recognition candidates"}</strong>
                <button
                  className="secondary-button"
                  disabled={isRecognizing}
                  onClick={() => recognizeCrops(crops)}
                  type="button"
                >
                  Retry Recognition
                </button>
              </div>
              <div className="crop-grid">
                {crops.map((crop) => (
                  <figure className="crop-preview-card" key={crop.index}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt={`Detected crop ${crop.index + 1}`} src={crop.src} />
                    <figcaption>Crop {crop.index + 1}</figcaption>
                    <CandidateList
                      cropIndex={crop.index}
                      onChoose={(name) => updateConfirmed(crop.index, name)}
                      result={recognitionResults.find((item) => item.cropIndex === crop.index)}
                    />
                  </figure>
                ))}
              </div>
              <div className="confirmed-hand-grid">
                {Array.from({ length: 7 }, (_, index) => (
                  <label className="field-stack" key={index}>
                    Card {index + 1}
                    <select
                      className="card-select"
                      onChange={(event) => updateConfirmed(index, event.target.value)}
                      value={confirmedHand[index] ?? ""}
                    >
                      <option value="">Choose card</option>
                      {options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button className="primary-button" disabled={isBusy} onClick={() => runAnalysis()} type="button">
                {isBusy ? "Analyzing..." : "Confirm crops and analyze"}
              </button>
            </>
          ) : null}
        </section>
      ) : null}

      {workflowTab === "results" ? (
        <section className="panel analyzer-results">
          {!result ? (
            <div className="empty-state">
              <strong>No analysis yet</strong>
              <span>Confirm seven cards from the Hand or Screenshot tab, then analyze.</span>
            </div>
          ) : (
            <>
              {renderResultTabs()}
              {resultTab === "overview" ? <Overview result={result} /> : null}
              {resultTab === "deep" ? <DeepData result={result} /> : null}
              {resultTab === "curve" ? <ManaCurve result={result} /> : null}
              {resultTab === "mulligan" ? <Mulligan result={result} /> : null}
              {resultTab === "other" ? <OtherTools result={result} /> : null}
            </>
          )}
        </section>
      ) : null}

    </section>
  );
}

function Overview({ result }: { result: AnalyzerResult }) {
  return (
    <div className="result-stack">
      <div className={`result-hero-card ${result.recommendationTone}`}>
        <p className="eyebrow">Recommendation</p>
        <h2>{result.recommendation}</h2>
        <p>
          {result.handTextureLabel} texture, {result.effectiveLandsInHand} effective land
          source(s), and {pct(result.turnProbabilities[1]?.landDropWithDraw ?? 0)} to
          make the third land drop by turn 3 with draw/look spells included.
        </p>
      </div>
      <div className="dashboard-metrics analyzer-metrics">
        <div className="metric-card">
          <span>Hand texture</span>
          <strong>{result.handTextureScore}</strong>
        </div>
        <div className="metric-card">
          <span>Lands in hand</span>
          <strong>{result.landsInHand}</strong>
        </div>
        <div className="metric-card">
          <span>Effective sources</span>
          <strong>{result.effectiveLandsInHand}</strong>
        </div>
        <div className="metric-card">
          <span>Mull to 6 avg</span>
          <strong>{result.mulligan ? number(result.mulligan.average) : "n/a"}</strong>
        </div>
      </div>
      <div className="tag-row">
        {result.tags.map((tag) => (
          <span className={`hand-tag ${tag.tone}`} key={tag.label}>
            {tag.label}
          </span>
        ))}
      </div>
      <section className={`deck-context-card ${result.deckProfile.handLandTone}`}>
        <div>
          <p className="eyebrow">Deck Context</p>
          <h2>{result.deckProfile.label}</h2>
          <p>{result.deckProfile.handLandContext}</p>
        </div>
        <div className="deck-context-metrics">
          <span>
            Suggested opener
            <strong>{result.deckProfile.suggestedKeepLandRange}</strong>
          </span>
          <span>
            Curve top
            <strong>{result.deckProfile.curveTop}</strong>
          </span>
          <span>
            Deck avg MV
            <strong>{number(result.deckProfile.averageManaValue)}</strong>
          </span>
          <span>
            Score impact
            <strong>{result.deckProfile.scoreAdjustment > 0 ? "+" : ""}{result.deckProfile.scoreAdjustment}</strong>
          </span>
        </div>
      </section>
      <section>
        <h2>Watch-outs</h2>
        <div className="watchout-panel">
          {(result.watchouts.length ? result.watchouts : ["No major structural warning from land count, card velocity, ramp, or mulligan comparison."]).map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      </section>

      <section className="overview-chart-grid">
        <div className="chart-card primary-chart">
          <LineChart
            description="Natural draws, draw/look spells, and effective land-equivalent sources through turn 8."
            series={[
              {
                label: "Natural land drop",
                color: "#59d8ff",
                points: result.turnProbabilities.map((row) => ({
                  turn: row.turn,
                  chance: row.landDropNatural
                }))
              },
              {
                label: "With draw/look",
                color: "#a68cff",
                points: result.turnProbabilities.map((row) => ({
                  turn: row.turn,
                  chance: row.landDropWithDraw
                }))
              },
              {
                label: "Effective sources",
                color: "#62e6a6",
                points: result.turnProbabilities.map((row) => ({
                  turn: row.turn,
                  chance: row.effectiveLandDrop
                }))
              }
            ]}
            title="Will I hit land drops?"
          />
        </div>

        <div className="plain-read-card">
          <p className="eyebrow">Plain-English Read</p>
          <p>
            Turn 3 land drop is{" "}
            <strong>{pct(result.turnProbabilities[1]?.landDropWithDraw ?? 0)}</strong>{" "}
            with draw/look effects included.
          </p>
          <p>
            Natural draws alone show{" "}
            <strong>{pct(result.turnProbabilities[1]?.landDropNatural ?? 0)}</strong>{" "}
            by turn 3.
          </p>
          <p>
            Draw and selection add about{" "}
            <strong>{number(result.turnProbabilities[1]?.extraLooks ?? 0)}</strong>{" "}
            expected extra look(s) by turn 3.
          </p>
        </div>
      </section>

      {result.drawSources.length ? (
        <section className="chart-card compact-chart">
          <LineChart
            description="How much the hand's draw/look spells improve the chance of finding the next land."
            series={[
              {
                label: "Natural next land",
                color: "#59d8ff",
                points: result.turnProbabilities.map((row) => ({
                  turn: row.turn,
                  chance: row.nextLandNatural
                }))
              },
              {
                label: "With draw/look",
                color: "#a68cff",
                points: result.turnProbabilities.map((row) => ({
                  turn: row.turn,
                  chance: row.nextLandWithDraw
                }))
              }
            ]}
            title="Card draw / selection impact"
          />
          <div className="source-chip-row">
            {result.drawSources.map((source) => (
              <span key={source.cardName}>
                {source.cardName}: {source.timing}
              </span>
            ))}
          </div>
        </section>
      ) : (
        <section className="watchout-panel">
          <h2>Card draw / selection impact</h2>
          <p>No clear draw/look spell in the confirmed hand.</p>
        </section>
      )}

      {result.castability.length ? (
        <section>
          <h2>Can I cast the hand?</h2>
          <p className="muted-copy">
            Seeded Monte Carlo castability with colors, tapped lands, draws, and land sequencing. Values are capped at 100%.
          </p>
          <div className="table-wrap compact-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Card</th>
                  <th>T1</th>
                  <th>T2</th>
                  <th>T3</th>
                </tr>
              </thead>
              <tbody>
                {result.castability.map((row) => (
                  <tr key={row.cardName}>
                    <td>{row.cardName}</td>
                    <td>{pct(row.turn1)}</td>
                    <td>{pct(row.turn2)}</td>
                    <td>{pct(row.turn3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function LineChart({
  description,
  series,
  title
}: {
  description: string;
  series: ChartSeries[];
  title: string;
}) {
  const width = 640;
  const height = 260;
  const padding = { top: 18, right: 28, bottom: 38, left: 44 };
  const allPoints = series.flatMap((item) => item.points);
  const turns = allPoints.map((point) => point.turn);
  const minTurn = Math.min(...turns);
  const maxTurn = Math.max(...turns);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const xForTurn = (turn: number) =>
    padding.left + ((turn - minTurn) / Math.max(1, maxTurn - minTurn)) * plotWidth;
  const yForChance = (chance: number) =>
    padding.top + (1 - Math.max(0, Math.min(1, chance))) * plotHeight;

  return (
    <div>
      <div className="chart-heading">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="chart-legend">
          {series.map((item) => (
            <span key={item.label}>
              <i style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>
      <svg className="line-chart" role="img" viewBox={`0 0 ${width} ${height}`} aria-label={title}>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = yForChance(tick);
          return (
            <g key={tick}>
              <line className="chart-grid-line" x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
              <text className="chart-axis-label" x={padding.left - 12} y={y + 4} textAnchor="end">
                {Math.round(tick * 100)}
              </text>
            </g>
          );
        })}
        {Array.from(new Set(turns)).map((turn) => (
          <text className="chart-axis-label" key={turn} x={xForTurn(turn)} y={height - 12} textAnchor="middle">
            T{turn}
          </text>
        ))}
        {series.map((item) => {
          const points = item.points
            .map((point) => `${xForTurn(point.turn)},${yForChance(point.chance)}`)
            .join(" ");
          return (
            <g key={item.label}>
              <polyline className="chart-line" points={points} stroke={item.color} />
              {item.points.map((point) => (
                <g key={`${item.label}-${point.turn}`}>
                  <circle className="chart-dot" cx={xForTurn(point.turn)} cy={yForChance(point.chance)} fill={item.color} r="4" />
                  <title>
                    {item.label} turn {point.turn}: {percentNumber(point.chance)}%
                  </title>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DeepData({ result }: { result: AnalyzerResult }) {
  return (
    <div className="result-stack">
      <h2>Land Details</h2>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Turn</th>
              <th>Draws</th>
              <th>Extra looks</th>
              <th>Next land natural</th>
              <th>Next land with draw</th>
              <th>Land drop natural</th>
              <th>Land drop with draw</th>
            </tr>
          </thead>
          <tbody>
            {result.turnProbabilities.map((row) => (
              <tr key={row.turn}>
                <td>{row.turn}</td>
                <td>{row.naturalDraws}</td>
                <td>{number(row.extraLooks)}</td>
                <td>{pct(row.nextLandNatural)}</td>
                <td>{pct(row.nextLandWithDraw)}</td>
                <td>{pct(row.landDropNatural)}</td>
                <td>{pct(row.landDropWithDraw)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Card-level Castability</h2>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Card</th>
              <th>MV</th>
              <th>T1</th>
              <th>T2</th>
              <th>T3</th>
            </tr>
          </thead>
          <tbody>
            {result.castability.map((row) => (
              <tr key={row.cardName}>
                <td>{row.cardName}</td>
                <td>{number(row.manaValue)}</td>
                <td>{pct(row.turn1)}</td>
                <td>{pct(row.turn2)}</td>
                <td>{pct(row.turn3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Mana Value Audit</h2>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Card</th>
              <th>Qty</th>
              <th>App MV</th>
              <th>Symbol check</th>
              <th>Check source</th>
              <th>Mana cost used</th>
              <th>Type</th>
              <th>Multiface</th>
            </tr>
          </thead>
          <tbody>
            {result.manaAudit.map((row) => (
              <tr key={`audit-${row.card}`}>
                <td>
                  <span className={`status-pill ${row.status === "OK" ? "good" : row.status === "Review" ? "bad" : "neutral"}`}>
                    {row.status}
                  </span>
                </td>
                <td>{row.card}</td>
                <td>{row.qty}</td>
                <td>{number(row.appManaValue)}</td>
                <td>{row.symbolCheck === null ? "n/a" : number(row.symbolCheck)}</td>
                <td>{row.checkSource}</td>
                <td>{row.manaCostUsed}</td>
                <td>{row.typeLine}</td>
                <td>{row.multiface ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Card Draw / Selection Impact</h2>
      <div className="table-wrap compact-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Turn</th>
              <th>Natural draws</th>
              <th>Extra looks</th>
              <th>Next land natural</th>
              <th>Next land with draw/look</th>
            </tr>
          </thead>
          <tbody>
            {result.turnProbabilities.map((row) => (
              <tr key={`draw-${row.turn}`}>
                <td>{row.turn}</td>
                <td>{row.naturalDraws}</td>
                <td>{number(row.extraLooks)}</td>
                <td>{pct(row.nextLandNatural)}</td>
                <td>{pct(row.nextLandWithDraw)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Mana Source and Ramp Assumptions</h2>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Card</th>
              <th>Type</th>
              <th>Timing</th>
              <th>Assumption</th>
            </tr>
          </thead>
          <tbody>
            {result.sourceAssumptions.map((row, index) => (
              <tr key={`source-${row.cardName}-${index}`}>
                <td>{row.cardName}</td>
                <td>{row.kind}</td>
                <td>{row.timing}</td>
                <td>{row.assumption}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.lookupFailures.length || result.missingCards.length || result.notes.length ? (
        <div className="analysis-notes">
          {result.lookupFailures.length ? <p>Scryfall lookup failures: {result.lookupFailures.join(", ")}</p> : null}
          {result.missingCards.length ? <p>Cards not found in main deck: {result.missingCards.join(", ")}</p> : null}
          {result.notes.map((note) => <p key={note}>{note}</p>)}
        </div>
      ) : null}
    </div>
  );
}

function ManaCurve({ result }: { result: AnalyzerResult }) {
  const max = Math.max(1, ...result.curve.map((row) => row.spells));
  return (
    <div className="result-stack curve-panel">
      <h2>Deck Mana Curve</h2>
      {result.curve.map((row) => (
        <div className="curve-row" key={row.manaValue}>
          <span>{row.manaValue}</span>
          <div>
            <i style={{ width: `${(row.spells / max) * 100}%` }} />
          </div>
          <strong>{row.spells}</strong>
        </div>
      ))}
      <p className="muted-copy">
        Mana values are pulled from Scryfall with MDFC castable-face handling.
      </p>
      <h2>Mana Value Verification</h2>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Card</th>
              <th>Qty</th>
              <th>App MV</th>
              <th>Symbol check</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {result.manaAudit.map((row) => (
              <tr key={`curve-audit-${row.card}`}>
                <td>
                  <span className={`status-pill ${row.status === "OK" ? "good" : row.status === "Review" ? "bad" : "neutral"}`}>
                    {row.status}
                  </span>
                </td>
                <td>{row.card}</td>
                <td>{row.qty}</td>
                <td>{number(row.appManaValue)}</td>
                <td>{row.symbolCheck === null ? "n/a" : number(row.symbolCheck)}</td>
                <td>{row.checkSource}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Mulligan({ result }: { result: AnalyzerResult }) {
  return (
    <div className="result-stack">
      <h2>Current Hand</h2>
      <p>Hand texture score: {result.handTextureScore}/100 ({result.handTextureLabel}).</p>
      <h2>Fresh 7, Bottom 1</h2>
      {result.mulligan ? (
        <div className="watchout-panel">
          <p>Simulated mulligan-to-six average: {number(result.mulligan.average)}/100; median: {result.mulligan.median}/100.</p>
          <p>Middle half of mulligan outcomes: {result.mulligan.p25}/100 to {result.mulligan.p75}/100.</p>
          <p>Fresh seven then bottom one is better about {pct(result.mulligan.better)} of the time.</p>
        </div>
      ) : (
        <p>Not enough deck data to simulate a fresh seven.</p>
      )}
    </div>
  );
}

function OtherTools({ result }: { result: AnalyzerResult }) {
  return (
    <div className="result-stack">
      <h2>Draw and Ramp Sources</h2>
      <div className="source-grid">
        <SourceList title="Draw/look spells" sources={result.drawSources} empty="No clear draw/look spell in the confirmed hand." />
        <SourceList title="Ramp cards" sources={result.rampSources} empty="No clear ramp source in the confirmed hand." />
        <SourceList title="Land equivalents" sources={result.landEquivalentSources} empty="No MDFC or cheap land-equivalent source counted." />
      </div>
      <h2>Sequencing Prompts</h2>
      <div className="watchout-panel">
        <p>Prioritize untapped sources if cheap spells show low turn-two castability.</p>
        <p>Draw/look spells add simulated card depth once the hand can cast them.</p>
        <p>Cheap mana permanents, treasures, and land-ramp text are included as sequencing assumptions in castability.</p>
      </div>
    </div>
  );
}

function CandidateList({
  cropIndex,
  onChoose,
  result
}: {
  cropIndex: number;
  onChoose: (name: string) => void;
  result?: RecognitionResult;
}) {
  if (!result?.candidates.length) {
    return <span className="candidate-empty">No candidates yet</span>;
  }

  const first = result.candidates[0];
  const second = result.candidates[1];
  const showConflictPrompt = Boolean(first?.isConflict && second?.isConflict);

  return (
    <div className="candidate-list">
      {showConflictPrompt && first && second ? (
        <div className="candidate-conflict">
          <strong>Which card?</strong>
          <div>
            <button onClick={() => onChoose(first.cardName)} type="button">
              {first.cardName}
            </button>
            <button onClick={() => onChoose(second.cardName)} type="button">
              {second.cardName}
            </button>
          </div>
        </div>
      ) : null}
      {result.candidates.map((candidate, index) => (
        <button
          className={index === 0 ? "is-best" : ""}
          key={`${cropIndex}-${candidate.cardName}`}
          onClick={() => onChoose(candidate.cardName)}
          type="button"
        >
          <span>{candidate.cardName}</span>
          <em title={`image ${Math.round(candidate.imageScore * 100)}%, text ${Math.round(candidate.textScore * 100)}%`}>
            {Math.round(candidate.score * 100)}%
          </em>
        </button>
      ))}
      {result.candidates[0]?.ocrText ? (
        <small className="ocr-note">Text read: {result.candidates[0].ocrText}</small>
      ) : null}
    </div>
  );
}

function RangeControl({
  label,
  max,
  min,
  onChange,
  value
}: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  return (
    <label className="range-control">
      <span>
        {label} <em>{value}</em>
      </span>
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        type="range"
        value={value}
      />
    </label>
  );
}

function SourceList({ title, sources, empty }: { title: string; sources: AnalyzerResult["drawSources"]; empty: string }) {
  return (
    <section className="source-card">
      <h3>{title}</h3>
      {sources.length ? (
        sources.map((source) => (
          <p key={`${title}-${source.cardName}`}>
            <strong>{source.cardName}</strong>: {source.sourceType}, {source.timing}
          </p>
        ))
      ) : (
        <p>{empty}</p>
      )}
    </section>
  );
}
