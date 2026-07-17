"use client";

import Link from "next/link";
import { useEntitlements } from "@/components/useEntitlements";

export function DashboardActions() {
  const entitlements = useEntitlements();

  return (
    <div className="action-row">
      <Link className="primary-button" href="/analyzer">
        Analyze a hand
      </Link>
      {entitlements.canUseDeckVault ? (
        <Link className="secondary-button" href="/decks">
          Save decks
        </Link>
      ) : (
        <Link className="secondary-button" href="/pricing">
          View Deck Pro
        </Link>
      )}
    </div>
  );
}
