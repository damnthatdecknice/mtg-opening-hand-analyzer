"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type DashboardState = {
  deckCount: number;
  handCount: number;
  planLabel: string;
  error: string;
  isLoading: boolean;
};

const initialState: DashboardState = {
  deckCount: 0,
  handCount: 0,
  planLabel: "Free",
  error: "",
  isLoading: true
};

function planLabelFromRank(rank?: string | null) {
  if (rank === "beta_premium") {
    return "Beta Tester";
  }
  if (rank === "pro") {
    return "Pro";
  }
  return "Free";
}

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

      const userResponse = await supabase.auth.getUser();
      const userId = userResponse.data.user?.id;

      const [decks, hands, profile] = await Promise.all([
        supabase
          .from("decks")
          .select("id", { count: "exact", head: true })
          .eq("is_archived", false),
        supabase
          .from("hand_sessions")
          .select("id", { count: "exact", head: true }),
        userId
          ? supabase.from("profiles").select("rank").eq("id", userId).maybeSingle()
          : Promise.resolve({ data: null, error: null })
      ]);

      const firstError = decks.error ?? hands.error;
      setState({
        deckCount: decks.count ?? 0,
        handCount: hands.count ?? 0,
        planLabel: planLabelFromRank(profile.data?.rank),
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
          <span>Hands analyzed</span>
          <strong>{state.isLoading ? "..." : state.handCount}</strong>
        </div>
        <div className="metric-card">
          <span>Plan</span>
          <strong>{state.isLoading ? "..." : state.planLabel}</strong>
        </div>
      </div>
    </>
  );
}
