"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { inferDeckName, parseDecklist, parseDekImport, type DeckImportMetadata } from "@/lib/deckParser";
import type { DeckInsert, DeckVersion, SavedDeck } from "@/lib/decks";
import { supabase } from "@/lib/supabase";
import { useEntitlements } from "@/components/useEntitlements";

const defaultDecklist = `Deck
4 Monastery Swiftspear
4 Lightning Strike
4 Play with Fire
4 Phoenix Chick
4 Kumano Faces Kakkazan
4 Charming Scoundrel
4 Imodane's Recruiter
4 Warden of the Inner Sky
4 Inspiring Vantage
4 Battlefield Forge
12 Mountain
8 Plains

Sideboard
3 Destroy Evil
2 Lithomantic Barrage`;

const deckFormats = [
  "Standard",
  "Pioneer",
  "Modern",
  "Legacy",
  "Draft",
  "Commander",
  "Brawl",
  "Vintage",
  "Penny Dreadful",
  "Premodern",
  "Historic",
  "Explorer"
];

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

function diffDecklists(oldDecklist: string, newDecklist: string) {
  const oldCards = parseDecklist(oldDecklist).cards;
  const newCards = parseDecklist(newDecklist).cards;
  const oldCounts = new Map(oldCards.map((card) => [`${card.section}:${card.name}`, card.qty]));
  const newCounts = new Map(newCards.map((card) => [`${card.section}:${card.name}`, card.qty]));
  return Array.from(new Set([...Array.from(oldCounts.keys()), ...Array.from(newCounts.keys())]))
    .map((key) => {
      const [, name] = key.split(":");
      const oldQty = oldCounts.get(key) ?? 0;
      const newQty = newCounts.get(key) ?? 0;
      return { name, oldQty, newQty, delta: newQty - oldQty };
    })
    .filter((row) => row.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.name.localeCompare(b.name));
}

export function DeckLibrary() {
  const entitlements = useEntitlements();
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [name, setName] = useState("");
  const [format, setFormat] = useState("Standard");
  const [decklist, setDecklist] = useState(defaultDecklist);
  const [importMetadata, setImportMetadata] = useState<DeckImportMetadata | undefined>();
  const [editingDeck, setEditingDeck] = useState<SavedDeck | null>(null);
  const [versions, setVersions] = useState<DeckVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const parsed = useMemo(() => parseDecklist(decklist), [decklist]);
  const parsedForSave = useMemo(
    () => (importMetadata ? { ...parsed, importMetadata } : parsed),
    [importMetadata, parsed]
  );
  const activeDecks = decks.filter((deck) => !deck.is_archived);
  const visibleDecks = decks.filter((deck) => showArchived || !deck.is_archived);
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) ?? versions[0];
  const versionDiff = selectedVersion ? diffDecklists(selectedVersion.decklist, decklist).slice(0, 12) : [];

  useEffect(() => {
    if (entitlements.canUseDeckVault) {
      loadDecks();
    }
  }, [entitlements.canUseDeckVault]);

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
    setImportMetadata(undefined);
    setMessage("");
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!supabase) {
      setMessage("Supabase is not configured yet.");
      return;
    }

    if (!entitlements.canUseDeckVault) {
      setMessage("Saved decklists unlock with the $5/month Deck Pro tier.");
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
      const previousVersionNumber = versions[0]?.version_number ?? 0;
      const versionResult = await supabase.from("deck_versions").insert({
        deck_id: editingDeck.id,
        user_id: userData.user.id,
        version_number: previousVersionNumber + 1,
        name: editingDeck.name,
        format: editingDeck.format,
        decklist: editingDeck.decklist,
        sideboard: editingDeck.sideboard,
        parsed_json: editingDeck.parsed_json
      });
      if (versionResult.error) {
        setIsBusy(false);
        setMessage(`Could not create deck version history: ${versionResult.error.message}`);
        return;
      }
      const updateResult = await supabase
        .from("decks")
        .update({ ...deck, updated_at: new Date().toISOString() })
        .eq("id", editingDeck.id);
      error = updateResult.error;
    } else {
      const insertResult = await supabase.from("decks").insert(deck);
      error = insertResult.error;
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
        <p className="eyebrow">Deck Pro</p>
        <h1>Decklists unlock at $5/month</h1>
        <p>
          The analyzer stays available on Free. Saving decks, managing the deck
          vault, and loading remembered decklists are Deck Pro features.
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
                {deckFormats.map((deckFormat) => (
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
            </div>
            <button className="primary-button" disabled={isBusy} type="submit">
              {isBusy ? "Saving..." : editingDeck ? "Save new version" : "Save deck"}
            </button>
          </div>
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
                        <th>Card</th>
                        <th>Old</th>
                        <th>New</th>
                        <th>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {versionDiff.map((row) => (
                        <tr key={row.name}>
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
                  <Link className="text-button" href={`/analyzer?deckId=${deck.id}`}>
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
