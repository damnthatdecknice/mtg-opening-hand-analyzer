"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type DashboardState = {
  deckCount: number;
  handCount: number;
  plan: string;
  error: string;
  isLoading: boolean;
};

const initialState: DashboardState = {
  deckCount: 0,
  handCount: 0,
  plan: "Free",
  error: "",
  isLoading: true
};

function titleCase(value: string | null) {
  if (!value) {
    return "Unknown";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
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

      const [decks, hands, plan] = await Promise.all([
        supabase
          .from("decks")
          .select("id", { count: "exact", head: true })
          .eq("is_archived", false),
        supabase
          .from("hand_sessions")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("subscription_status")
          .select("status")
          .maybeSingle()
      ]);

      const firstError = decks.error ?? hands.error ?? plan.error;
      setState({
        deckCount: decks.count ?? 0,
        handCount: hands.count ?? 0,
        plan: plan.data?.status ? titleCase(plan.data.status) : "Beta Pro",
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
          <strong>{state.isLoading ? "..." : state.plan}</strong>
        </div>
      </div>
    </>
  );
}
