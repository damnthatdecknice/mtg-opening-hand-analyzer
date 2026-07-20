"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { parseDecklist } from "@/lib/deckParser";
import type { SavedDeck } from "@/lib/decks";
import {
  metagameFormats,
  metagameWindowOptions,
  type MetagameCardCount,
  type MetagameDeck,
  type MetagameFormat,
  type MetagameResponse,
  type MetagameWindowDays
} from "@/lib/metagame";
import { supabase } from "@/lib/supabase";
import { useEntitlements } from "@/components/useEntitlements";

type SavedDeckNote = {
  deckName: string;
  format: string;
  inferredColors: string[];
  matchingArchetype?: string;
  overlappingCards: Array<{ name: string; share: number }>;
  sideboardCards: Array<{ name: string; share: number; decks: number }>;
  note: string;
};

type PerformanceDeck = {
  name: string;
  finishes: number;
  score: number;
};

function isMetagameCardCount(card: MetagameCardCount | undefined): card is MetagameCardCount {
  return Boolean(card);
}

export function MetagamePanel() {
  const entitlements = useEntitlements();
  const [format, setFormat] = useState<MetagameFormat>("Modern");
  const [windowDays, setWindowDays] = useState<MetagameWindowDays>(7);
  const [data, setData] = useState<MetagameResponse | null>(null);
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const savedDeckNotes = useMemo(
    () => (data ? buildSavedDeckNotes(savedDecks, data, format) : []),
    [data, format, savedDecks]
  );
  const performanceDecks = useMemo(() => (data ? buildPerformanceDecks(data.decks) : []), [data]);

  useEffect(() => {
    if (entitlements.canUseDeckVault) {
      void loadSavedDecks();
    }
  }, [entitlements.canUseDeckVault]);

  useEffect(() => {
    if (entitlements.canUseDeckVault) {
      void loadMetagame(format, windowDays);
    }
  }, [entitlements.canUseDeckVault, format, windowDays]);

  async function loadSavedDecks() {
    if (!supabase) {
      return;
    }

    const { data: rows } = await supabase
      .from("decks")
      .select("*")
      .eq("is_archived", false)
      .order("updated_at", { ascending: false });
    setSavedDecks((rows ?? []) as SavedDeck[]);
  }

  async function loadMetagame(nextFormat: MetagameFormat, nextWindowDays: MetagameWindowDays) {
    setIsLoading(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/metagame?format=${encodeURIComponent(nextFormat)}&windowDays=${nextWindowDays}&v=5`
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Could not load metagame data.");
      }
      setData(payload as MetagameResponse);
    } catch (error) {
      setData(null);
      setMessage(error instanceof Error ? error.message : "Could not load metagame data.");
    } finally {
      setIsLoading(false);
    }
  }

  if (!entitlements.isLoading && !entitlements.canUseDeckVault) {
    return (
      <section className="panel locked-feature-panel">
        <p className="eyebrow">Deck Pro feature</p>
        <h1>Metagame</h1>
        <p>
          Published MTGO metagame snapshots are available for Deck Pro and Beta Tester accounts.
        </p>
        <Link className="primary-button" href="/pricing">
          View tiers
        </Link>
      </section>
    );
  }

  return (
    <section className="metagame-page">
      <header className="panel dashboard-header">
        <p className="eyebrow">Recent Tournament Data</p>
        <h1>Metagame Snapshot</h1>
        <p>
          Explore the decks shaping each format, based on recent official Magic Online Challenge decklists.
        </p>
      </header>

      <section className="panel compact-panel metagame-controls">
        <label className="field-stack">
          Format
          <select
            className="card-select"
            onChange={(event) => setFormat(event.target.value as MetagameFormat)}
            value={format}
          >
            {metagameFormats.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="field-stack">
          Window
          <select
            className="card-select"
            onChange={(event) => setWindowDays(Number(event.target.value) as MetagameWindowDays)}
            value={windowDays}
          >
            {metagameWindowOptions.map((item) => (
              <option key={item} value={item}>
                Last {item} days
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          disabled={isLoading}
          onClick={() => loadMetagame(format, windowDays)}
          type="button"
        >
          {isLoading ? "Refreshing..." : "Refresh"}
        </button>
      </section>

      {message ? <p className="form-message">{message}</p> : null}

      {data ? (
        <>
          <div className="dashboard-metrics">
            <div className="metric-card">
              <span>Published decks</span>
              <strong>{data.deckCount}</strong>
            </div>
            <div className="metric-card">
              <span>MTGO events</span>
              <strong>{data.eventCount}</strong>
            </div>
            <div className="metric-card">
              <span>Window</span>
              <strong>{data.windowDays} days</strong>
            </div>
          </div>

          <section className="metagame-grid">
            <article className="panel compact-panel">
              <div className="section-heading split-heading">
                <div>
                  <p className="eyebrow">Archetype share</p>
                  <h2>{format} snapshot</h2>
                </div>
                <span className="muted-copy">{data.source}</span>
              </div>
              <div className="meta-bars">
                {data.archetypes.slice(0, 12).map((archetype) => (
                  <div className="meta-bar-row" key={archetype.name}>
                    <span>{archetype.name}</span>
                    <i style={{ width: `${Math.max(4, Math.min(100, archetype.share * 200))}%` }} />
                    <em>
                      {Math.round(archetype.share * 100)}% ({archetype.decks})
                      <small className={getTrendClass(archetype.change)}>{formatTrendLabel(archetype.change)}</small>
                    </em>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel compact-panel">
              <div className="performance-heading">
                <strong>Opening Edge</strong>
                <h2>Proprietary Performance Rating</h2>
              </div>
              <p className="muted-copy">
                Separate from metagame share. This highlights which archetypes are converting
                Challenge appearances from the last {data.windowDays} days into stronger results.
              </p>
              <div className="list-stack">
                {performanceDecks.length ? (
                  performanceDecks.slice(0, 8).map((deck) => (
                    <div className="list-row" key={deck.name}>
                      <div>
                        <strong>{deck.name}</strong>
                        <span>
                          {deck.finishes} finish{deck.finishes === 1 ? "" : "es"} tracked
                        </span>
                      </div>
                      <em>{deck.score.toFixed(2)}</em>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <strong>No ranked finishes found yet</strong>
                    <span>When MTGO publishes standings, this box highlights stronger finishes.</span>
                  </div>
                )}
              </div>
            </article>
          </section>

          <section className="metagame-grid">
            <article className="panel compact-panel">
              <p className="eyebrow">Most common maindeck cards</p>
              <h2>Cards To Expect</h2>
              <div className="list-stack">
                {data.topCards.slice(0, 12).map((card) => (
                  <div className="list-row" key={card.name}>
                    <div>
                      <strong>{card.name}</strong>
                      <span>{card.count} copies across published lists</span>
                    </div>
                    <em>{Math.round(card.share * 100)}%</em>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel compact-panel">
              <p className="eyebrow">Your saved decks</p>
              <h2>Suggested Sideboard Cards</h2>
              <div className="list-stack">
                {savedDeckNotes.length ? (
                  savedDeckNotes.map((note) => (
                    <div className="empty-state" key={note.deckName}>
                      <strong>{note.deckName}</strong>
                      {note.sideboardCards.length ? (
                        <div className="suggestion-chip-row" aria-label={`Sideboard suggestions for ${note.deckName}`}>
                          {note.sideboardCards
                            .slice(0, 6)
                            .map((card) => (
                              <span className="suggestion-chip" key={card.name}>
                                <span>{card.name}</span>
                              </span>
                            ))}
                        </div>
                      ) : (
                        <span>No sideboard suggestions found from published in-color lists yet.</span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <strong>No saved {format} decks yet</strong>
                    <span>Save a deck in this format to see a first-pass meta comparison.</span>
                  </div>
                )}
              </div>
            </article>
          </section>

          <section className="panel compact-panel">
            <p className="eyebrow">Source events</p>
            <h2>Official MTGO Decklists</h2>
            <div className="list-stack">
              {data.events.map((event) => (
                <a className="list-row clickable-list-row" href={event.url} key={event.url} rel="noopener" target="_blank">
                  <div>
                    <strong>{event.name}</strong>
                    <span>{new Date(event.date).toLocaleString()}</span>
                  </div>
                  <em>{event.deckCount} decks</em>
                </a>
              ))}
            </div>
            {data.warnings.length ? (
              <p className="muted-copy">Some MTGO pages could not be parsed: {data.warnings.slice(0, 2).join("; ")}</p>
            ) : null}
          </section>
        </>
      ) : (
        <section className="panel compact-panel">
          <p className="eyebrow">{isLoading ? "Loading" : "No data"}</p>
          <h2>{isLoading ? "Building metagame snapshot" : "No published events found"}</h2>
          <p className="muted-copy">
            The snapshot uses only official MTGO event decklists published in the selected window.
          </p>
        </section>
      )}
    </section>
  );
}

function formatTrend(change: number) {
  const percentagePoints = Math.round(change * 100);
  if (percentagePoints > 0) {
    return `▲ ${percentagePoints}%`;
  }
  if (percentagePoints < 0) {
    return `▼ ${Math.abs(percentagePoints)}%`;
  }
  return "▬ 0%";
}

function getTrendClass(change: number) {
  if (change > 0.004) {
    return "trend-up";
  }
  if (change < -0.004) {
    return "trend-down";
  }
  return "trend-flat";
}

function formatTrendLabel(change: number) {
  const percentagePoints = Math.round(change * 100);
  if (percentagePoints > 0) {
    return `up ${percentagePoints}%`;
  }
  if (percentagePoints < 0) {
    return `down ${Math.abs(percentagePoints)}%`;
  }
  return "flat 0%";
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

function buildSavedDeckNotes(
  savedDecks: SavedDeck[],
  data: MetagameResponse,
  format: MetagameFormat
): SavedDeckNote[] {
  const topCardMap = new Map(data.topCards.map((card) => [card.name.toLowerCase(), card]));
  return savedDecks
    .filter((deck) => !deck.format || deck.format.toLowerCase() === format.toLowerCase())
    .slice(0, 4)
    .map((deck) => {
      const parsed = parseDecklist(deck.decklist);
      const deckCards = new Set(parsed.cards.filter((card) => card.section === "main").map((card) => card.name));
      const allSavedCards = new Set(parsed.cards.map((card) => card.name));
      const similarDecks = findSimilarPublishedDecks(deckCards, data.decks);
      const inferredColors = inferSavedDeckColors(similarDecks);
      const matchingArchetype = similarDecks[0]?.deck.archetype;
      const inColorDecks = data.decks.filter((publishedDeck) => isDeckInColors(publishedDeck, inferredColors));
      const similarInColorDecks = similarDecks
        .map((match) => match.deck)
        .filter((publishedDeck) => isDeckInColors(publishedDeck, inferredColors));
      const sideboardSourceDecks = similarInColorDecks.length ? similarInColorDecks : inColorDecks;
      const sideboardCards = buildSideboardSuggestions(sideboardSourceDecks, allSavedCards, inferredColors);
      const overlappingCards = Array.from(deckCards)
        .map((card) => topCardMap.get(card.toLowerCase()))
        .filter(isMetagameCardCount)
        .sort((a, b) => b.share - a.share)
        .map((card) => ({ name: card.name, share: card.share }));
      const note =
        similarDecks.length >= 3
          ? "This looks close enough to published lists that the sideboard cards below are worth actively testing."
          : overlappingCards.length
            ? "This has partial metagame overlap. Use the sideboard cards below as a scouting list, not an automatic import."
            : "This looks fairly rogue against the current MTGO snapshot. Sideboard advice is limited to cards from lists matching the inferred color lens.";

      return {
        deckName: deck.name,
        format: deck.format ?? format,
        inferredColors,
        matchingArchetype,
        overlappingCards,
        sideboardCards,
        note
      };
    });
}

function findSimilarPublishedDecks(deckCards: Set<string>, publishedDecks: MetagameDeck[]) {
  const normalizedSavedCards = new Set(Array.from(deckCards).map((card) => card.toLowerCase()));
  return publishedDecks
    .map((deck) => {
      const shared = deck.main.filter((card) => normalizedSavedCards.has(card.name.toLowerCase())).length;
      return { deck, shared };
    })
    .filter((match) => match.shared >= 3)
    .sort((a, b) => b.shared - a.shared || a.deck.archetype.localeCompare(b.deck.archetype))
    .slice(0, 12);
}

function inferSavedDeckColors(similarDecks: Array<{ deck: MetagameDeck; shared: number }>) {
  if (!similarDecks.length) {
    return [];
  }

  const bestScore = similarDecks[0]?.shared ?? 0;
  const closeMatches = similarDecks.filter((match) => match.shared >= Math.max(3, bestScore - 1));
  const colors = new Set<string>();
  for (const match of closeMatches) {
    for (const color of match.deck.colors) {
      colors.add(color);
    }
  }

  return Array.from(colors).sort((a, b) => "WUBRG".indexOf(a) - "WUBRG".indexOf(b));
}

function isDeckInColors(deck: MetagameDeck, colors: string[]) {
  if (!deck.colors.length) {
    return true;
  }
  if (!colors.length) {
    return false;
  }
  return deck.colors.every((color) => colors.includes(color));
}

function buildSideboardSuggestions(decks: MetagameDeck[], savedCards: Set<string>, colors: string[]) {
  const copies = new Map<string, number>();
  const deckPresence = new Map<string, number>();
  const normalizedSavedCards = new Set(Array.from(savedCards).map((card) => card.toLowerCase()));

  for (const deck of decks) {
    const seen = new Set<string>();
    for (const card of deck.sideboard) {
      if (normalizedSavedCards.has(card.name.toLowerCase()) || !isCardInColors(card, colors)) {
        continue;
      }
      copies.set(card.name, (copies.get(card.name) ?? 0) + card.qty);
      seen.add(card.name);
    }
    for (const card of Array.from(seen)) {
      deckPresence.set(card, (deckPresence.get(card) ?? 0) + 1);
    }
  }

  return Array.from(copies.entries())
    .map(([name, count]) => {
      const decksWithCard = deckPresence.get(name) ?? 0;
      return {
        name,
        decks: decksWithCard,
        share: decks.length ? decksWithCard / decks.length : 0,
        count
      };
    })
    .sort((a, b) => b.decks - a.decks || b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 8);
}

function isCardInColors(card: { colors?: string[] }, colors: string[]) {
  const cardColors = card.colors ?? [];
  if (!cardColors.length) {
    return true;
  }
  if (!colors.length) {
    return false;
  }
  return cardColors.every((color) => colors.includes(color));
}
