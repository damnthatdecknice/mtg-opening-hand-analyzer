"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { saveAuthFallback } from "@/lib/authFallback";
import { supabase } from "@/lib/supabase";
import type {
  PublicTrainerHand,
  TrainerAnswer,
  TrainerDeckOption,
  TrainerReveal,
  TrainerStats
} from "@/lib/keepTrainer";

type TrainerPayload = {
  signedIn: boolean;
  decks: TrainerDeckOption[];
  selectedDeckId?: string;
  stats: TrainerStats;
  currentHand: PublicTrainerHand | null;
  error?: string;
};

const emptyStats: TrainerStats = {
  attempts: 0,
  correct: 0,
  accuracy: 0,
  currentStreak: 0,
  longestStreak: 0,
  rating: 1000,
  recentResults: []
};

function answerLabel(answer: TrainerAnswer) {
  return answer === "keep" ? "Keep" : "Mulligan";
}

export function KeepTrainer() {
  const [decks, setDecks] = useState<TrainerDeckOption[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [currentHand, setCurrentHand] = useState<PublicTrainerHand | null>(null);
  const [stats, setStats] = useState<TrainerStats>(emptyStats);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isDealing, setIsDealing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const getAccessToken = useCallback(async (forceRefresh = false) => {
    if (!supabase) {
      return "";
    }

    if (!forceRefresh) {
      const sessionResponse = await supabase.auth.getSession();
      if (sessionResponse.data.session?.access_token) {
        saveAuthFallback(sessionResponse.data.session);
        return sessionResponse.data.session.access_token;
      }
    }

    const refreshResponse = await supabase.auth.refreshSession();
    saveAuthFallback(refreshResponse.data.session);
    return refreshResponse.data.session?.access_token ?? "";
  }, []);

  const reveal = currentHand?.reveal;
  const accuracy = stats.attempts ? Math.round(stats.accuracy * 100) : 0;
  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId) ?? decks[0];

  const handRows = useMemo(() => {
    const counts = new Map<string, number>();
    return (currentHand?.hand ?? []).map((cardName) => {
      const next = (counts.get(cardName) ?? 0) + 1;
      counts.set(cardName, next);
      return { cardName, copyNumber: next, duplicate: next > 1 };
    });
  }, [currentHand?.hand]);

  const nextRequest = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    requestIdRef.current += 1;
    return { controller, requestId: requestIdRef.current };
  }, []);

  const authorizedFetch = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await getAccessToken();
    if (!token) {
      throw new Error("Sign in to use the Keep Trainer.");
    }
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(path, {
      ...init,
      headers,
      cache: "no-store"
    });

    if (response.status !== 401) {
      return response;
    }

    const refreshedToken = await getAccessToken(true);
    if (!refreshedToken || refreshedToken === token) {
      return response;
    }

    headers.set("Authorization", `Bearer ${refreshedToken}`);
    return fetch(path, {
      ...init,
      headers,
      cache: "no-store"
    });
  }, [getAccessToken]);

  const loadTrainer = useCallback(async () => {
    const { controller, requestId } = nextRequest();
    setIsLoading(true);
    setMessage("");

    try {
      const response = await authorizedFetch("/api/trainer/hands", { signal: controller.signal });
      const data = (await response.json()) as TrainerPayload | { error?: string };
      if (!response.ok) {
        throw new Error((data as { error?: string }).error ?? "Could not load Keep Trainer.");
      }
      if (requestId !== requestIdRef.current) {
        return;
      }
      const payload = data as TrainerPayload;
      setDecks(payload.decks ?? []);
      setSelectedDeckId(payload.selectedDeckId ?? payload.decks?.[0]?.id ?? "");
      setStats(payload.stats ?? emptyStats);
      setCurrentHand(null);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setMessage(error instanceof Error ? error.message : "Could not load Keep Trainer.");
      setCurrentHand(null);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [authorizedFetch, nextRequest]);

  const dealHand = useCallback(async (deckId = selectedDeckId) => {
    if (!deckId) {
      setMessage("Save a deck before dealing a trainer hand.");
      return;
    }
    const { controller, requestId } = nextRequest();
    setIsDealing(true);
    setMessage("");
    setCurrentHand(null);

    try {
      const response = await authorizedFetch("/api/trainer/hands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deckId }),
        signal: controller.signal
      });
      const data = (await response.json()) as { currentHand?: PublicTrainerHand; stats?: TrainerStats; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not deal a trainer hand.");
      }
      if (requestId !== requestIdRef.current) {
        return;
      }
      setCurrentHand(data.currentHand ?? null);
      setStats(data.stats ?? stats);
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setMessage(error instanceof Error ? error.message : "Could not deal a trainer hand.");
    } finally {
      if (requestId === requestIdRef.current) {
        setIsDealing(false);
      }
    }
  }, [authorizedFetch, nextRequest, selectedDeckId, stats]);

  async function submitAnswer(answer: TrainerAnswer) {
    if (!currentHand) {
      return;
    }
    setIsSubmitting(true);
    setMessage("");
    try {
      const response = await authorizedFetch(`/api/trainer/hands/${encodeURIComponent(currentHand.id)}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer })
      });
      const data = (await response.json()) as {
        reveal?: TrainerReveal;
        currentHand?: PublicTrainerHand;
        stats?: TrainerStats;
        error?: string;
      };
      if (!response.ok && response.status !== 409) {
        throw new Error(data.error ?? "Could not score this trainer hand.");
      }
      if (data.currentHand) {
        setCurrentHand(data.currentHand);
      } else if (data.reveal) {
        setCurrentHand({
          ...currentHand,
          completed: true,
          selectedAnswer: answer,
          reveal: data.reveal
        });
      }
      if (data.stats) {
        setStats(data.stats);
      }
      if (data.error) {
        setMessage(data.error);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not score this trainer hand.");
    } finally {
      setIsSubmitting(false);
    }
  }

  useEffect(() => {
    void loadTrainer();

    const { data } = supabase?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void loadTrainer();
      }
    }) ?? { data: null };

    return () => {
      abortRef.current?.abort();
      data?.subscription.unsubscribe();
    };
  }, [loadTrainer]);

  if (isLoading) {
    return (
      <section className="panel puzzle-shell">
        <p className="muted">Loading Keep Trainer...</p>
      </section>
    );
  }

  if (!decks.length) {
    const needsSignIn = message.toLowerCase().includes("sign in");
    const blockingError = message && !needsSignIn && !message.toLowerCase().includes("save a deck");
    const headline = needsSignIn ? "Sign in to train" : "Add your first deck";
    const helperText = needsSignIn
      ? "Sign in to practice keep-or-mulligan decisions with your saved decks."
      : "Import your .dek file to practice hands from the deck you are actually playing.";

    return (
      <section className="panel puzzle-shell trainer-start-shell">
        <p className="eyebrow">Keep Trainer</p>
        <h1>{headline}</h1>
        <p>{blockingError ? message : helperText}</p>
        <div className="action-row">
          <Link className="primary-button" href={needsSignIn ? "/login" : "/decks"}>
            {needsSignIn ? "Sign in" : "Import your .dek"}
          </Link>
          <Link className="secondary-button" href="/how-to">
            How To
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="puzzle-page trainer-page">
      <header className="hero-panel puzzle-hero">
        <p className="eyebrow">Keep Trainer</p>
        <h1>Practice Real Openers</h1>
        <p className="lede">
          Choose a saved deck, deal a random seven immediately, then make the keep-or-mulligan call before Opening Edge reveals the score.
        </p>
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
        <div className="metric-card">
          <span>Current streak</span>
          <strong>{stats.currentStreak}</strong>
        </div>
      </div>

      <section className="panel puzzle-shell">
        <div className="section-heading">
          <p>Deck Trainer</p>
          <h2>{selectedDeck ? selectedDeck.name : "Saved deck"}</h2>
        </div>
        <div className="puzzle-deck-picker">
          <label htmlFor="trainer-deck">Practice deck - newest deck is selected first</label>
          <select
            id="trainer-deck"
            disabled={isDealing || isSubmitting}
            onChange={(event) => {
              setSelectedDeckId(event.target.value);
              setCurrentHand(null);
              setMessage("");
            }}
            value={selectedDeckId}
          >
            {decks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name} - {deck.format} - {deck.mainCount} cards
              </option>
            ))}
          </select>
          <button
            className="primary-button"
            disabled={isDealing || isSubmitting || !selectedDeckId}
            onClick={() => void dealHand(selectedDeckId)}
            type="button"
          >
            {isDealing ? "Dealing..." : currentHand ? "Deal another hand" : "Deal a hand"}
          </button>
        </div>

        {!currentHand ? (
          <div className="trainer-empty-state">
            <h3>Ready when you are.</h3>
            <p>Deal a hand to practice the keep decision. Analysis runs after your answer so the hand appears fast.</p>
          </div>
        ) : (
          <>
            <div className="puzzle-context-row">
              <span>{currentHand.playDraw === "play" ? "On the play" : "On the draw"}</span>
              <span>{currentHand.format}</span>
              <span>{currentHand.deckName}</span>
            </div>

            <div className="puzzle-card-row" aria-label="Trainer opening hand">
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
                onClick={() => void submitAnswer("keep")}
                type="button"
              >
                {isSubmitting ? "Scoring..." : "Keep"}
              </button>
              <button
                className="secondary-button"
                disabled={isSubmitting || Boolean(reveal)}
                onClick={() => void submitAnswer("mulligan")}
                type="button"
              >
                {isSubmitting ? "Scoring..." : "Mulligan"}
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
                <button
                  className="primary-button"
                  disabled={isDealing}
                  onClick={() => void dealHand(selectedDeckId)}
                  type="button"
                >
                  {isDealing ? "Dealing..." : "Next hand"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {stats.recentResults.length ? (
        <section className="panel puzzle-shell trainer-results-shell">
          <div className="section-heading">
            <p>Recent Results</p>
            <h2>Trainer Log</h2>
          </div>
          <div className="puzzle-archive">
            {stats.recentResults.map((entry, index) => (
              <span className={entry.correct ? "tag tag-good" : "tag tag-bad"} key={`${entry.attemptedAt}-${index}`}>
                {entry.correct ? "correct" : "missed"}
              </span>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
