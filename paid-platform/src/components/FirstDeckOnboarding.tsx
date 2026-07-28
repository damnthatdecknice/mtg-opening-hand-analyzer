"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  inferDeckName,
  parseDecklist,
  parseDekImport,
  type DeckImportMetadata
} from "@/lib/deckParser";
import { deckFormatOptions } from "@/lib/formats";
import { buildOnboardingReview, onboardingExampleDeck } from "@/lib/firstDeckOnboarding";
import { guestDeckFromParsed, saveGuestDeck, saveGuestDeckIntent } from "@/lib/guestDeck";
import { saveDeckForCurrentUser } from "@/lib/deckStorage";

type FirstDeckOnboardingProps = {
  mode: "guest" | "account";
  compact?: boolean;
  id?: string;
  requestedAction?: "none" | "example";
  onRequestedActionHandled?: () => void;
};

type EntryMode = "dek" | "paste";

export function FirstDeckOnboarding({
  mode,
  compact = false,
  id,
  requestedAction = "none",
  onRequestedActionHandled
}: FirstDeckOnboardingProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const decklistRef = useRef<HTMLTextAreaElement | null>(null);
  const [entryMode, setEntryMode] = useState<EntryMode>("dek");
  const [decklist, setDecklist] = useState("");
  const [deckName, setDeckName] = useState("");
  const [format, setFormat] = useState("Standard");
  const [importMetadata, setImportMetadata] = useState<DeckImportMetadata | undefined>();
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const parsed = useMemo(() => parseDecklist(decklist), [decklist]);
  const parsedForSave = useMemo(
    () => (importMetadata ? { ...parsed, importMetadata } : parsed),
    [importMetadata, parsed]
  );
  const review = useMemo(() => buildOnboardingReview(decklist, format, parsed), [decklist, format, parsed]);
  const resolvedName = deckName.trim() || review.suggestedName || inferDeckName(decklist);

  function focusFirstInput() {
    if (entryMode === "dek") {
      fileInputRef.current?.focus();
    } else {
      decklistRef.current?.focus();
    }
  }

  const loadExampleDeck = useCallback(() => {
    setEntryMode("paste");
    setDecklist(onboardingExampleDeck);
    setDeckName(inferDeckName(onboardingExampleDeck));
    setImportMetadata(undefined);
    setMessage("Example deck loaded. Review the counts, then continue to analysis.");
  }, []);

  useEffect(() => {
    if (requestedAction !== "example") {
      return;
    }
    loadExampleDeck();
    window.requestAnimationFrame(() => decklistRef.current?.focus());
    onRequestedActionHandled?.();
  }, [loadExampleDeck, onRequestedActionHandled, requestedAction]);

  async function handleDekUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    setMessage("");
    try {
      const imported = parseDekImport(await file.text());
      if (!imported.parsed.mainCount) {
        setMessage("We could not find any cards in that file.");
        return;
      }
      setDecklist(imported.decklist);
      setDeckName(file.name.replace(/\.dek$/i, "").replace(/^Deck\s*-\s*/i, ""));
      setImportMetadata(imported.parsed.importMetadata);
      setMessage("Your .dek import is ready to review.");
    } catch {
      setMessage("We could not read that .dek file. Check that it is your Magic Online deck export.");
    }
  }

  function storeGuestDeck() {
    saveGuestDeck(
      guestDeckFromParsed({
        decklist,
        format,
        importMetadata,
        name: resolvedName,
        parsed: parsedForSave
      })
    );
  }

  function prepareGuestSaveIntent() {
    if (parsed.mainCount > 0) {
      storeGuestDeck();
    }
    saveGuestDeckIntent({
      action: "save-after-auth",
      returnPath: "/dashboard?importGuest=1"
    });
  }

  async function analyzeGuestDeck() {
    if (parsed.mainCount === 0) {
      setMessage("Add quantities before each card name, such as \"4 Lightning Bolt.\"");
      focusFirstInput();
      return;
    }
    storeGuestDeck();
    router.push("/analyzer?guest=1&step=hand");
  }

  async function saveAndContinue() {
    if (parsed.mainCount === 0) {
      setMessage("Add at least one main-deck card before saving.");
      focusFirstInput();
      return;
    }

    setIsBusy(true);
    setMessage("");
    const result = await saveDeckForCurrentUser({
      decklist,
      format,
      name: resolvedName,
      parsedJson: parsedForSave
    });
    setIsBusy(false);

    if (result.error || !result.deckId) {
      setMessage(result.error || "Your deck could not be saved. Your decklist is still here.");
      return;
    }

    setMessage("Your deck was saved successfully. Opening the analyzer now.");
    router.push(`/analyzer?deck=${encodeURIComponent(result.deckId)}&step=hand`);
  }

  const primaryAction = mode === "account" ? saveAndContinue : analyzeGuestDeck;

  return (
    <section className={`panel first-deck-onboarding${compact ? " compact-first-deck" : ""}`} id={id} tabIndex={-1}>
      <div className="section-heading">
        <p className="eyebrow">First deck setup</p>
        <h2>Add Your First Deck</h2>
        <p>
          Import a Magic Online <code>.dek</code> file or paste a decklist. Opening Edge will
          organize the cards, check the list, and prepare it for opening-hand analysis.
        </p>
      </div>

      <ol className="onboarding-progress" aria-label="First deck progress">
        <li aria-current={!decklist ? "step" : undefined} className={decklist ? "is-complete" : "is-current"}>
          Add deck
        </li>
        <li aria-current={decklist && parsed.mainCount ? "step" : undefined} className={parsed.mainCount ? "is-current" : ""}>
          Review
        </li>
        <li>{mode === "account" ? "Save" : "Continue"}</li>
        <li>Analyze</li>
      </ol>

      <div className="deck-import-choice" role="group" aria-label="Choose deck input method">
        <button
          className={`choice-card${entryMode === "dek" ? " is-selected" : ""}`}
          aria-pressed={entryMode === "dek"}
          onClick={() => setEntryMode("dek")}
          type="button"
        >
          <strong>Import MTGO .dek</strong>
          <span>Best for Magic Online screenshots because your file includes printing details.</span>
        </button>
        <button
          className={`choice-card${entryMode === "paste" ? " is-selected" : ""}`}
          aria-pressed={entryMode === "paste"}
          onClick={() => setEntryMode("paste")}
          type="button"
        >
          <strong>Paste a Decklist</strong>
          <span>Use Arena, MTGO, Moxfield, or plain-text lists with quantities.</span>
        </button>
      </div>

      {entryMode === "dek" ? (
        <div className="import-row preferred-import-row onboarding-import-row">
          <span>
            <strong>Preferred: import your MTGO .dek</strong>
            <em>Use your actual .dek file. Card version matters for sharper screenshot matching.</em>
          </span>
          <label className="secondary-button file-button">
            Import your .dek
            <input
              ref={fileInputRef}
              accept=".dek,text/xml,application/xml"
              aria-describedby="first-deck-message"
              onChange={handleDekUpload}
              type="file"
            />
          </label>
        </div>
      ) : (
        <label className="field-stack">
          Paste decklist
          <textarea
            ref={decklistRef}
            aria-describedby="first-deck-message"
            className="analyzer-textarea first-deck-textarea"
            onChange={(event) => {
              setDecklist(event.target.value);
              setImportMetadata(undefined);
            }}
            placeholder={`Deck\n4 Lightning Bolt\n4 Monastery Swiftspear\n\nSideboard\n2 Smash to Smithereens`}
            spellCheck={false}
            value={decklist}
          />
        </label>
      )}

      <button className="text-button first-deck-example" onClick={loadExampleDeck} type="button">
        Load an Example Deck
      </button>

      <div className={`deck-review-card ${review.status}`} aria-live="polite">
        <div className="form-row">
          <label>
            Deck name
            <input
              onChange={(event) => setDeckName(event.target.value)}
              placeholder={review.suggestedName}
              value={deckName}
            />
          </label>
          <label>
            Format
            <select className="card-select" onChange={(event) => setFormat(event.target.value)} value={format}>
              {deckFormatOptions.map((deckFormat) => (
                <option key={deckFormat} value={deckFormat}>
                  {deckFormat}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mini-metrics">
          <span>{review.mainCount} main</span>
          <span>{review.sideboardCount} sideboard</span>
          <span>{review.uniqueCount} unique rows</span>
          <span>{importMetadata?.source === "mtgo_dek" ? ".dek import" : "decklist"}</span>
        </div>

        <ul className="validation-list">
          {review.messages.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="action-row first-deck-actions">
        <button className="primary-button" disabled={isBusy} onClick={primaryAction} type="button">
          {isBusy ? "Saving..." : mode === "account" ? "Save Deck and Continue" : "Analyze This Deck"}
        </button>
        {mode === "account" ? (
          <button className="secondary-button" disabled={isBusy} onClick={analyzeGuestDeck} type="button">
            Continue Without Saving
          </button>
        ) : (
          <>
            <Link className="secondary-button" href="/signup?intent=save-guest-deck" onClick={prepareGuestSaveIntent}>
              Create an Account to Save It
            </Link>
            <Link className="text-button" href="/login?intent=save-guest-deck" onClick={prepareGuestSaveIntent}>
              Sign in to Save It
            </Link>
          </>
        )}
      </div>

      {(message || review.status === "ready") ? (
        <p className="form-message" id="first-deck-message" aria-live="polite">
          {message || "Your deck is ready to analyze."}
        </p>
      ) : null}
    </section>
  );
}
