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
  tuning: DeckTuningRecommendation | null;
  note: string;
};

type DeckTuningRecommendation = {
  shellName: string;
  cardsOff: number;
  sourceDecks: number;
  cardGaps: Array<{ name: string; expected: number; current: number; presence: number }>;
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
                  performanceDecks.slice(0, 8).map((deck) => {
                    const signal = getPerformanceSignal(deck.score);
                    return (
                      <div className="list-row performance-row" key={deck.name}>
                        <div>
                          <strong>{deck.name}</strong>
                          <span>
                            {deck.finishes} ranked finish{deck.finishes === 1 ? "" : "es"}
                          </span>
                        </div>
                        <span className={`performance-signal ${signal.className}`}>
                          <small>{signal.label}</small>
                          <strong>{signal.value}</strong>
                        </span>
                      </div>
                    );
                  })
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
            <p className="eyebrow">Your saved decks</p>
            <h2>Deck Tuning Recommendations</h2>
            <div className="list-stack">
              {savedDeckNotes.length ? (
                savedDeckNotes.map((note) => (
                  <div className="deck-tuning-card" key={`tuning-${note.deckName}`}>
                    <div className="deck-tuning-summary">
                      <div>
                        <strong>{note.deckName}</strong>
                        {note.tuning ? (
                          <span>
                            Compared to recent {note.tuning.shellName} Challenge shells.
                          </span>
                        ) : (
                          <span>No close Challenge stock shell found yet.</span>
                        )}
                      </div>
                      {note.tuning ? (
                        <em>{note.tuning.cardsOff} card{note.tuning.cardsOff === 1 ? "" : "s"} off</em>
                      ) : null}
                    </div>
                    {note.tuning?.cardGaps.length ? (
                      <div className="tuning-gap-list">
                        {note.tuning.cardGaps.slice(0, 4).map((gap) => (
                          <span key={gap.name}>
                            Most lists play <strong>{gap.expected} {gap.name}</strong>; you have{" "}
                            <strong>{gap.current}</strong>.
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="muted-copy">
                        This saved list is either already close to the current shell or needs more matching
                        published decks before Opening Edge can make a clean recommendation.
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <strong>No saved {format} decks yet</strong>
                  <span>Save a deck in this format to compare it against recent Challenge shells.</span>
                </div>
              )}
            </div>
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

function getPerformanceSignal(score: number) {
  const delta = score - 100;
  const value = `${delta > 0 ? "+" : ""}${delta.toFixed(2)}`;

  if (delta >= 5) {
    return { label: "Surging", value, className: "signal-up" };
  }
  if (delta >= 1) {
    return { label: "Positive", value, className: "signal-up" };
  }
  if (delta <= -5) {
    return { label: "Fading", value, className: "signal-down" };
  }
  if (delta <= -1) {
    return { label: "Soft", value, className: "signal-down" };
  }
  return { label: "Neutral", value, className: "signal-flat" };
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
      const mainDeckCards = parsed.cards.filter((card) => card.section === "main");
      const deckCards = new Set(mainDeckCards.map((card) => card.name));
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
      const tuning = buildDeckTuningRecommendation(deck.name, mainDeckCards, similarDecks);
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
        tuning,
        note
      };
    });
}

function buildDeckTuningRecommendation(
  deckName: string,
  savedDeckCards: Array<{ name: string; qty: number }>,
  similarDecks: Array<{ deck: MetagameDeck; shared: number }>
): DeckTuningRecommendation | null {
  const bestShared = similarDecks[0]?.shared ?? 0;
  const stockDecks = similarDecks
    .filter((match) => match.shared >= Math.max(5, bestShared - 2))
    .sort((a, b) => (a.deck.rank ?? 999) - (b.deck.rank ?? 999) || b.shared - a.shared)
    .slice(0, 8)
    .map((match) => match.deck);

  if (stockDecks.length < 2) {
    return null;
  }

  const savedCounts = countCardRows(savedDeckCards);
  const cardStats = new Map<string, { copies: number; decks: number }>();

  for (const stockDeck of stockDecks) {
    const seen = new Set<string>();
    for (const card of stockDeck.main) {
      const current = cardStats.get(card.name) ?? { copies: 0, decks: 0 };
      cardStats.set(card.name, { ...current, copies: current.copies + card.qty });
      seen.add(card.name);
    }
    for (const name of Array.from(seen)) {
      const current = cardStats.get(name);
      if (current) {
        cardStats.set(name, { ...current, decks: current.decks + 1 });
      }
    }
  }

  const stockCounts = new Map<string, number>();
  const gaps: DeckTuningRecommendation["cardGaps"] = [];

  for (const [name, stats] of Array.from(cardStats.entries())) {
    const presence = stats.decks / stockDecks.length;
    if (presence < 0.45) {
      continue;
    }
    const expected = Math.max(1, Math.round(stats.copies / stockDecks.length));
    const current = savedCounts.get(name) ?? 0;
    stockCounts.set(name, expected);
    if (expected > current) {
      gaps.push({ name, expected, current, presence });
    }
  }

  let cardsOff = 0;
  for (const [name, expected] of Array.from(stockCounts.entries())) {
    cardsOff += Math.abs(expected - (savedCounts.get(name) ?? 0));
  }
  for (const [name, current] of Array.from(savedCounts.entries())) {
    if (!stockCounts.has(name)) {
      cardsOff += current;
    }
  }
  cardsOff = Math.round(cardsOff / 2);

  return {
    shellName: chooseStockShellName(deckName, stockDecks),
    cardsOff,
    sourceDecks: stockDecks.length,
    cardGaps: gaps
      .sort((a, b) => b.expected - b.current - (a.expected - a.current) || b.presence - a.presence || a.name.localeCompare(b.name))
      .slice(0, 6)
  };
}

function countCardRows(cards: Array<{ name: string; qty: number }>) {
  const counts = new Map<string, number>();
  for (const card of cards) {
    counts.set(card.name, (counts.get(card.name) ?? 0) + card.qty);
  }
  return counts;
}

function chooseStockShellName(deckName: string, stockDecks: MetagameDeck[]) {
  const archetypeCounts = new Map<string, number>();
  for (const deck of stockDecks) {
    archetypeCounts.set(deck.archetype, (archetypeCounts.get(deck.archetype) ?? 0) + 1);
  }
  return (
    Array.from(archetypeCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ??
    deckName
  );
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
