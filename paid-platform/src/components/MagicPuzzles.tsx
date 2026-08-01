"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type {
  MagicPuzzleAnswer,
  MagicPuzzleDeckOption,
  MagicPuzzleReveal,
  MagicPuzzleStats,
  PublicMagicPuzzle
} from "@/lib/magicPuzzles";

type PuzzlePayload = {
  signedIn: boolean;
  preview: boolean;
  puzzle: PublicMagicPuzzle | null;
  stats: MagicPuzzleStats;
  decks?: MagicPuzzleDeckOption[];
  selectedDeckId?: string;
  archive?: Array<{ puzzleDate: string; completed: boolean; correct: boolean }>;
};

const emptyStats: MagicPuzzleStats = {
  attempts: 0,
  correct: 0,
  accuracy: 0,
  currentStreak: 0,
  longestStreak: 0,
  rating: 1000,
  recentResults: []
};

function answerLabel(answer: MagicPuzzleAnswer) {
  return answer === "keep" ? "Keep" : "Mulligan";
}

export function MagicPuzzles() {
  const [payload, setPayload] = useState<PuzzlePayload | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedDeckId, setSelectedDeckId] = useState("");

  const reveal = payload?.puzzle?.reveal;
  const stats = payload?.stats ?? emptyStats;
  const puzzle = payload?.puzzle;
  const accuracy = stats.attempts ? Math.round(stats.accuracy * 100) : 0;

  const handRows = useMemo(() => {
    const counts = new Map<string, number>();
    return (puzzle?.hand ?? []).map((cardName) => {
      const next = (counts.get(cardName) ?? 0) + 1;
      counts.set(cardName, next);
      return { cardName, copyNumber: next, duplicate: next > 1 };
    });
  }, [puzzle?.hand]);

  const loadPuzzle = useCallback(async (deckId = "") => {
    setIsLoading(true);
    setMessage("");
    const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : "";
    const params = deckId ? `?deckId=${encodeURIComponent(deckId)}` : "";
    const response = await fetch(`/api/puzzles${params}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: "no-store"
    });
    const data = (await response.json()) as PuzzlePayload | { error?: string };
    if (!response.ok) {
      setMessage((data as { error?: string }).error ?? "Sign in to use the Keep Trainer.");
      setPayload(null);
    } else {
      const nextPayload = data as PuzzlePayload;
      setPayload(nextPayload);
      setSelectedDeckId(nextPayload.selectedDeckId ?? nextPayload.decks?.[0]?.id ?? "");
    }
    setIsLoading(false);
  }, []);

  async function submitAnswer(answer: MagicPuzzleAnswer) {
    if (!puzzle || payload?.preview) {
      setMessage("Sign in to lock an answer and track your trainer rating.");
      return;
    }
    setIsSubmitting(true);
    setMessage("");
    const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : "";
    const response = await fetch(`/api/puzzles/${encodeURIComponent(puzzle.id)}/answer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({ answer })
    });
    const data = (await response.json()) as { reveal?: MagicPuzzleReveal; stats?: MagicPuzzleStats; error?: string };
    if (!response.ok && response.status !== 409) {
      setMessage(data.error ?? "Could not submit this puzzle answer.");
      setIsSubmitting(false);
      return;
    }
    if (data.reveal) {
      setPayload((current) =>
        current?.puzzle
          ? {
              ...current,
              puzzle: {
                ...current.puzzle,
                completed: true,
                selectedAnswer: answer,
                reveal: data.reveal
              },
              stats: data.stats ?? current.stats
            }
          : current
      );
    }
    setIsSubmitting(false);
  }

  useEffect(() => {
    void loadPuzzle();
  }, [loadPuzzle]);

  if (isLoading) {
    return (
      <section className="panel puzzle-shell">
        <p className="muted">Loading your next trainer hand...</p>
      </section>
    );
  }

  if (!puzzle) {
    return (
      <section className="panel puzzle-shell">
        <p className="eyebrow">Keep Trainer</p>
        <h1>Add a deck to start training</h1>
        <p>{message || "Save a deck first, then Opening Edge can deal random sevens from that exact list."}</p>
        <div className="action-row">
          <Link className="primary-button" href="/decks">
            Import your .dek
          </Link>
          <Link className="secondary-button" href="/login">
            Sign in
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="puzzle-page">
      <header className="hero-panel puzzle-hero">
        <p className="eyebrow">Keep Trainer</p>
        <h1>Practice Real Openers</h1>
        <p className="lede">
          Choose one of your decks, deal a fresh random seven, then build a rating from the hands you keep and mulligan.
        </p>
        {payload?.preview ? (
          <div className="action-row">
            <Link className="primary-button" href="/login">
              Sign in to play
            </Link>
            <Link className="secondary-button" href="/signup">
              Create account
            </Link>
          </div>
        ) : null}
      </header>

      {message ? <div className="status-message warning">{message}</div> : null}

      <div className="metric-grid puzzle-metrics">
        <div className="metric-card">
          <span>Trainer rating</span>
          <strong>{stats.rating}</strong>
        </div>
        <div className="metric-card">
          <span>Hands answered</span>
          <strong>{stats.attempts}</strong>
        </div>
        <div className="metric-card">
          <span>Accuracy</span>
          <strong>{accuracy}%</strong>
        </div>
      </div>

      <section className="panel puzzle-shell">
        <div className="section-heading">
          <p>Deck Trainer</p>
          <h2>
            {puzzle.format} {puzzle.archetype}
          </h2>
        </div>
        {payload?.decks?.length ? (
          <div className="puzzle-deck-picker">
            <label htmlFor="trainer-deck">Practice deck</label>
            <select
              id="trainer-deck"
              onChange={(event) => {
                setSelectedDeckId(event.target.value);
                void loadPuzzle(event.target.value);
              }}
              value={selectedDeckId}
            >
              {payload.decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name} - {deck.format} - {deck.mainCount} cards
                </option>
              ))}
            </select>
            <button
              className="secondary-button"
              disabled={isLoading || isSubmitting}
              onClick={() => loadPuzzle(selectedDeckId)}
              type="button"
            >
              Deal another hand
            </button>
          </div>
        ) : null}
        <div className="puzzle-context-row">
          <span>{puzzle.playDraw === "play" ? "On the play" : "On the draw"}</span>
          <span>{puzzle.difficulty}</span>
          <span>{puzzle.deckName}</span>
        </div>

        <div className="puzzle-card-row" aria-label="Puzzle opening hand">
          {handRows.map((card, index) => (
            <button className="puzzle-card" key={`${card.cardName}-${index}`} title={card.cardName} type="button">
              <span className="puzzle-card-index">Card {index + 1}</span>
              <strong>{card.cardName}</strong>
              {card.duplicate ? <em>copy {card.copyNumber}</em> : null}
            </button>
          ))}
        </div>

        <div className="puzzle-answer-row">
          <button
            className="primary-button"
            disabled={isSubmitting || Boolean(reveal)}
            onClick={() => submitAnswer("keep")}
            type="button"
          >
            Keep
          </button>
          <button
            className="secondary-button"
            disabled={isSubmitting || Boolean(reveal)}
            onClick={() => submitAnswer("mulligan")}
            type="button"
          >
            Mulligan
          </button>
        </div>

        {reveal ? (
          <div className={`puzzle-reveal ${reveal.correct ? "is-correct" : "is-wrong"}`}>
            <p className="eyebrow">{reveal.correct ? "Correct" : "Not quite"}</p>
            <h3>{answerLabel(reveal.correctAnswer)}</h3>
            <p>{reveal.explanation.headline}</p>
            <p>{reveal.explanation.lesson}</p>
            <div className="puzzle-explanation-grid">
              <div>
                <h4>Why</h4>
                <ul>
                  {reveal.explanation.keyFactors.map((factor) => (
                    <li key={factor}>{factor}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Watch For</h4>
                <ul>
                  {(reveal.explanation.watchFor.length ? reveal.explanation.watchFor : [reveal.explanation.risk]).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
            <button className="primary-button" onClick={() => loadPuzzle(selectedDeckId)} type="button">
              Next hand
            </button>
          </div>
        ) : null}
      </section>

      {payload?.archive?.length ? (
        <section className="panel puzzle-shell">
          <div className="section-heading">
            <p>Archive</p>
            <h2>Recent Trainer Results</h2>
          </div>
          <div className="puzzle-archive">
            {payload.archive.map((entry) => (
              <span className={entry.correct ? "tag tag-good" : "tag tag-bad"} key={entry.puzzleDate}>
                {entry.puzzleDate} {entry.correct ? "correct" : "missed"}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
