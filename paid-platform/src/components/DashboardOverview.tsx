"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type HandSession = {
  id: string;
  confirmed_hand: string[] | unknown;
  decision: "keep" | "mulligan" | "close" | "unknown" | null;
  created_at: string;
};

type DashboardState = {
  deckCount: number;
  handCount: number;
  plan: string;
  sessions: HandSession[];
  error: string;
  isLoading: boolean;
};

const initialState: DashboardState = {
  deckCount: 0,
  handCount: 0,
  plan: "Free",
  sessions: [],
  error: "",
  isLoading: true
};

function titleCase(value: string | null) {
  if (!value) {
    return "Unknown";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function sessionLabel(session: HandSession) {
  const hand = Array.isArray(session.confirmed_hand) ? session.confirmed_hand : [];
  if (!hand.length) {
    return "Saved hand session";
  }
  return hand.slice(0, 3).join(", ") + (hand.length > 3 ? "..." : "");
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

      const [decks, hands, plan, sessions] = await Promise.all([
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
          .maybeSingle(),
        supabase
          .from("hand_sessions")
          .select("id, confirmed_hand, decision, created_at")
          .order("created_at", { ascending: false })
          .limit(3)
      ]);

      const firstError = decks.error ?? hands.error ?? plan.error ?? sessions.error;
      setState({
        deckCount: decks.count ?? 0,
        handCount: hands.count ?? 0,
        plan: plan.data?.status ? titleCase(plan.data.status) : "Beta Pro",
        sessions: ((sessions.data ?? []) as HandSession[]),
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

      <section className="panel">
        <div className="section-heading">
          <p className="eyebrow">Recent decisions</p>
          <h2>Hand Sessions</h2>
        </div>
        <div className="list-stack">
          {state.sessions.length ? (
            state.sessions.map((session) => (
              <div className="list-row" key={session.id}>
                <div>
                  <strong>{sessionLabel(session)}</strong>
                  <span>{new Date(session.created_at).toLocaleDateString()}</span>
                </div>
                <em>{titleCase(session.decision)}</em>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <strong>No tracked hands yet</strong>
              <span>Analyze and save hand sessions here once session storage is wired into the analyzer.</span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
