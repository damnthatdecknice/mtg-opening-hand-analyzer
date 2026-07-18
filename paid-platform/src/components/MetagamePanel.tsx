"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { parseDecklist } from "@/lib/deckParser";
import type { SavedDeck } from "@/lib/decks";
import {
  metagameFormats,
  type MetagameCardCount,
  type MetagameFormat,
  type MetagameResponse
} from "@/lib/metagame";
import { supabase } from "@/lib/supabase";
import { useEntitlements } from "@/components/useEntitlements";

type SavedDeckNote = {
  deckName: string;
  format: string;
  overlappingCards: Array<{ name: string; share: number }>;
  note: string;
};

function isMetagameCardCount(card: MetagameCardCount | undefined): card is MetagameCardCount {
  return Boolean(card);
}

export function MetagamePanel() {
  const entitlements = useEntitlements();
  const [format, setFormat] = useState<MetagameFormat>("Modern");
  const [data, setData] = useState<MetagameResponse | null>(null);
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const savedDeckNotes = useMemo(
    () => (data ? buildSavedDeckNotes(savedDecks, data, format) : []),
    [data, format, savedDecks]
  );

  useEffect(() => {
    if (entitlements.canUseDeckVault) {
      void loadSavedDecks();
    }
  }, [entitlements.canUseDeckVault]);

  useEffect(() => {
    if (entitlements.canUseDeckVault) {
      void loadMetagame(format);
    }
  }, [entitlements.canUseDeckVault, format]);

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

  async function loadMetagame(nextFormat: MetagameFormat) {
    setIsLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/metagame?format=${encodeURIComponent(nextFormat)}`);
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
        <p className="eyebrow">Published MTGO metagame</p>
        <h1>Metagame</h1>
        <p>
          Standard, Pioneer, Modern, and Legacy snapshots from official Magic Online event decklists
          published in the last 7 days.
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
        <button className="secondary-button" disabled={isLoading} onClick={() => loadMetagame(format)} type="button">
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

          <section className="panel compact-panel">
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
                  <i style={{ width: `${Math.max(4, archetype.share * 100)}%` }} />
                  <em>
                    {Math.round(archetype.share * 100)}% ({archetype.decks})
                    <small className={getTrendClass(archetype.change)}>{formatTrend(archetype.change)}</small>
                  </em>
                </div>
              ))}
            </div>
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
              <h2>Meta Notes</h2>
              <div className="list-stack">
                {savedDeckNotes.length ? (
                  savedDeckNotes.map((note) => (
                    <div className="empty-state" key={note.deckName}>
                      <strong>{note.deckName}</strong>
                      <span>{note.note}</span>
                      {note.overlappingCards.length ? (
                        <span>
                          Cards showing up in the published meta:{" "}
                          {note.overlappingCards
                            .slice(0, 5)
                            .map((card) => `${card.name} (${Math.round(card.share * 100)}%)`)
                            .join(", ")}
                        </span>
                      ) : null}
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
            The snapshot uses only official MTGO event decklists published in the last 7 days.
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
      const overlappingCards = Array.from(deckCards)
        .map((card) => topCardMap.get(card.toLowerCase()))
        .filter(isMetagameCardCount)
        .sort((a, b) => b.share - a.share)
        .map((card) => ({ name: card.name, share: card.share }));
      const note =
        overlappingCards.length >= 5
          ? "This saved deck shares a meaningful number of cards with the published field. Its core cards are likely relevant in current prep."
          : overlappingCards.length
            ? "This saved deck has some cards appearing in the published field, but the overlap is modest. Treat this as a light signal."
            : "This saved deck has low overlap with the most common published cards. That may mean rogue positioning or that its cards are underrepresented this week.";

      return {
        deckName: deck.name,
        format: deck.format ?? format,
        overlappingCards,
        note
      };
    });
}
