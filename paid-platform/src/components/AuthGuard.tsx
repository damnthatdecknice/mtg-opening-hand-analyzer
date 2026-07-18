"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
    await supabase?.auth.signOut();
    window.location.href = "/";
  }

  if (!isSupabaseConfigured) {
    return (
      <section className="panel auth-required">
        <p className="eyebrow">Setup needed</p>
        <h1>Connect Supabase to unlock accounts</h1>
        <p>
          The paid dashboard is protected and ready, but the app needs Supabase
          keys in `.env.local` before sign-in can work.
        </p>
        <Link className="primary-button" href="/login">
          View login screen
        </Link>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="panel auth-required">
        <p className="eyebrow">Checking session</p>
        <h1>Loading your workspace</h1>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="panel auth-required">
        <p className="eyebrow">Protected workspace</p>
        <h1>Sign in to view your dashboard</h1>
        <p>Saved decks, session history, and subscriptions belong behind user accounts.</p>
        <div className="action-row">
          <Link className="primary-button" href="/login">
            Sign in
          </Link>
          <Link className="secondary-button" href="/signup">
            Create account
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="account-bar">
        <span>{user.email}</span>
        <button className="text-button" onClick={handleSignOut} type="button">
          Sign out
        </button>
      </div>
      {children}
    </>
  );
}
