"use client";

import Link from "next/link";
import { useEntitlements } from "@/components/useEntitlements";

export function DashboardActions() {
  const entitlements = useEntitlements();

  return (
    <div className="action-row">
      {entitlements.canUseDeckVault ? (
        <>
          <Link className="primary-button" href="/decks">
            Get Started - Save a Deck
          </Link>
          <Link className="secondary-button" href="/analyzer">
            Analyze a Hand
          </Link>
          <Link className="secondary-button" href="/metagame">
            Metagame
          </Link>
        </>
      ) : (
        <>
          <Link className="primary-button" href="/analyzer">
            Analyze a Hand
          </Link>
          <Link className="secondary-button" href="/pricing">
            View Deck Pro
          </Link>
        </>
      )}
    </div>
  );
}
