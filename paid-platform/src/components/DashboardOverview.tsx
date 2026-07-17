"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useEntitlements } from "@/components/useEntitlements";

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
  const entitlements = useEntitlements();
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

      const [decks, hands] = await Promise.all([
        supabase
          .from("decks")
          .select("id", { count: "exact", head: true })
          .eq("is_archived", false),
        supabase
          .from("hand_sessions")
          .select("id", { count: "exact", head: true })
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
        <div className="metric-card">
          <span>Saved decks</span>
          <strong>{state.isLoading ? "..." : state.deckCount}</strong>
        </div>
        <div className="metric-card">
          <span>Tracked hands</span>
          <strong>{state.isLoading ? "..." : state.handCount}</strong>
        </div>
        <div className="metric-card">
          <span>Plan</span>
          <strong>{entitlements.isLoading ? "..." : entitlements.tierLabel}</strong>
        </div>
      </div>
    </>
  );
}
