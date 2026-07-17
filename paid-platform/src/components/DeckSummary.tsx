"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SavedDeck } from "@/lib/decks";
import { supabase } from "@/lib/supabase";
import { useEntitlements } from "@/components/useEntitlements";

export function DeckSummary() {
  const entitlements = useEntitlements();
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [error, setError] = useState("");

  function rememberAnalyzerDeck(deckId: string) {
    window.localStorage.setItem("mtg-hand-pro:last-analyzer-deck-id", deckId);
  }

  useEffect(() => {
    if (!supabase || !entitlements.canUseDeckVault) {
      return;
    }

    supabase
      .from("decks")
      .select("*")
      .eq("is_archived", false)
      .order("updated_at", { ascending: false })
      .limit(3)
      .then(({ data, error: loadError }) => {
        if (loadError) {
          setError(loadError.message);
          return;
        }
        setDecks((data ?? []) as SavedDeck[]);
      });
  }, [entitlements.canUseDeckVault]);

  return (
    <section className="panel">
      <div className="section-heading split-heading">
        <div>
          <p className="eyebrow">Deck vault</p>
          <h2>Saved Decks</h2>
        </div>
        {entitlements.canUseDeckVault ? (
          <Link className="text-link" href="/decks">
            Manage
          </Link>
        ) : (
          <Link className="text-link" href="/pricing">
            Unlock
          </Link>
        )}
      </div>
      <div className="list-stack">
        {error ? <p className="form-message">{error}</p> : null}
        {!entitlements.canUseDeckVault && !entitlements.isLoading ? (
          <div className="empty-state">
            <strong>Deck Pro feature</strong>
            <span>Saved decks unlock with the $5/month tier.</span>
          </div>
        ) : decks.length ? (
          decks.map((deck) => (
            <Link
              className="list-row clickable-list-row"
              href={`/analyzer?deck=${encodeURIComponent(deck.id)}`}
              key={deck.id}
              onClick={() => rememberAnalyzerDeck(deck.id)}
            >
              <div>
                <strong>{deck.name}</strong>
                <span>{deck.format || "Unspecified"}</span>
              </div>
              <em>{deck.parsed_json?.mainCount ?? 0} cards</em>
            </Link>
          ))
        ) : (
          <div className="empty-state">
            <strong>No decks saved yet</strong>
            <span>Add your first list in the deck vault.</span>
          </div>
        )}
      </div>
    </section>
  );
}
