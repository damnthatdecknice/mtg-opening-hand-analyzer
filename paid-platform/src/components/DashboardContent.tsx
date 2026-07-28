"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardActions } from "@/components/DashboardActions";
import { DashboardMetagameSnapshot } from "@/components/DashboardMetagameSnapshot";
import { DashboardOverview } from "@/components/DashboardOverview";
import { DeckSummary } from "@/components/DeckSummary";
import { FirstDeckOnboarding } from "@/components/FirstDeckOnboarding";
import { saveDeckForCurrentUser } from "@/lib/deckStorage";
import {
  clearGuestDeckIntent,
  clearGuestDeckMigrationState,
  loadGuestDeck,
  loadGuestDeckIntent,
  type GuestDeck
} from "@/lib/guestDeck";
import { parseDecklist } from "@/lib/deckParser";
import { supabase } from "@/lib/supabase";

export function DashboardContent() {
  const [deckCount, setDeckCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [guestDeck, setGuestDeck] = useState<GuestDeck | null>(null);
  const [migrationMessage, setMigrationMessage] = useState("");
  const [isMigratingGuestDeck, setIsMigratingGuestDeck] = useState(false);
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

      const { count, error } = await supabase
        .from("decks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_archived", false);

      if (error) {
        setLoadError(error.message);
        return;
      }

      setDeckCount(count ?? 0);
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
      return;
    }
    window.requestAnimationFrame(() => conversionRef.current?.focus());
  }, [guestDeck]);

  async function saveGuestDeckAndAnalyze() {
    if (!guestDeck) {
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
        {deckCount && deckCount > 0 ? <DashboardActions /> : null}
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
              <strong>{guestDeck.parsedMainCount > 0 ? "Ready to save" : "Needs review"}</strong>
              <em>Status</em>
            </span>
          </div>
          <div className="action-row">
            <button className="primary-button" disabled={isMigratingGuestDeck} onClick={saveGuestDeckAndAnalyze} type="button">
              {isMigratingGuestDeck ? "Saving..." : "Save Deck and Analyze"}
            </button>
            <button className="secondary-button" disabled={isMigratingGuestDeck} onClick={continueWithGuestDeck} type="button">
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
