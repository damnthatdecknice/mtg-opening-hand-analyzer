"use client";

import Link from "next/link";
import { useEntitlements } from "@/components/useEntitlements";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/analyzer", label: "Analyzer" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/decks", label: "Save a Deck", deckProOnly: true },
  { href: "/pricing", label: "Pricing" },
  { href: "/settings", label: "Settings" },
  { href: "/login", label: "Sign In" }
];

export function AppNav() {
  const entitlements = useEntitlements();
  const visibleItems = navItems.filter((item) => !item.deckProOnly || entitlements.canUseDeckVault);

  return (
    <nav className="app-nav" aria-label="Primary navigation">
      <Link className="app-nav-brand" href="/">
        MTG Hand Pro
      </Link>
      <div className="app-nav-links">
        {visibleItems.map((item) => (
          <Link className="secondary-button app-nav-link" href={item.href} key={item.href}>
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
