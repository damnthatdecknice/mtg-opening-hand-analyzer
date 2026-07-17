"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SavedDeck } from "@/lib/decks";
import { supabase } from "@/lib/supabase";

export function DeckSummary() {
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!supabase) {
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
  }, []);

  return (
    <section className="panel">
      <div className="section-heading split-heading">
        <div>
          <p className="eyebrow">Deck vault</p>
          <h2>Saved Decks</h2>
        </div>
        <Link className="text-link" href="/decks">
          Manage
        </Link>
      </div>
      <div className="list-stack">
        {error ? <p className="form-message">{error}</p> : null}
        {decks.length ? (
          decks.map((deck) => (
            <div className="list-row" key={deck.id}>
              <div>
                <strong>{deck.name}</strong>
                <span>{deck.format || "Unspecified"}</span>
              </div>
              <em>{deck.parsed_json?.mainCount ?? 0} cards</em>
            </div>
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
