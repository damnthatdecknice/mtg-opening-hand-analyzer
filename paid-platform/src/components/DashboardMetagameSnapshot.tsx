"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MetagameResponse } from "@/lib/metagame";

type SnapshotState = {
  data: MetagameResponse | null;
  error: string;
  isLoading: boolean;
};

export function DashboardMetagameSnapshot() {
  const [state, setState] = useState<SnapshotState>({
    data: null,
    error: "",
    isLoading: true
  });

  useEffect(() => {
    async function loadModernSnapshot() {
      try {
        const response = await fetch("/api/metagame?format=Modern&windowDays=7&v=5", {
          cache: "no-store"
        });
        if (!response.ok) {
          throw new Error("Could not load Modern metagame.");
        }
        const data = (await response.json()) as MetagameResponse;
        setState({ data, error: "", isLoading: false });
      } catch (error) {
        setState({
          data: null,
          error: error instanceof Error ? error.message : "Could not load Modern metagame.",
          isLoading: false
        });
      }
    }

    void loadModernSnapshot();
  }, []);

  const topArchetype = state.data?.archetypes[0];

  return (
    <section className="panel dashboard-meta-snapshot">
      <div className="section-heading split-heading">
        <div>
          <p className="eyebrow">Modern Metagame</p>
          <h2>7-Day Snapshot</h2>
        </div>
        <Link className="text-button" href="/metagame">
          Open
        </Link>
      </div>

      {state.isLoading ? (
        <div className="empty-state">
          <strong>Loading Modern data...</strong>
          <span>Pulling the latest cached Challenge snapshot.</span>
        </div>
      ) : state.error ? (
        <div className="empty-state">
          <strong>Snapshot unavailable</strong>
          <span>{state.error}</span>
        </div>
      ) : state.data ? (
        <>
          <div className="snapshot-callout">
            <span>Top deck</span>
            <strong>
              {topArchetype ? `${topArchetype.name} ${Math.round(topArchetype.share * 100)}%` : "No data yet"}
            </strong>
          </div>
          <div className="mini-meta-bars">
            {state.data.archetypes.slice(0, 5).map((archetype) => (
              <div className="mini-meta-row" key={archetype.name}>
                <span>{archetype.name}</span>
                <i style={{ width: `${Math.max(8, Math.min(100, archetype.share * 200))}%` }} />
                <em>{Math.round(archetype.share * 100)}%</em>
              </div>
            ))}
          </div>
          <p className="muted-copy">
            {state.data.deckCount} decks across {state.data.eventCount} MTGO Challenge event
            {state.data.eventCount === 1 ? "" : "s"}.
          </p>
        </>
      ) : null}
    </section>
  );
}
