"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useEntitlements } from "@/components/useEntitlements";
import { supabase } from "@/lib/supabase";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/analyzer", label: "Analyzer" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/decks", label: "Save a Deck", deckProOnly: true },
  { href: "/pricing", label: "Pricing" },
  { href: "/help", label: "Help" },
  { href: "/settings", label: "Settings" },
  { href: "/login", label: "Sign In" }
];

export function AppNav() {
  const entitlements = useEntitlements();
  const [isSignedIn, setIsSignedIn] = useState(false);
  const visibleItems = navItems.filter(
    (item) =>
      (!item.deckProOnly || entitlements.canUseDeckVault) &&
      (item.href !== "/login" || !isSignedIn)
  );

  useEffect(() => {
    if (!supabase) {
      setIsSignedIn(false);
      return;
    }

    supabase.auth.getUser().then(({ data }) => {
      setIsSignedIn(Boolean(data.user));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(Boolean(session?.user));
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

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
