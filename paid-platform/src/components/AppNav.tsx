"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEntitlements } from "@/components/useEntitlements";
import { getAuthFallbackUser } from "@/lib/authFallback";
import { supabase } from "@/lib/supabase";

const navItems = [
  { href: "/analyzer", label: "Analyzer" },
  { href: "/decks", label: "Save a Deck", deckProOnly: true },
  { href: "/metagame", label: "Metagame", deckProOnly: true },
  { href: "/pricing", label: "Pricing" },
  { href: "/help", label: "How To" },
  { href: "/settings", label: "Settings" },
  { href: "/login", label: "Sign In" }
];

export function AppNav() {
  const pathname = usePathname();
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

    supabase.auth.getSession().then(({ data }) => {
      setIsSignedIn(Boolean(data.session?.user ?? getAuthFallbackUser()));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(Boolean(session?.user ?? getAuthFallbackUser()));
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  return (
    <nav className="app-nav" aria-label="Primary navigation">
      <Link className="app-nav-brand" href="/">
        <Image src="/opening-edge-logo.png" alt="Opening Edge" width={416} height={145} priority />
      </Link>
      <div className="app-nav-links">
        {visibleItems.map((item) => (
          <Link
            aria-current={pathname === item.href ? "page" : undefined}
            className="secondary-button app-nav-link"
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
