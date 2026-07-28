"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardActions } from "@/components/DashboardActions";
import { DashboardMetagameSnapshot } from "@/components/DashboardMetagameSnapshot";
import { DashboardOverview } from "@/components/DashboardOverview";
import { DeckSummary } from "@/components/DeckSummary";
import { FirstDeckOnboarding } from "@/components/FirstDeckOnboarding";
import { supabase } from "@/lib/supabase";

export function DashboardContent() {
  const [deckCount, setDeckCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    async function loadDeckCount() {
      if (!supabase) {
        setDeckCount(0);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id ?? "";
      if (!userId) {
        setDeckCount(0);
        return;
      }

      const { count, error } = await supabase
        .from("decks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_archived", false);

      if (error) {
        setLoadError(error.message);
        setDeckCount(0);
        return;
      }

      setDeckCount(count ?? 0);
    }

    void loadDeckCount();
  }, []);

  return (
    <section className="dashboard">
      <header className="dashboard-header panel">
        <p className="eyebrow">Opening Edge</p>
        <h1>Prepare Better. Mulligan Smarter.</h1>
        <p>
          Tools for opening-hand analysis, deck management, and metagame preparation.
        </p>
        <DashboardActions />
      </header>

      {loadError ? <p className="form-message">{loadError}</p> : null}
      {deckCount === null ? (
        <section className="panel first-deck-onboarding first-deck-skeleton" aria-live="polite">
          <p className="eyebrow">First deck setup</p>
          <h2>Checking your deck vault</h2>
          <p>Opening Edge is getting your workspace ready.</p>
        </section>
      ) : deckCount === 0 ? (
        <FirstDeckOnboarding mode="account" />
      ) : (
        <section className="panel add-another-deck-card">
          <div>
            <p className="eyebrow">Deck setup</p>
            <h2>Add Another Deck</h2>
            <p>Import your MTGO .dek or paste another list when you are ready to test a new shell.</p>
          </div>
          <Link className="secondary-button" href="/decks">
            Add Another Deck
          </Link>
        </section>
      )}

      <DashboardOverview />

      <div className="dashboard-grid">
        <DeckSummary />
        <DashboardMetagameSnapshot />
      </div>
    </section>
  );
}
