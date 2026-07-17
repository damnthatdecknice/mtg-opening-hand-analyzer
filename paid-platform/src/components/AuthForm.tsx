"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AuthMode, isSupabaseConfigured, supabase } from "@/lib/supabase";

type AuthFormProps = {
  mode: AuthMode;
};

export function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const isSignUp = mode === "sign-up";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!supabase) {
      setMessage("Supabase is not configured yet. Add the keys from .env.example to .env.local.");
      return;
    }

    setIsBusy(true);
    const result = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });

    setIsBusy(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    setMessage(
      isSignUp
        ? "Account created. Check your email if confirmations are enabled, then sign in."
        : "Signed in. Opening your dashboard..."
    );

    if (!isSignUp) {
      window.location.href = "/dashboard";
    }
  }

  return (
    <div className="auth-wrap">
      <section className="panel auth-panel">
        <p className="eyebrow">{isSignUp ? "Create account" : "Welcome back"}</p>
        <h1>{isSignUp ? "Start your Pro workspace" : "Sign in to Pro"}</h1>
        <p className="lede">
          {isSignUp
            ? "Create a private player account for saved decks, hand sessions, and rating history."
            : "Access your saved decks, tracked sessions, and player dashboard."}
        </p>

        {!isSupabaseConfigured ? (
          <div className="setup-note">
            <strong>Supabase keys needed</strong>
            <span>
              The screen is ready, but auth is paused until `.env.local` has
              `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
            </span>
          </div>
        ) : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Password
            <input
              autoComplete={isSignUp ? "new-password" : "current-password"}
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <button className="primary-button" disabled={isBusy} type="submit">
            {isBusy ? "Working..." : isSignUp ? "Create account" : "Sign in"}
          </button>
        </form>

        {message ? <p className="form-message">{message}</p> : null}

        <p className="auth-switch">
          {isSignUp ? "Already have an account?" : "Need an account?"}{" "}
          <Link href={isSignUp ? "/login" : "/signup"}>
            {isSignUp ? "Sign in" : "Create one"}
          </Link>
        </p>
      </section>
    </div>
  );
}
