"use client";

import Link from "next/link";
import { useEntitlements } from "@/components/useEntitlements";

type DashboardActionsProps = {
  recentDeck?: {
    id: string;
    name: string;
  } | null;
};

export function DashboardActions({ recentDeck }: DashboardActionsProps) {
  const entitlements = useEntitlements();
  const deckHref = recentDeck ? `/analyzer?deck=${encodeURIComponent(recentDeck.id)}&step=hand` : "/analyzer";
  const deckLabHref = recentDeck ? `/mana-curve?deck=${encodeURIComponent(recentDeck.id)}` : "/mana-curve";

  return (
    <div className="action-row">
      {entitlements.canUseDeckVault ? (
        <>
          <Link className="primary-button" href={deckHref}>
            Analyze a Hand
          </Link>
          <Link className="secondary-button" href={deckLabHref}>
            Open Deck Lab
          </Link>
          <Link className="secondary-button" href="/trainer">
            Keep Trainer
          </Link>
          <Link className="secondary-button" href="/metagame">
            Metagame Analysis
          </Link>
        </>
      ) : (
        <>
          <Link className="primary-button" href="/analyzer">
            Analyze a Hand
          </Link>
          <Link className="secondary-button" href="/trainer">
            Keep Trainer
          </Link>
          <Link className="secondary-button" href="/pricing">
            View Deck Pro
          </Link>
        </>
      )}
    </div>
  );
}
