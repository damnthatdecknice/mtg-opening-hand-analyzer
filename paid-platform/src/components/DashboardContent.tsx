"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardActions } from "@/components/DashboardActions";
import { DashboardMetagameSnapshot } from "@/components/DashboardMetagameSnapshot";
import { DashboardOverview } from "@/components/DashboardOverview";
import { DeckSummary } from "@/components/DeckSummary";
import { FirstDeckOnboarding } from "@/components/FirstDeckOnboarding";
import { fetchCardData } from "@/lib/analyzer";
import { saveDeckForCurrentUser } from "@/lib/deckStorage";
import {
  gateDeckVerification,
  verifyDeckForSaving,
  type OnboardingDeckReview,
  type OnboardingValidationStatus
} from "@/lib/firstDeckOnboarding";
import {
  clearGuestDeckIntent,
  clearGuestDeckMigrationState,
  loadGuestDeck,
  loadGuestDeckIntent,
  type GuestDeck
} from "@/lib/guestDeck";
import { parseDecklist } from "@/lib/deckParser";
import { selectRecentDashboardDeck } from "@/lib/dashboard";
import { supabase } from "@/lib/supabase";

export function DashboardContent() {
  const [deckCount, setDeckCount] = useState<number | null>(null);
  const [recentDeck, setRecentDeck] = useState<{ id: string; name: string } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [guestDeck, setGuestDeck] = useState<GuestDeck | null>(null);
  const [migrationMessage, setMigrationMessage] = useState("");
  const [isMigratingGuestDeck, setIsMigratingGuestDeck] = useState(false);
  const [guestVerification, setGuestVerification] = useState<OnboardingDeckReview | null>(null);
  const [guestVerificationStatus, setGuestVerificationStatus] = useState<OnboardingValidationStatus>("empty");
  const [acknowledgedGuestWarnings, setAcknowledgedGuestWarnings] = useState(false);
  const [guestVerificationRetry, setGuestVerificationRetry] = useState(0);
  const conversionRef = useRef<HTMLElement | null>(null);

  const loadDeckCount = useCallback(async () => {
    setLoadError("");
    setDeckCount(null);
      if (!supabase) {
        setDeckCount(0);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id ?? "";
      if (!userId) {
        setDeckCount(0);
        return;
      }

      const { data: deckRows, error } = await supabase
        .from("decks")
        .select("id,name,updated_at")
        .eq("user_id", userId)
        .eq("is_archived", false)
        .order("updated_at", { ascending: false });

      if (error) {
        setLoadError(error.message);
        return;
      }

      const decks = (deckRows ?? []) as Array<{ id: string; name: string; updated_at: string }>;
      const { data: recentSession } = await supabase
        .from("hand_sessions")
        .select("deck_id")
        .eq("user_id", userId)
        .not("deck_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const recentSessionDeckId = typeof recentSession?.deck_id === "string" ? recentSession.deck_id : "";
      const nextRecentDeck = selectRecentDashboardDeck(decks, recentSessionDeckId);

      setRecentDeck(nextRecentDeck ? { id: nextRecentDeck.id, name: nextRecentDeck.name } : null);
      setDeckCount(decks.length);
  }, []);

  useEffect(() => {
    void loadDeckCount();
  }, [loadDeckCount, reloadKey]);

  useEffect(() => {
    const intent = loadGuestDeckIntent();
    const storedGuestDeck = intent?.action === "save-after-auth" ? loadGuestDeck() : null;
    setGuestDeck(storedGuestDeck);
  }, []);

  useEffect(() => {
    if (!guestDeck) {
      setGuestVerification(null);
      setGuestVerificationStatus("empty");
      return;
    }
    window.requestAnimationFrame(() => conversionRef.current?.focus());
  }, [guestDeck]);

  useEffect(() => {
    setAcknowledgedGuestWarnings(false);
    if (!guestDeck) {
      setGuestVerification(null);
      setGuestVerificationStatus("empty");
      return;
    }

    setGuestVerificationStatus("checking");
    setGuestVerification({
      suggestedName: guestDeck.name,
      mainCount: guestDeck.parsedMainCount,
      sideboardCount: guestDeck.parsedSideboardCount,
      uniqueCount: parseDecklist(guestDeck.decklist).cards.length,
      status: "checking",
      messages: ["Checking this deck again before it is attached to your account."],
      issues: []
    });

    const controller = new AbortController();
    verifyDeckForSaving(guestDeck.decklist, guestDeck.format, fetchCardData, controller.signal, { retryFailures: guestVerificationRetry > 0 })
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        setGuestVerification(result);
        setGuestVerificationStatus(result.status);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setGuestVerification({
          suggestedName: guestDeck.name,
          mainCount: guestDeck.parsedMainCount,
          sideboardCount: guestDeck.parsedSideboardCount,
          uniqueCount: parseDecklist(guestDeck.decklist).cards.length,
          status: "lookup-error",
          messages: ["Opening Edge could not finish checking this deck. You can retry without losing the decklist."],
          issues: [
            {
              code: "LOOKUP_ERROR",
              severity: "warning",
              title: "Verification could not finish",
              detail: "Opening Edge could not finish checking this deck. You can retry without losing the decklist."
            }
          ]
        });
        setGuestVerificationStatus("lookup-error");
      });

    return () => controller.abort();
  }, [guestDeck, guestVerificationRetry]);

  function canContinueGuestConversion() {
    if (!guestDeck) {
      return false;
    }
    const gate = gateDeckVerification(guestVerificationStatus, acknowledgedGuestWarnings, guestDeck.parsedMainCount);
    if (!gate.allowed) {
      setMigrationMessage(gate.message ?? "Review this deck before continuing.");
    }
    return gate.allowed;
  }

  async function saveGuestDeckAndAnalyze() {
    if (!guestDeck) {
      return;
    }
    if (!canContinueGuestConversion()) {
      return;
    }

    setIsMigratingGuestDeck(true);
    setMigrationMessage("");
    const parsed = parseDecklist(guestDeck.decklist);
    const parsedJson = guestDeck.importMetadata ? { ...parsed, importMetadata: guestDeck.importMetadata } : parsed;
    const result = await saveDeckForCurrentUser({
      decklist: guestDeck.decklist,
      format: guestDeck.format,
      name: guestDeck.name,
      parsedJson
    });
    setIsMigratingGuestDeck(false);

    if (result.error || !result.deckId) {
      setMigrationMessage(result.error || "The deck could not be saved. Your imported deck is still preserved.");
      return;
    }

    clearGuestDeckMigrationState();
    window.location.href = `/analyzer?deck=${encodeURIComponent(result.deckId)}&step=hand`;
  }

  function continueWithGuestDeck() {
    if (!canContinueGuestConversion()) {
      return;
    }
    clearGuestDeckIntent();
    window.location.href = "/analyzer?guest=1&step=hand";
  }

  function discardGuestDeck() {
    clearGuestDeckMigrationState();
    setGuestDeck(null);
    setMigrationMessage("Imported guest deck discarded.");
  }

  function renderDashboardHeader() {
    const isFirstTime = deckCount === 0 && !loadError;
    return (
      <header className="dashboard-header panel">
        <p className="eyebrow">{isFirstTime ? "Welcome to Opening Edge" : "Opening Edge"}</p>
        <h1>{isFirstTime ? "Add your first deck to begin" : "Prepare Better. Mulligan Smarter."}</h1>
        <p>
          {isFirstTime
            ? "Import a Magic Online .dek or paste a decklist, then analyze your first opening hand."
            : "Tools for opening-hand analysis, deck management, and metagame preparation."}
        </p>
        {deckCount && deckCount > 0 ? <DashboardActions recentDeck={recentDeck} /> : null}
      </header>
    );
  }

  return (
    <section className={`dashboard${deckCount === 0 && !loadError ? " first-time-dashboard" : ""}`}>
      {renderDashboardHeader()}

      {guestDeck ? (
        <section
          className="panel guest-deck-conversion-card"
          ref={conversionRef}
          tabIndex={-1}
          aria-labelledby="guest-deck-conversion-heading"
        >
          <p className="eyebrow">Imported deck ready</p>
          <h2 id="guest-deck-conversion-heading">Save Your Imported Deck</h2>
          <p>
            Confirm before attaching this browser deck to your account. If saving fails, the deck stays here so you do not have to import it again.
          </p>
          <div className="guest-conversion-grid">
            <span>
              <strong>{guestDeck.name}</strong>
              <em>Deck name</em>
            </span>
            <span>
              <strong>{guestDeck.format}</strong>
              <em>Format</em>
            </span>
            <span>
              <strong>{guestDeck.parsedMainCount}</strong>
              <em>Main deck</em>
            </span>
            <span>
              <strong>{guestDeck.parsedSideboardCount}</strong>
              <em>Sideboard</em>
            </span>
            <span>
              <strong>{guestDeck.importMetadata?.source === "mtgo_dek" ? "Your .dek import" : "Pasted list"}</strong>
              <em>Import source</em>
            </span>
            <span>
              <strong>{guestVerificationStatus === "checking" ? "Checking" : guestVerificationStatus.replace("-", " ")}</strong>
              <em>Status</em>
            </span>
          </div>
          {guestVerification ? (
            <div className={`deck-review-card ${guestVerificationStatus}`} aria-live="polite">
              <ul className="validation-list">
                {guestVerification.messages.map((item) => (
                  <li key={item}>{item}</li>
                ))}
                {guestVerification.issues.slice(0, 8).map((issue) => (
                  <li key={`${issue.code}-${issue.cardName ?? issue.title}-${issue.detail}`} className={`validation-${issue.severity}`}>
                    <strong>{issue.title}:</strong> {issue.detail}
                  </li>
                ))}
              </ul>
              {guestVerificationStatus === "lookup-error" ? (
                <button className="text-button" onClick={() => setGuestVerificationRetry((value) => value + 1)} type="button">
                  Retry deck check
                </button>
              ) : null}
              {guestVerificationStatus === "warnings" || guestVerificationStatus === "incomplete" || guestVerificationStatus === "lookup-error" ? (
                <label className="checkbox-row">
                  <input
                    checked={acknowledgedGuestWarnings}
                    onChange={(event) => setAcknowledgedGuestWarnings(event.target.checked)}
                    type="checkbox"
                  />
                  I understand these warnings and want to continue.
                </label>
              ) : null}
            </div>
          ) : null}
          <div className="action-row">
            <button className="primary-button" disabled={isMigratingGuestDeck || guestVerificationStatus === "checking"} onClick={saveGuestDeckAndAnalyze} type="button">
              {isMigratingGuestDeck ? "Saving..." : guestVerificationStatus === "checking" ? "Checking..." : "Save Deck and Analyze"}
            </button>
            <button className="secondary-button" disabled={isMigratingGuestDeck || guestVerificationStatus === "checking"} onClick={continueWithGuestDeck} type="button">
              Continue Without Saving
            </button>
            <button className="text-button" disabled={isMigratingGuestDeck} onClick={discardGuestDeck} type="button">
              Discard Guest Deck
            </button>
          </div>
          {migrationMessage ? (
            <p className="form-message" aria-live="polite">
              {migrationMessage}
            </p>
          ) : null}
        </section>
      ) : migrationMessage ? (
        <p className="form-message" aria-live="polite">
          {migrationMessage}
        </p>
      ) : null}

      {loadError ? (
        <section className="panel compact-panel">
          <p className="eyebrow">Deck vault unavailable</p>
          <h2>Could not load your saved decks</h2>
          <p>{loadError}</p>
          <button className="secondary-button" onClick={() => setReloadKey((current) => current + 1)} type="button">
            Retry
          </button>
        </section>
      ) : deckCount === null ? (
        <section className="panel first-deck-onboarding first-deck-skeleton" aria-live="polite">
          <p className="eyebrow">First deck setup</p>
          <h2>Checking your deck vault</h2>
          <p>Opening Edge is getting your workspace ready.</p>
        </section>
      ) : deckCount === 0 ? (
        <FirstDeckOnboarding mode="account" />
      ) : (
        <>
          <DashboardOverview />
          <div className="dashboard-grid">
            <DeckSummary />
            <DashboardMetagameSnapshot />
          </div>
        </>
      )}
    </section>
  );
}
