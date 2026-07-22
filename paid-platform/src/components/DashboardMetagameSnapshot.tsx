"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MetagameDeck, MetagameResponse } from "@/lib/metagame";

type SnapshotState = {
  data: MetagameResponse | null;
  error: string;
  isLoading: boolean;
};

type PerformanceDeck = {
  name: string;
  finishes: number;
  score: number;
};

export function DashboardMetagameSnapshot() {
  const [state, setState] = useState<SnapshotState>({
    data: null,
    error: "",
    isLoading: true
  });

  useEffect(() => {
    async function loadModernSnapshot() {
      try {
        const response = await fetch("/api/metagame?format=Modern&windowDays=7&v=5", {
          cache: "no-store"
        });
        if (!response.ok) {
          throw new Error("Could not load Modern metagame.");
        }
        const data = (await response.json()) as MetagameResponse;
        setState({ data, error: "", isLoading: false });
      } catch (error) {
        setState({
          data: null,
          error: error instanceof Error ? error.message : "Could not load Modern metagame.",
          isLoading: false
        });
      }
    }

    void loadModernSnapshot();
  }, []);

  const highestPpr = state.data ? buildPerformanceDecks(state.data.decks)[0] : undefined;

  return (
    <section className="panel dashboard-meta-snapshot">
      <div className="section-heading split-heading">
        <div>
          <p className="eyebrow">Modern Metagame</p>
          <h2>7-Day Snapshot</h2>
        </div>
        <Link className="text-button" href="/metagame">
          Open
        </Link>
      </div>

      {state.isLoading ? (
        <div className="empty-state">
          <strong>Loading Modern data...</strong>
          <span>Pulling the latest cached Challenge snapshot.</span>
        </div>
      ) : state.error ? (
        <div className="empty-state">
          <strong>Snapshot unavailable</strong>
          <span>{state.error}</span>
        </div>
      ) : state.data ? (
        <>
          <div className="snapshot-callout">
            <span>Highest PPR</span>
            <strong>
              {highestPpr ? `${highestPpr.name} ${formatPpr(highestPpr.score)}` : "No ranked finishes yet"}
            </strong>
            <em>Highest Proprietary Performance Rating over the past 7 days in Modern</em>
          </div>
          <div className="mini-meta-bars">
            {state.data.archetypes.slice(0, 5).map((archetype) => (
              <div className="mini-meta-row" key={archetype.name}>
                <span>{archetype.name}</span>
                <i style={{ width: `${Math.max(8, Math.min(100, archetype.share * 200))}%` }} />
                <em>{Math.round(archetype.share * 100)}%</em>
              </div>
            ))}
          </div>
          <p className="muted-copy">
            {state.data.deckCount} decks across {state.data.eventCount} MTGO Challenge event
            {state.data.eventCount === 1 ? "" : "s"}.
          </p>
        </>
      ) : null}
    </section>
  );
}

function formatPpr(score: number) {
  const delta = score - 100;
  return `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`;
}

function buildPerformanceDecks(decks: MetagameDeck[]): PerformanceDeck[] {
  const scores = new Map<string, { deckCount: number; finishes: number; score: number }>();

  for (const deck of decks) {
    const current = scores.get(deck.archetype) ?? { deckCount: 0, finishes: 0, score: 0 };
    scores.set(deck.archetype, {
      ...current,
      deckCount: current.deckCount + 1
    });
  }

  for (const deck of decks) {
    if (!deck.rank || deck.rank < 1) {
      continue;
    }

    const finishScore = Math.max(1, 33 - deck.rank);
    const current = scores.get(deck.archetype) ?? { deckCount: 0, finishes: 0, score: 0 };
    scores.set(deck.archetype, {
      ...current,
      finishes: current.finishes + 1,
      score: current.score + finishScore
    });
  }

  const totalScore = Array.from(scores.values()).reduce((sum, value) => sum + value.score, 0);
  const totalDecks = decks.length;

  return Array.from(scores.entries())
    .filter(([, value]) => value.finishes > 0 && totalScore > 0 && totalDecks > 0)
    .map(([name, value]) => ({
      name,
      finishes: value.finishes,
      score: buildOverperformanceRating(value.score, value.deckCount, value.finishes, totalScore, totalDecks)
    }))
    .sort((a, b) => b.score - a.score || b.finishes - a.finishes || a.name.localeCompare(b.name));
}

function buildOverperformanceRating(
  score: number,
  deckCount: number,
  finishes: number,
  totalScore: number,
  totalDecks: number
) {
  const resultShare = score / totalScore;
  const populationShare = deckCount / totalDecks;
  const sampleConfidence = finishes / (finishes + 4);
  return Math.max(1, 100 + (resultShare - populationShare) * 220 * sampleConfidence);
}
