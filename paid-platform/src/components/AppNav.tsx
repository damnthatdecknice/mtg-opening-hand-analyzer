"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEntitlements } from "@/components/useEntitlements";
import { supabase } from "@/lib/supabase";

const navItems = [
  { href: "/analyzer", label: "Analyzer" },
  { href: "/decks", label: "Save a Deck", deckProOnly: true },
  { href: "/mana-curve", label: "Deck Lab", deckProOnly: true },
  { href: "/metagame", label: "Metagame", deckProOnly: true },
  { href: "/help", label: "How To" },
  { href: "/bug-report", label: "Bug Report" },
  { href: "/settings", label: "Settings" },
  { href: "/login", label: "Sign In" }
];

export function AppNav() {
  const pathname = usePathname();
  const entitlements = useEntitlements();
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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
      setIsSignedIn(Boolean(data.session?.user));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsSignedIn(Boolean(session?.user));
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setIsMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isMenuOpen]);

  return (
    <nav className="app-nav" aria-label="Primary navigation">
      <Link className="app-nav-brand" href="/">
        <Image src="/opening-edge-logo.png" alt="Opening Edge" width={416} height={145} priority />
      </Link>
      <button
        aria-controls="primary-nav-links"
        aria-expanded={isMenuOpen}
        aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
        className="app-nav-menu-button"
        onClick={() => setIsMenuOpen((current) => !current)}
        type="button"
      >
        Menu
      </button>
      <div className={`app-nav-links${isMenuOpen ? " is-open" : ""}`} id="primary-nav-links">
        {visibleItems.map((item) => (
          <Link
            aria-current={pathname === item.href ? "page" : undefined}
            className="secondary-button app-nav-link"
            href={item.href}
            key={item.href}
            onClick={() => setIsMenuOpen(false)}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
