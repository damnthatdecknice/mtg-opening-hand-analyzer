"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { inferDeckName, parseDecklist } from "@/lib/deckParser";
import type { DeckInsert, SavedDeck } from "@/lib/decks";
import { supabase } from "@/lib/supabase";
import { useEntitlements } from "@/components/useEntitlements";

const defaultDecklist = `Deck
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
8 Plains

Sideboard
3 Destroy Evil
2 Lithomantic Barrage`;

export function DeckLibrary() {
  const entitlements = useEntitlements();
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [name, setName] = useState("");
  const [format, setFormat] = useState("Standard");
  const [decklist, setDecklist] = useState(defaultDecklist);
  const [showArchived, setShowArchived] = useState(false);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const parsed = useMemo(() => parseDecklist(decklist), [decklist]);
  const activeDecks = decks.filter((deck) => !deck.is_archived);
  const visibleDecks = decks.filter((deck) => showArchived || !deck.is_archived);

  useEffect(() => {
    if (entitlements.canUseDeckVault) {
      loadDecks();
    }
  }, [entitlements.canUseDeckVault]);

  async function loadDecks() {
    if (!supabase) {
      return;
    }

    setIsBusy(true);
    const { data, error } = await supabase
      .from("decks")
      .select("*")
      .order("updated_at", { ascending: false });

    setIsBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setDecks((data ?? []) as SavedDeck[]);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!supabase) {
      setMessage("Supabase is not configured yet.");
      return;
    }

    if (!entitlements.canUseDeckVault) {
      setMessage("Saved decklists unlock with the $5/month Deck Pro tier.");
      return;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setMessage("Sign in before saving a deck.");
      return;
    }

    if (parsed.mainCount === 0) {
      setMessage("Paste a decklist with at least one main-deck card.");
      return;
    }

    const deck: DeckInsert = {
      user_id: userData.user.id,
      name: name.trim() || inferDeckName(decklist),
      format: format.trim() || null,
      decklist,
      sideboard: parsed.cards
        .filter((card) => card.section === "sideboard")
        .map((card) => `${card.qty} ${card.name}`)
        .join("\n"),
      parsed_json: parsed
    };

    setIsBusy(true);
    const { error } = await supabase.from("decks").insert(deck);
    setIsBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setName("");
    setMessage("Deck saved.");
    await loadDecks();
  }

  async function setArchived(deck: SavedDeck, isArchived: boolean) {
    if (!supabase) {
      return;
    }

    setIsBusy(true);
    const { error } = await supabase
      .from("decks")
      .update({ is_archived: isArchived, updated_at: new Date().toISOString() })
      .eq("id", deck.id);
    setIsBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadDecks();
  }

  return (
    !entitlements.canUseDeckVault && !entitlements.isLoading ? (
      <section className="panel locked-feature-panel">
        <p className="eyebrow">Deck Pro</p>
        <h1>Decklists unlock at $5/month</h1>
        <p>
          The analyzer stays available on Free. Saving decks, managing the deck
          vault, and loading remembered decklists are Deck Pro features.
        </p>
        <Link className="primary-button" href="/pricing">
          View tiers
        </Link>
      </section>
    ) :
    <div className="deck-page-grid">
      <section className="panel deck-editor-panel">
        <div className="section-heading">
          <p className="eyebrow">Deck library</p>
          <h1>Save a Deck</h1>
          <p>
            Paste an Arena-style list. Put `Sideboard` on its own line when the
            sideboard starts.
          </p>
        </div>

        <form className="deck-form" onSubmit={handleSave}>
          <div className="form-row">
            <label>
              Deck name
              <input
                onChange={(event) => setName(event.target.value)}
                placeholder={inferDeckName(decklist)}
                value={name}
              />
            </label>
            <label>
              Format
              <input
                onChange={(event) => setFormat(event.target.value)}
                placeholder="Standard, Pioneer, Modern..."
                value={format}
              />
            </label>
          </div>
          <label>
            Decklist
            <textarea
              onChange={(event) => setDecklist(event.target.value)}
              spellCheck={false}
              value={decklist}
            />
          </label>
          <div className="deck-save-row">
            <div className="mini-metrics">
              <span>{parsed.mainCount} main</span>
              <span>{parsed.sideboardCount} sideboard</span>
              <span>{parsed.cards.length} unique rows</span>
            </div>
            <button className="primary-button" disabled={isBusy} type="submit">
              {isBusy ? "Saving..." : "Save deck"}
            </button>
          </div>
        </form>

        {message ? <p className="form-message">{message}</p> : null}
      </section>

      <section className="panel deck-list-panel">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow">Vault</p>
            <h2>{activeDecks.length} Active Decks</h2>
          </div>
          <button
            className="text-button"
            onClick={() => setShowArchived((value) => !value)}
            type="button"
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </button>
        </div>

        <div className="list-stack">
          {visibleDecks.length ? (
            visibleDecks.map((deck) => (
              <article className="deck-row" key={deck.id}>
                <div>
                  <strong>{deck.name}</strong>
                  <span>
                    {deck.format || "Unspecified"} | {deck.parsed_json.mainCount ?? 0} main |{" "}
                    {deck.parsed_json.sideboardCount ?? 0} sideboard
                  </span>
                </div>
                <button
                  className="text-button"
                  onClick={() => setArchived(deck, !deck.is_archived)}
                  type="button"
                >
                  {deck.is_archived ? "Restore" : "Archive"}
                </button>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <strong>No saved decks yet</strong>
              <span>Save your first list and it will appear here.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
