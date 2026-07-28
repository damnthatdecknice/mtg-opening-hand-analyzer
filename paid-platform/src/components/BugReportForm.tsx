"use client";

import { FormEvent, useEffect, useState } from "react";
import { getAuthFallbackUser } from "@/lib/authFallback";
import { supabase } from "@/lib/supabase";

export function BugReportForm() {
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadEmail() {
      if (!supabase) {
        const fallback = getAuthFallbackUser();
        if (isActive && fallback?.email) {
          setEmail(fallback.email);
        }
        return;
      }

      const { data } = await supabase.auth.getSession();
      const nextEmail = data.session?.user.email ?? getAuthFallbackUser()?.email ?? "";
      if (isActive && nextEmail) {
        setEmail(nextEmail);
      }
    }

    void loadEmail();

    return () => {
      isActive = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const trimmedEmail = email.trim();
    const trimmedDescription = description.trim();

    if (!trimmedEmail || !trimmedDescription) {
      setMessage("Add your email and a short description of the bug.");
      return;
    }

    setIsBusy(true);
    const response = await fetch("/api/bug-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: trimmedEmail,
        description: trimmedDescription,
        page: window.location.href,
        userAgent: window.navigator.userAgent
      })
    });
    const result = (await response.json().catch(() => ({}))) as { error?: string; ok?: boolean };
    setIsBusy(false);

    if (!response.ok || !result.ok) {
      setMessage(result.error ?? "Could not send the bug report. Please try again in a moment.");
      return;
    }

    setDescription("");
    setMessage("Bug report sent. Thank you for the sharp eyes.");
  }

  return (
    <section className="bug-report-page">
      <header className="hero-panel compact-hero-panel">
        <p className="eyebrow">Opening Edge feedback</p>
        <h1>Bug Report</h1>
        <p>Send a quick note when something breaks, looks wrong, or gives you suspicious analysis.</p>
      </header>

      <section className="panel bug-report-panel">
        <p className="eyebrow">Report details</p>
        <h2>What went wrong?</h2>
        <form className="bug-report-form" onSubmit={handleSubmit}>
          <label>
            Your email
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Bug description
            <textarea
              minLength={12}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What page were you on, what did you expect, and what happened instead?"
              required
              rows={8}
              value={description}
            />
          </label>
          <button className="primary-button" disabled={isBusy} type="submit">
            {isBusy ? "Sending..." : "Send bug report"}
          </button>
        </form>
        {message ? <p className="form-message">{message}</p> : null}
      </section>
    </section>
  );
}
