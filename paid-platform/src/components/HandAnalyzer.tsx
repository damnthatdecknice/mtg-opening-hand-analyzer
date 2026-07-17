"use client";

import { ClipboardEvent, DragEvent, useMemo, useState } from "react";
import {
  analyzeOpeningHand,
  fetchCardData,
  type AnalyzerResult,
  type CardLookup,
  type PlayDraw
} from "@/lib/analyzer";
import { inferDeckName, parseDecklist } from "@/lib/deckParser";

type WorkflowTab = "deck" | "hand" | "screenshot" | "results";
type ResultTab = "overview" | "deep" | "curve" | "mulligan" | "other";
type ScreenshotSource = "mtgo" | "arena";

type CropPreview = {
  index: number;
  src: string;
};

type RecognitionCandidate = {
  cardName: string;
  score: number;
};

type RecognitionResult = {
  cropIndex: number;
  candidates: RecognitionCandidate[];
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

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function number(value: number) {
  return value.toFixed(1).replace(/\.0$/, "");
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

function imageSignature(src: string, width = 24, height = 34) {
  return loadImage(src).then((image) => {
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
    return values;
  });
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
  const cardSignatures = (
    await Promise.all(
    uniqueCards.map(async (card) => ({
      card,
      signature: await imageSignature(card.imageUrl).catch(() => null)
    }))
    )
  ).filter((item): item is { card: CardLookup; signature: number[] } => Boolean(item.signature));

  if (!cardSignatures.length) {
    throw new Error("Card images could not be loaded for recognition.");
  }

  return Promise.all(
    crops.map(async (crop) => {
      const cropSignature = await imageSignature(crop.src);
      const candidates = cardSignatures
        .map(({ card, signature }) => ({
          cardName: card.name,
          score: Math.max(0, Math.min(1, 1 - signatureDistance(cropSignature, signature)))
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      return { cropIndex: crop.index, candidates };
    })
  );
}

async function makeCrops(src: string, source: ScreenshotSource) {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("This browser could not prepare screenshot crops.");
  }

  const crops: CropPreview[] = [];
  const cropWidth = source === "arena" ? image.width * 0.19 : image.width * 0.105;
  const cropHeight = source === "arena" ? image.height * 0.52 : image.height * 0.23;
  const startX = source === "arena" ? image.width * 0.035 : image.width * 0.075;
  const startY = source === "arena" ? image.height * 0.26 : image.height * 0.71;
  const step = source === "arena" ? image.width * 0.132 : image.width * 0.115;

  canvas.width = Math.round(cropWidth);
  canvas.height = Math.round(cropHeight);

  for (let index = 0; index < 7; index += 1) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      image,
      Math.round(startX + step * index),
      Math.round(startY),
      Math.round(cropWidth),
      Math.round(cropHeight),
      0,
      0,
      canvas.width,
      canvas.height
    );
    crops.push({ index, src: canvas.toDataURL("image/png") });
  }

  return crops;
}

export function HandAnalyzer() {
  const [workflowTab, setWorkflowTab] = useState<WorkflowTab>("deck");
  const [resultTab, setResultTab] = useState<ResultTab>("overview");
  const [decklist, setDecklist] = useState(sampleDeck);
  const [handText, setHandText] = useState(sampleHand);
  const [confirmedHand, setConfirmedHand] = useState(sampleHand.split(/\r?\n/));
  const [playDraw, setPlayDraw] = useState<PlayDraw>("play");
  const [screenshotSource, setScreenshotSource] = useState<ScreenshotSource>("mtgo");
  const [screenshotSrc, setScreenshotSrc] = useState("");
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
      const { lookups, failures } = await fetchCardData(namesForLookup);
      const recognized = await recognizeCropImages(nextCrops, lookups, options);
      setRecognitionResults(recognized);
      const nextHand = recognized.map((crop) => crop.candidates[0]?.cardName ?? "");
      if (nextHand.filter(Boolean).length === 7) {
        setConfirmedHand(nextHand);
        setHandText(nextHand.join("\n"));
        setMessage(
          failures.length
            ? `Recognition finished with ${failures.length} Scryfall lookup issue(s). Confirm the seven cards below.`
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
      const nextCrops = await makeCrops(src, screenshotSource);
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
      setResult({ ...analysis, lookupFailures: failures });
      setWorkflowTab("results");
      setResultTab("overview");
      if (failures.length) {
        setMessage(`Analysis ran, but ${failures.length} Scryfall lookup(s) need review.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not analyze this hand.");
    } finally {
      setIsBusy(false);
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
            <h2>{inferDeckName(decklist)}</h2>
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
          <label className="field-stack">
            Decklist
            <textarea
              className="analyzer-textarea deck-textarea"
              onChange={(event) => setDecklist(event.target.value)}
              spellCheck={false}
              value={decklist}
            />
          </label>
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
            <button className={screenshotSource === "mtgo" ? "is-selected" : ""} onClick={() => setScreenshotSource("mtgo")} type="button">
              Magic Online
            </button>
            <button className={screenshotSource === "arena" ? "is-selected" : ""} onClick={() => setScreenshotSource("arena")} type="button">
              MTG Arena
            </button>
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
      <section>
        <h2>Watch-outs</h2>
        <div className="watchout-panel">
          {(result.watchouts.length ? result.watchouts : ["No major structural warning from land count, card velocity, ramp, or mulligan comparison."]).map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      </section>
      <section>
        <h2>Land Drop Outlook</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Turn</th>
                <th>Natural land drop</th>
                <th>With draw/look</th>
                <th>Effective sources</th>
              </tr>
            </thead>
            <tbody>
              {result.turnProbabilities.map((row) => (
                <tr key={row.turn}>
                  <td>Turn {row.turn}</td>
                  <td>{pct(row.landDropNatural)}</td>
                  <td>{pct(row.landDropWithDraw)}</td>
                  <td>{pct(row.effectiveLandDrop)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
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
        <p>Draw/look spells are modeled as extra card depth, not perfect card selection.</p>
        <p>Ramp is flagged structurally; exact treasure/cost-reduction sequencing still needs the deeper simulation backend.</p>
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

  return (
    <div className="candidate-list">
      {result.candidates.map((candidate, index) => (
        <button
          className={index === 0 ? "is-best" : ""}
          key={`${cropIndex}-${candidate.cardName}`}
          onClick={() => onChoose(candidate.cardName)}
          type="button"
        >
          <span>{candidate.cardName}</span>
          <em>{Math.round(candidate.score * 100)}%</em>
        </button>
      ))}
    </div>
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
