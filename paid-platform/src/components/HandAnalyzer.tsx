"use client";

import { useMemo, useState } from "react";
import { analyzeOpeningHand, fetchCardData, type AnalyzerResult, type PlayDraw } from "@/lib/analyzer";
import { inferDeckName, parseDecklist } from "@/lib/deckParser";

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

export function HandAnalyzer() {
  const [decklist, setDecklist] = useState(sampleDeck);
  const [handText, setHandText] = useState(sampleHand);
  const [playDraw, setPlayDraw] = useState<PlayDraw>("play");
  const [result, setResult] = useState<AnalyzerResult | null>(null);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const parsed = useMemo(() => parseDecklist(decklist), [decklist]);
  const hand = useMemo(
    () => handText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
    [handText]
  );

  async function runAnalysis() {
    setMessage("");
    setResult(null);

    if (parsed.mainCount === 0) {
      setMessage("Paste a main deck before analyzing.");
      return;
    }
    if (hand.length !== 7) {
      setMessage("Paste exactly seven opening-hand cards, one per line.");
      return;
    }

    setIsBusy(true);
    try {
      const mainNames = parsed.cards
        .filter((card) => card.section === "main")
        .map((card) => card.name);
      const { lookups, failures } = await fetchCardData(mainNames);
      const analysis = analyzeOpeningHand(decklist, hand, lookups, playDraw);
      setResult({ ...analysis, lookupFailures: failures });
      if (failures.length) {
        setMessage(`Analysis ran, but ${failures.length} Scryfall lookup(s) need review.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not analyze this hand.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="analyzer-page">
      <header className="panel dashboard-header">
        <p className="eyebrow">Opening hand analyzer</p>
        <h1>Analyze a Seven</h1>
        <p>
          Paste a deck and a confirmed opening hand. The paid app now runs real
          land-drop math using Scryfall card data.
        </p>
      </header>

      <div className="analyzer-grid">
        <section className="panel analyzer-input-panel">
          <div className="section-heading">
            <p className="eyebrow">Deck</p>
            <h2>{inferDeckName(decklist)}</h2>
            <p>{parsed.mainCount} main-deck cards detected.</p>
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

        <section className="panel analyzer-input-panel">
          <div className="section-heading">
            <p className="eyebrow">Hand</p>
            <h2>Confirmed seven</h2>
            <p>One card per line. Screenshot recognition comes next.</p>
          </div>
          <label className="field-stack">
            Opening hand
            <textarea
              className="analyzer-textarea hand-textarea"
              onChange={(event) => setHandText(event.target.value)}
              spellCheck={false}
              value={handText}
            />
          </label>
          <div className="segmented-control" aria-label="Play or draw">
            <button
              className={playDraw === "play" ? "is-selected" : ""}
              onClick={() => setPlayDraw("play")}
              type="button"
            >
              On the play
            </button>
            <button
              className={playDraw === "draw" ? "is-selected" : ""}
              onClick={() => setPlayDraw("draw")}
              type="button"
            >
              On the draw
            </button>
          </div>
          <button className="primary-button" disabled={isBusy} onClick={runAnalysis} type="button">
            {isBusy ? "Checking cards..." : "Analyze hand"}
          </button>
          {message ? <p className="form-message">{message}</p> : null}
        </section>
      </div>

      {result ? (
        <section className="panel analyzer-results">
          <div className="section-heading">
            <p className="eyebrow">Result</p>
            <h2>{result.handTextureLabel}</h2>
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
              <span>Lands left</span>
              <strong>{result.landsRemaining}</strong>
            </div>
            <div className="metric-card">
              <span>Avg nonland MV</span>
              <strong>{result.averageManaValue.toFixed(1)}</strong>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Turn</th>
                  <th>Natural draws</th>
                  <th>Next land chance</th>
                  <th>Land drop chance</th>
                </tr>
              </thead>
              <tbody>
                {result.turnProbabilities.map((row) => (
                  <tr key={row.turn}>
                    <td>Turn {row.turn}</td>
                    <td>{row.naturalDraws}</td>
                    <td>{pct(row.nextLand)}</td>
                    <td>{pct(row.landDrop)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.missingCards.length || result.lookupFailures.length || result.notes.length ? (
            <div className="analysis-notes">
              {result.missingCards.length ? (
                <p>Cards not found in the main deck: {result.missingCards.join(", ")}</p>
              ) : null}
              {result.lookupFailures.length ? (
                <p>Scryfall lookup failures: {result.lookupFailures.join(", ")}</p>
              ) : null}
              {result.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
