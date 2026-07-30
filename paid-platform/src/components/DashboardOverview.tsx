"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type DashboardState = {
  deckCount: number;
  handCount: number;
  error: string;
  isLoading: boolean;
};

const initialState: DashboardState = {
  deckCount: 0,
  handCount: 0,
  error: "",
  isLoading: true
};

export function DashboardOverview() {
  const [state, setState] = useState<DashboardState>(initialState);

  useEffect(() => {
    async function loadDashboard() {
      if (!supabase) {
        setState((current) => ({
          ...current,
          error: "Supabase is not configured.",
          isLoading: false
        }));
        return;
      }

      const sessionResponse = await supabase.auth.getSession();
      const userId = sessionResponse.data.session?.user.id ?? "";

      const [decks, hands] = await Promise.all([
        userId
          ? supabase
              .from("decks")
              .select("id", { count: "exact", head: true })
              .eq("user_id", userId)
              .eq("is_archived", false)
          : Promise.resolve({ count: 0, error: null }),
        userId
          ? supabase
              .from("hand_sessions")
              .select("id", { count: "exact", head: true })
              .eq("user_id", userId)
          : Promise.resolve({ count: 0, error: null })
      ]);

      const firstError = decks.error ?? hands.error;
      setState({
        deckCount: decks.count ?? 0,
        handCount: hands.count ?? 0,
        error: firstError?.message ?? "",
        isLoading: false
      });
    }

    void loadDashboard();
  }, []);

  return (
    <>
      {state.error ? <p className="form-message">{state.error}</p> : null}
      <div className="dashboard-metrics">
        <div className="metric-card dashboard-stat-card">
          <span>Saved decks</span>
          <strong>{state.isLoading ? "..." : state.deckCount}</strong>
        </div>
        <Link className="metric-card add-deck-metric" href="/decks">
          <span>Deck setup</span>
          <strong>{state.deckCount > 0 ? "Add Another Deck" : "Add Your First Deck"}</strong>
          <em>
            {state.deckCount > 0
              ? "Import your .dek or paste another decklist"
              : "Import your .dek file to analyze hands"}
          </em>
        </Link>
        <div className="metric-card dashboard-stat-card">
          <span>Hands analyzed</span>
          <strong>{state.isLoading ? "..." : state.handCount}</strong>
        </div>
      </div>
    </>
  );
}
