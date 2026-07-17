"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { DashboardContent } from "@/components/DashboardContent";
import { supabase } from "@/lib/supabase";

const pillars = [
  {
    title: "Saved Decks",
    body: "Store tuned lists, sideboards, and format notes without changing the beta tester workflow."
  },
  {
    title: "Session History",
    body: "Keep confirmed hands, mulligan decisions, ratings, and post-match notes tied to the player account."
  },
  {
    title: "Subscription Ready",
    body: "Build auth and entitlements first, then connect Stripe once the product is worth charging for."
  }
];

export function HomeLanding() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setIsLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    await supabase?.auth.signOut();
    window.location.href = "/";
  }

  if (isLoading) {
    return (
      <section className="panel auth-required">
        <p className="eyebrow">Checking session</p>
        <h1>Loading your workspace</h1>
      </section>
    );
  }

  if (user) {
    return (
      <>
        <div className="account-bar">
          <span>{user.email}</span>
          <button className="text-button" onClick={handleSignOut} type="button">
            Sign out
          </button>
        </div>
        <DashboardContent />
      </>
    );
  }

  return (
    <section className="hero-grid">
      <div className="panel hero-panel">
        <p className="eyebrow">Paid product track</p>
        <h1>MTG Opening Hand Pro</h1>
        <p className="lede">
          A separate platform for player accounts, saved deck data, rating history,
          and eventually subscriptions while the Streamlit beta keeps moving fast.
        </p>
        <div className="action-row">
          <Link className="primary-button" href="/login">
            Sign in
          </Link>
          <Link className="secondary-button" href="/analyzer">
            Analyze a hand
          </Link>
          <Link className="secondary-button" href="/signup">
            Create account
          </Link>
          <a className="secondary-button" href="#plan">
            See build plan
          </a>
        </div>
      </div>

      <div className="status-stack">
        <div className="metric-card">
          <span>Current mode</span>
          <strong>Foundation</strong>
        </div>
        <div className="metric-card">
          <span>Beta safety</span>
          <strong>Separate</strong>
        </div>
        <div className="metric-card">
          <span>Initial cost</span>
          <strong>$0 path</strong>
        </div>
      </div>

      <div id="plan" className="pillar-grid">
        {pillars.map((pillar) => (
          <article className="panel compact-panel" key={pillar.title}>
            <h2>{pillar.title}</h2>
            <p>{pillar.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
