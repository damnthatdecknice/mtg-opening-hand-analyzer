"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { AccountBar } from "@/components/AccountBar";
import { DashboardContent } from "@/components/DashboardContent";
import { FirstDeckOnboarding } from "@/components/FirstDeckOnboarding";
import { clearAuthFallback } from "@/lib/authFallback";
import { supabase } from "@/lib/supabase";

const pillars = [
  {
    title: "Add your deck",
    body: "Paste an Arena-style list or import your MTGO .dek so analysis uses the deck you are actually playing."
  },
  {
    title: "Analyze the seven",
    body: "Enter the hand manually or review screenshot recognition before any recommendation is generated."
  },
  {
    title: "Review the risks",
    body: "See land-drop odds, castability, failure conditions, play/draw context, and mulligan comparison."
  }
];

export function HomeLanding() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [onboardingAction, setOnboardingAction] = useState<"none" | "example">("none");

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setIsLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    clearAuthFallback();
    await supabase?.auth.signOut();
    window.location.href = "/";
  }

  function focusFirstDeckOnboarding() {
    const element = document.getElementById("first-deck-onboarding");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start"
    });

    window.requestAnimationFrame(() => {
      element?.querySelector<HTMLElement>('input[type="file"], textarea, button')?.focus();
    });
  }

  if (user && !isLoading) {
    return (
      <>
        <AccountBar onSignOut={handleSignOut} user={user} />
        <DashboardContent />
      </>
    );
  }

  return (
    <section className="hero-grid">
      <div className="panel hero-panel">
        <p className="eyebrow">Opening Edge</p>
        <h1>Prepare Better. Mulligan Smarter.</h1>
        <p className="lede">
          Analyze a seven-card opening hand against your exact decklist. See keepability,
          castability, land-drop odds, failure risks, and whether a mulligan is likely to
          improve your position.
        </p>
        <div className="action-row">
          <button className="primary-button" onClick={focusFirstDeckOnboarding} type="button">
            Add My Deck
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              setOnboardingAction("example");
              focusFirstDeckOnboarding();
            }}
            type="button"
          >
            Try an Example
          </button>
        </div>
        <p className="muted-copy">Opening Edge is in open beta. Results are advisory estimates, not guarantees.</p>
      </div>

      <FirstDeckOnboarding
        id="first-deck-onboarding"
        mode="guest"
        requestedAction={onboardingAction}
        onRequestedActionHandled={() => setOnboardingAction("none")}
      />

      <div className="pillar-grid">
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
