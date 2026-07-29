"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { inferDeckName, parseDecklist, parseDekImport, type DeckImportMetadata } from "@/lib/deckParser";
import type { DeckInsert, DeckVersion, SavedDeck } from "@/lib/decks";
import { saveDeckForCurrentUser } from "@/lib/deckStorage";
import { diffDecklistsBySection } from "@/lib/deckVersionDiff";
import { deckFormatOptions } from "@/lib/formats";
import { fetchCardData } from "@/lib/analyzer";
import {
  gateDeckVerification,
  onboardingExampleDeck,
  verifyDeckForSaving,
  type OnboardingDeckReview,
  type OnboardingValidationStatus
} from "@/lib/firstDeckOnboarding";
import { supabase } from "@/lib/supabase";
import { useEntitlements } from "@/components/useEntitlements";

type ExportFormat = "arena" | "mtgo" | "plain" | "moxfield";

function formatSection(cards: ReturnType<typeof parseDecklist>["cards"], section: "main" | "sideboard") {
  return cards
    .filter((card) => card.section === section)
    .map((card) => `${card.qty} ${card.name}`)
    .join("\n");
}

function exportDecklist(decklist: string, format: ExportFormat) {
  const parsed = parseDecklist(decklist);
  const main = formatSection(parsed.cards, "main");
  const sideboard = formatSection(parsed.cards, "sideboard");

  if (format === "plain") {
    return [main, sideboard ? `Sideboard\n${sideboard}` : ""].filter(Boolean).join("\n\n");
  }
  if (format === "moxfield") {
    return [main, sideboard ? `SIDEBOARD:\n${sideboard}` : ""].filter(Boolean).join("\n\n");
  }
  if (format === "mtgo") {
    return [main, sideboard ? `Sideboard\n${sideboard}` : ""].filter(Boolean).join("\n\n");
  }
  return [`Deck\n${main}`, sideboard ? `Sideboard\n${sideboard}` : ""].filter(Boolean).join("\n\n");
}

export function DeckLibrary() {
  const entitlements = useEntitlements();
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [name, setName] = useState("");
  const [format, setFormat] = useState("Standard");
  const [decklist, setDecklist] = useState("");
  const [importMetadata, setImportMetadata] = useState<DeckImportMetadata | undefined>();
  const [editingDeck, setEditingDeck] = useState<SavedDeck | null>(null);
  const [versions, setVersions] = useState<DeckVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [verification, setVerification] = useState<OnboardingDeckReview | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<OnboardingValidationStatus>("checking");
  const [acknowledgedWarnings, setAcknowledgedWarnings] = useState(false);
  const [verificationRetry, setVerificationRetry] = useState(0);

  const parsed = useMemo(() => parseDecklist(decklist), [decklist]);
  const parsedForSave = useMemo(
    () => (importMetadata ? { ...parsed, importMetadata } : parsed),
    [importMetadata, parsed]
  );
  const activeDecks = decks.filter((deck) => !deck.is_archived);
  const visibleDecks = decks.filter((deck) => showArchived || !deck.is_archived);
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? versions[0];
  const versionDiff = selectedVersion ? diffDecklistsBySection(selectedVersion.decklist, decklist).slice(0, 12) : [];

  useEffect(() => {
    if (entitlements.canUseDeckVault) {
      loadDecks();
    }
  }, [entitlements.canUseDeckVault]);

  useEffect(() => {
    setAcknowledgedWarnings(false);

    if (!decklist.trim() || parsed.mainCount === 0) {
      setVerification({
        suggestedName: inferDeckName(decklist),
        mainCount: parsed.mainCount,
        sideboardCount: parsed.sideboardCount,
        uniqueCount: parsed.cards.length,
        status: "empty",
        messages: ["Paste a decklist or import your MTGO .dek to begin."],
        issues: []
      });
      setVerificationStatus("empty");
      return;
    }

    setVerificationStatus("checking");
    setVerification({
      suggestedName: inferDeckName(decklist),
      mainCount: parsed.mainCount,
      sideboardCount: parsed.sideboardCount,
      uniqueCount: parsed.cards.length,
      status: "checking",
      messages: ["Checking card names, deck construction, and available format legality..."],
      issues: []
    });

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      verifyDeckForSaving(decklist, format, fetchCardData, controller.signal, { retryFailures: verificationRetry > 0 })
        .then((result) => {
          if (controller.signal.aborted) {
            return;
          }
          setVerification(result);
          setVerificationStatus(result.status);
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          setVerification({
            suggestedName: inferDeckName(decklist),
            mainCount: parsed.mainCount,
            sideboardCount: parsed.sideboardCount,
            uniqueCount: parsed.cards.length,
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
          setVerificationStatus("lookup-error");
        });
    }, 650);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [decklist, format, parsed.cards.length, parsed.mainCount, parsed.sideboardCount, verificationRetry]);

  async function loadDecks() {
    if (!supabase) {
      return;
    }

    setIsBusy(true);
    const { data, error } = await supabase
      .from("decks")
      .select("*")
      .order("updated_at", { ascending: false });

    setIsBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setDecks((data ?? []) as SavedDeck[]);
  }

  async function loadVersions(deckId: string) {
    if (!supabase) {
      return;
    }
    const { data, error } = await supabase
      .from("deck_versions")
      .select("*")
      .eq("deck_id", deckId)
      .order("version_number", { ascending: false });

    if (error) {
      setVersions([]);
      return;
    }

    const nextVersions = (data ?? []) as DeckVersion[];
    setVersions(nextVersions);
    setSelectedVersionId(nextVersions[0]?.id ?? "");
  }

  function startEditing(deck: SavedDeck) {
    setEditingDeck(deck);
    setName(deck.name);
    setFormat(deck.format ?? "Standard");
    setDecklist(deck.decklist);
    setImportMetadata(deck.parsed_json.importMetadata);
    setMessage(`Editing ${deck.name}. Saving will create a version history entry.`);
    void loadVersions(deck.id);
  }

  function cancelEditing() {
    setEditingDeck(null);
    setVersions([]);
    setSelectedVersionId("");
    setName("");
    setFormat("Standard");
    setDecklist("");
    setImportMetadata(undefined);
    setMessage("");
  }

  function loadExampleDeck() {
    setEditingDeck(null);
    setVersions([]);
    setSelectedVersionId("");
    setName("Monastery Swiftspear Deck");
    setFormat("Standard");
    setDecklist(onboardingExampleDeck);
    setImportMetadata(undefined);
    setMessage("Example deck loaded. Review it, then save only if you want this sample in your vault.");
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!supabase) {
      setMessage("Supabase is not configured yet.");
      return;
    }

    if (!entitlements.canUseDeckVault) {
      setMessage("Saved decklists are disabled for this account state. During open beta, they should be included.");
      return;
    }

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setMessage("Sign in before saving a deck.");
      return;
    }

    if (parsed.mainCount === 0) {
      setMessage("Paste a decklist with at least one main-deck card.");
      return;
    }

    const gate = gateDeckVerification(verificationStatus, acknowledgedWarnings, parsed.mainCount);
    if (!gate.allowed) {
      setMessage(gate.message ?? "Review this deck before saving.");
      return;
    }

    const deck: DeckInsert = {
      user_id: userData.user.id,
      name: name.trim() || inferDeckName(decklist),
      format: format.trim() || null,
      decklist,
      sideboard: parsed.cards
        .filter((card) => card.section === "sideboard")
        .map((card) => `${card.qty} ${card.name}`)
        .join("\n"),
      parsed_json: parsedForSave
    };

    setIsBusy(true);
    let error;
    if (editingDeck) {
      const updateResult = await supabase.rpc("update_deck_with_version", {
        p_deck_id: editingDeck.id,
        p_name: deck.name,
        p_format: deck.format,
        p_decklist: deck.decklist,
        p_sideboard: deck.sideboard,
        p_parsed_json: deck.parsed_json
      });
      error = updateResult.error;
    } else {
      const insertResult = await saveDeckForCurrentUser({
        decklist,
        format,
        name: name.trim() || inferDeckName(decklist),
        parsedJson: parsedForSave
      });
      error = insertResult.error ? { message: insertResult.error } : null;
    }
    setIsBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setName("");
    setEditingDeck(null);
    setVersions([]);
    setSelectedVersionId("");
    setDecklist("");
    setImportMetadata(undefined);
    setMessage(editingDeck ? "Deck updated. Previous 75 saved to version history." : "Deck saved.");
    await loadDecks();
  }

  async function copyExport(deck: SavedDeck, exportFormat: ExportFormat) {
    const label =
      exportFormat === "arena" ? "Arena" : exportFormat === "mtgo" ? "MTGO" : exportFormat === "moxfield" ? "Moxfield" : "plain text";
    try {
      await navigator.clipboard.writeText(exportDecklist(deck.decklist, exportFormat));
      setMessage(`${deck.name} copied as ${label}.`);
    } catch {
      setMessage("Could not copy to clipboard.");
    }
  }

  async function setArchived(deck: SavedDeck, isArchived: boolean) {
    if (!supabase) {
      return;
    }

    setIsBusy(true);
    const { error } = await supabase
      .from("decks")
      .update({ is_archived: isArchived, updated_at: new Date().toISOString() })
      .eq("id", deck.id);
    setIsBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadDecks();
  }

  async function handleDekUpload(file: File) {
    setMessage("");
    try {
      const imported = parseDekImport(await file.text());
      const converted = imported.decklist;
      const convertedParsed = imported.parsed;
      if (!convertedParsed.mainCount) {
        setMessage("That .dek file did not contain any main-deck cards.");
        return;
      }
      setDecklist(converted);
      setImportMetadata(imported.parsed.importMetadata);
      if (!name.trim()) {
        setName(file.name.replace(/\.dek$/i, "").replace(/^Deck\s*-\s*/i, ""));
      }
      setMessage(
        `Imported .dek file: ${convertedParsed.mainCount} main, ${convertedParsed.sideboardCount} sideboard. Preferred .dek matching will be saved for Magic Online screenshots.`
      );
    } catch {
      setMessage("Could not import that .dek file.");
    }
  }

  return (
    !entitlements.canUseDeckVault && !entitlements.isLoading ? (
      <section className="panel locked-feature-panel">
        <p className="eyebrow">Deck vault</p>
        <h1>Saved decks are unavailable</h1>
        <p>
          Saved decks are included during open beta. If you see this message,
          your account access could not be verified.
        </p>
        <Link className="primary-button" href="/pricing">
          View tiers
        </Link>
      </section>
    ) :
    <div className="deck-page-grid">
      <section className="panel deck-editor-panel">
        <div className="section-heading">
          <p className="eyebrow">Deck library</p>
          <h1>Save a Deck</h1>
          <p>
            Paste an Arena-style list. Put `Sideboard` on its own line when the
            sideboard starts.
          </p>
          {editingDeck ? (
            <div className="editing-banner">
              <span>Editing {editingDeck.name}</span>
              <button className="text-button" onClick={cancelEditing} type="button">
                Cancel edit
              </button>
            </div>
          ) : null}
          {!editingDeck ? (
            <button className="secondary-button" onClick={loadExampleDeck} type="button">
              Load Example Deck
            </button>
          ) : null}
        </div>

        <form className="deck-form" onSubmit={handleSave}>
          <div className="form-row">
            <label>
              Deck name
              <input
                onChange={(event) => setName(event.target.value)}
                placeholder={inferDeckName(decklist)}
                value={name}
              />
            </label>
            <label>
              Format
              <select
                className="card-select"
                onChange={(event) => setFormat(event.target.value)}
                value={format}
              >
                {deckFormatOptions.map((deckFormat) => (
                  <option key={deckFormat} value={deckFormat}>
                    {deckFormat}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="import-row preferred-import-row">
            <span>
              <strong>Preferred: import your MTGO .dek</strong>
              <em>Use your actual .dek file for sharper Magic Online screenshot recognition.</em>
            </span>
            <label className="secondary-button file-button">
              Import your .dek
              <input
                accept=".dek,text/xml,application/xml"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleDekUpload(file);
                  event.currentTarget.value = "";
                }}
                type="file"
              />
            </label>
          </div>
          <label>
            Decklist
            <textarea
              onChange={(event) => {
                setDecklist(event.target.value);
                setImportMetadata(undefined);
              }}
              spellCheck={false}
              value={decklist}
            />
          </label>
          <div className="deck-save-row">
            <div className="mini-metrics">
              <span>{parsed.mainCount} main</span>
              <span>{parsed.sideboardCount} sideboard</span>
              <span>{parsed.cards.length} unique rows</span>
              {importMetadata?.source === "mtgo_dek" ? (
                <span>.dek import ready</span>
              ) : null}
              <span>{verificationStatus === "checking" ? "checking" : verificationStatus.replace("-", " ")}</span>
            </div>
            <button className="primary-button" disabled={isBusy || verificationStatus === "checking" || parsed.mainCount === 0} type="submit">
              {isBusy ? "Saving..." : verificationStatus === "checking" ? "Checking..." : editingDeck ? "Save new version" : "Save deck"}
            </button>
          </div>
          {verification ? (
            <div className={`deck-review-card ${verificationStatus}`} aria-live="polite">
              <ul className="validation-list">
                {verification.messages.map((item) => (
                  <li key={item}>{item}</li>
                ))}
                {verification.issues.slice(0, 8).map((issue) => (
                  <li key={`${issue.code}-${issue.cardName ?? issue.title}-${issue.detail}`} className={`validation-${issue.severity}`}>
                    <strong>{issue.title}:</strong> {issue.detail}
                  </li>
                ))}
              </ul>
              {verificationStatus === "lookup-error" ? (
                <button className="text-button" onClick={() => setVerificationRetry((value) => value + 1)} type="button">
                  Retry deck check
                </button>
              ) : null}
              {verificationStatus === "warnings" || verificationStatus === "incomplete" || verificationStatus === "lookup-error" ? (
                <label className="checkbox-row">
                  <input
                    checked={acknowledgedWarnings}
                    onChange={(event) => setAcknowledgedWarnings(event.target.checked)}
                    type="checkbox"
                  />
                  I understand these warnings and want to save this deck.
                </label>
              ) : null}
            </div>
          ) : null}
        </form>

        {editingDeck ? (
          <section className="version-history-panel">
            <div className="section-heading split-heading">
              <div>
                <p className="eyebrow">Version history</p>
                <h2>Compare old/new 75</h2>
              </div>
              {versions.length ? (
                <select
                  className="card-select"
                  onChange={(event) => setSelectedVersionId(event.target.value)}
                  value={selectedVersionId}
                >
                  {versions.map((version) => (
                    <option key={version.id} value={version.id}>
                      Version {version.version_number} - {new Date(version.created_at).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            {selectedVersion ? (
              versionDiff.length ? (
                <div className="table-wrap compact-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Section</th>
                        <th>Card</th>
                        <th>Old</th>
                        <th>New</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {versionDiff.map((row) => (
                        <tr key={row.key}>
                          <td>{row.section === "main" ? "Main" : "Sideboard"}</td>
                          <td>{row.name}</td>
                          <td>{row.oldQty}</td>
                          <td>{row.newQty}</td>
                          <td>{row.delta > 0 ? `+${row.delta}` : row.delta}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted-copy">No card-count changes versus this saved version.</p>
              )
            ) : (
              <p className="muted-copy">No previous versions yet. The next edit you save will create one.</p>
            )}
          </section>
        ) : null}

        {message ? <p className="form-message">{message}</p> : null}
      </section>

      <section className="panel deck-list-panel">
        <div className="section-heading split-heading">
          <div>
            <p className="eyebrow">Vault</p>
            <h2>{activeDecks.length} Active Decks</h2>
          </div>
          <button
            className="text-button"
            onClick={() => setShowArchived((value) => !value)}
            type="button"
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </button>
        </div>

        <div className="list-stack">
          {visibleDecks.length ? (
            visibleDecks.map((deck) => (
              <article className="deck-row" key={deck.id}>
                <div>
                  <strong>{deck.name}</strong>
                  <span>
                    {deck.format || "Unspecified"} | {deck.parsed_json.mainCount ?? 0} main |{" "}
                    {deck.parsed_json.sideboardCount ?? 0} sideboard
                    {deck.parsed_json.importMetadata?.source === "mtgo_dek" ? " | .dek import" : ""}
                  </span>
                </div>
                <div className="deck-row-actions">
                  <Link className="text-button" href={`/analyzer?deck=${deck.id}&step=hand`}>
                    Analyze
                  </Link>
                  <button className="text-button" onClick={() => startEditing(deck)} type="button">
                    Edit
                  </button>
                  <button className="text-button" onClick={() => copyExport(deck, "arena")} type="button">
                    Arena
                  </button>
                  <button className="text-button" onClick={() => copyExport(deck, "mtgo")} type="button">
                    MTGO
                  </button>
                  <button className="text-button" onClick={() => copyExport(deck, "plain")} type="button">
                    Text
                  </button>
                  <button className="text-button" onClick={() => copyExport(deck, "moxfield")} type="button">
                    Moxfield
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setArchived(deck, !deck.is_archived)}
                    type="button"
                  >
                    {deck.is_archived ? "Restore" : "Archive"}
                  </button>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-state">
              <strong>No saved decks yet</strong>
              <span>Save your first list and it will appear here.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
