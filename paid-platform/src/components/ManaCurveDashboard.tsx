"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { fetchCardData, type CardLookup } from "@/lib/analyzer";
import { parseDecklist } from "@/lib/deckParser";
import type { SavedDeck } from "@/lib/decks";
import { deckFormatOptions } from "@/lib/formats";
import {
  buildManaCurveAnalysis,
  cardTypeKeys,
  extractTournamentCurveCandidateNames,
  type ManaCurveAnalysis
} from "@/lib/manaCurve";
import { isMetagameFormat, type MetagameDeck, type MetagameResponse } from "@/lib/metagame";
import { supabase } from "@/lib/supabase";
import { useEntitlements } from "@/components/useEntitlements";

type CurveScope = ManaCurveAnalysis["scope"];
type CurveDisplayMode = "counts" | "percentages";
type DeckInputMode = "saved" | "pasted";

const scopeOptions: Array<{ value: CurveScope; label: string }> = [
  { value: "main", label: "Main deck" },
  { value: "main+sideboard", label: "Main + sideboard" },
  { value: "sideboard", label: "Sideboard only" }
];

const typeLabels: Record<(typeof cardTypeKeys)[number], string> = {
  creatures: "Creatures",
  instants: "Instants",
  sorceries: "Sorceries",
  artifacts: "Artifacts",
  enchantments: "Enchantments",
  planeswalkers: "Planeswalkers",
  battles: "Battles",
  lands: "Lands",
  other: "Other"
};

const typeColors: Record<(typeof cardTypeKeys)[number], string> = {
  creatures: "#59b9e8",
  instants: "#8c7cff",
  sorceries: "#f0a62b",
  artifacts: "#9eadb1",
  enchantments: "#58a7a0",
  planeswalkers: "#b56a86",
  battles: "#c3636d",
  lands: "#70f2a4",
  other: "#687a80"
};

export function ManaCurveDashboard() {
  const entitlements = useEntitlements();
  const searchParams = useSearchParams();
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [deckInputMode, setDeckInputMode] = useState<DeckInputMode>("saved");
  const [pastedDecklist, setPastedDecklist] = useState("");
  const [pastedFormat, setPastedFormat] = useState("Standard");
  const [displayMode, setDisplayMode] = useState<CurveDisplayMode>("counts");
  const [scope, setScope] = useState<CurveScope>("main");
  const [cardData, setCardData] = useState<Map<string, CardLookup>>(new Map());
  const [metagameDecks, setMetagameDecks] = useState<MetagameDeck[]>([]);
  const [isLoadingDecks, setIsLoadingDecks] = useState(true);
  const [isLoadingCards, setIsLoadingCards] = useState(false);
  const [message, setMessage] = useState("");

  const selectedDeck = decks.find((deck) => deck.id === selectedDeckId) ?? decks[0] ?? null;
  const activeDecklist = deckInputMode === "pasted" ? pastedDecklist : selectedDeck?.decklist ?? "";
  const activeFormat = deckInputMode === "pasted" ? pastedFormat : selectedDeck?.format ?? "Standard";
  const analysis = useMemo(
    () =>
      activeDecklist.trim()
        ? buildManaCurveAnalysis(activeDecklist, cardData, {
            format: activeFormat,
            scope,
            metagameDecks
          })
        : null,
    [activeDecklist, activeFormat, cardData, metagameDecks, scope]
  );

  useEffect(() => {
    if (!supabase || !entitlements.canUseDeckVault) {
      setIsLoadingDecks(false);
      return;
    }

    supabase
      .from("decks")
      .select("*")
      .eq("is_archived", false)
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setMessage(error.message);
          setIsLoadingDecks(false);
          return;
        }
        const nextDecks = (data ?? []) as SavedDeck[];
        setDecks(nextDecks);
        const requested = searchParams.get("deck");
        const remembered = window.localStorage.getItem("opening-edge:last-curve-deck-id") ?? "";
        const nextId = nextDecks.find((deck) => deck.id === requested)?.id ?? nextDecks.find((deck) => deck.id === remembered)?.id ?? nextDecks[0]?.id ?? "";
        setSelectedDeckId(nextId);
        setIsLoadingDecks(false);
      });
  }, [entitlements.canUseDeckVault, searchParams]);

  useEffect(() => {
    if (!selectedDeck) {
      return;
    }
    window.localStorage.setItem("opening-edge:last-curve-deck-id", selectedDeck.id);
  }, [selectedDeck]);

  useEffect(() => {
    let isActive = true;
    async function loadMetagame() {
      if (!activeFormat || !isMetagameFormat(activeFormat)) {
        setMetagameDecks([]);
        return;
      }
      try {
        const response = await fetch(`/api/metagame?format=${encodeURIComponent(activeFormat)}&windowDays=7&v=6`, {
          cache: "no-store"
        });
        if (!response.ok) {
          throw new Error("Metagame snapshot unavailable.");
        }
        const data = (await response.json()) as MetagameResponse;
        if (isActive) {
          setMetagameDecks(data.decks);
        }
      } catch {
        if (isActive) {
          setMetagameDecks([]);
        }
      }
    }

    void loadMetagame();
    return () => {
      isActive = false;
    };
  }, [activeFormat]);

  useEffect(() => {
    let isActive = true;
    async function loadCards() {
      if (!activeDecklist.trim()) {
        setCardData(new Map());
        return;
      }
      setIsLoadingCards(true);
      setMessage("");
      const parsed = parseDecklist(activeDecklist);
      const deckNames = parsed.cards.map((card) => card.name);
      const candidateNames = extractTournamentCurveCandidateNames(activeDecklist, metagameDecks);
      const { lookups, failures } = await fetchCardData([...deckNames, ...candidateNames]);
      if (!isActive) {
        return;
      }
      setCardData(lookups);
      setMessage(failures.length ? `Some card data could not load: ${failures.slice(0, 3).join(", ")}` : "");
      setIsLoadingCards(false);
    }

    void loadCards();
    return () => {
      isActive = false;
    };
  }, [activeDecklist, metagameDecks]);

  if (!entitlements.canUseDeckVault && !entitlements.isLoading) {
    return (
      <section className="panel locked-feature-panel">
        <p className="eyebrow">Deck Pro</p>
        <h1>Mana Curve unlocks with saved decks</h1>
        <p>Save decks to compare curves, card types, and tournament-informed structural suggestions.</p>
        <Link className="primary-button" href="/pricing">
          View tiers
        </Link>
      </section>
    );
  }

  return (
    <div className="mana-curve-page">
      <section className="hero-panel compact-hero-panel">
        <p className="eyebrow">Deck engineering</p>
        <h1>Mana Curve Lab</h1>
        <p>Review saved deck curves, card-type structure, land counts, and similar Challenge-shell pressure points.</p>
      </section>

      <section className="panel mana-curve-controls">
        <label>
          Analyze
          <select className="card-select" onChange={(event) => setDeckInputMode(event.target.value as DeckInputMode)} value={deckInputMode}>
            <option value="saved">Saved deck</option>
            <option value="pasted">Pasted deck</option>
          </select>
        </label>
        {deckInputMode === "saved" ? (
        <label>
          Saved deck
          <select
            className="card-select"
            disabled={isLoadingDecks || !decks.length}
            onChange={(event) => setSelectedDeckId(event.target.value)}
            value={selectedDeckId}
          >
            {decks.length ? (
              decks.map((deck) => (
                <option key={deck.id} value={deck.id}>
                  {deck.name} {deck.format ? `(${deck.format})` : ""}
                </option>
              ))
            ) : (
              <option value="">No saved decks</option>
            )}
          </select>
        </label>
        ) : (
          <label>
            Format
            <select className="card-select" onChange={(event) => setPastedFormat(event.target.value)} value={pastedFormat}>
              {deckFormatOptions.map((formatOption) => (
                <option key={formatOption} value={formatOption}>
                  {formatOption}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Scope
          <select className="card-select" onChange={(event) => setScope(event.target.value as CurveScope)} value={scope}>
            {scopeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Display
          <select className="card-select" onChange={(event) => setDisplayMode(event.target.value as CurveDisplayMode)} value={displayMode}>
            <option value="counts">Counts</option>
            <option value="percentages">Percentages</option>
          </select>
        </label>
        <Link className="secondary-button" href="/decks">
          Save a Deck
        </Link>
      </section>

      {deckInputMode === "pasted" ? (
        <section className="panel mana-curve-paste-panel">
          <label>
            Paste a decklist
            <textarea
              onChange={(event) => setPastedDecklist(event.target.value)}
              placeholder="Paste MTG Arena or plain text decklist here. This does not save the deck."
              spellCheck={false}
              value={pastedDecklist}
            />
          </label>
        </section>
      ) : null}

      {message ? <p className="form-message">{message}</p> : null}
      {isLoadingCards ? <p className="muted-copy">Loading Scryfall card data...</p> : null}

      {analysis ? (
        <>
          <section className="curve-metrics">
            <div className="metric-card">
              <span>Lands</span>
              <strong>{analysis.landCount}</strong>
            </div>
            <div className="metric-card">
              <span>Spell cards</span>
              <strong>{analysis.physicalSpellCount}</strong>
              <em className="metric-impact neutral">physical copies</em>
            </div>
            <div className="metric-card">
              <span>Casting modes</span>
              <strong>{analysis.castModeCount}</strong>
              <em className="metric-impact neutral">{analysis.castModeCount - analysis.physicalSpellCount} extra modes</em>
            </div>
            <div className="metric-card">
              <span>Avg physical MV</span>
              <strong>{analysis.averageManaValue.toFixed(2)}</strong>
              <em className="metric-impact neutral">lowest castable mode</em>
            </div>
            <div className="metric-card">
              <span>Median physical MV</span>
              <strong>{analysis.medianManaValue.toFixed(1)}</strong>
              <em className="metric-impact neutral">copy-weighted</em>
            </div>
          </section>

          <section className="mana-curve-grid">
            <CurvePanel analysis={analysis} displayMode={displayMode} />
            <TypeBreakdownPanel analysis={analysis} />
          </section>

          <section className="mana-curve-grid">
            <PosturePanel analysis={analysis} />
            <ComparisonPanel analysis={analysis} />
          </section>

          <ManaDemandPanel analysis={analysis} />

          <section className="mana-curve-grid">
            <ObservationPanel analysis={analysis} />
            <SuggestionPanel analysis={analysis} hasMetagame={Boolean(metagameDecks.length)} />
          </section>
        </>
      ) : (
        <section className="panel">
          <div className="empty-state">
            <strong>No deck selected</strong>
            <span>Choose a saved deck or paste a decklist to inspect its curve.</span>
          </div>
        </section>
      )}
    </div>
  );
}

function postureLabel(posture: ManaCurveAnalysis["posture"]["posture"]) {
  if (posture === "unknown") {
    return "Mixed / unknown";
  }
  return posture.charAt(0).toUpperCase() + posture.slice(1);
}

function PosturePanel({ analysis }: { analysis: ManaCurveAnalysis }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <p className="eyebrow">Deck posture</p>
        <h2>{postureLabel(analysis.posture.posture)}</h2>
      </div>
      <div className="posture-summary">
        <strong>{analysis.posture.confidence} confidence</strong>
        <span>
          The curve observations are compared against {analysis.posture.posture === "unknown" ? "broad structural" : analysis.posture.posture} expectations for {analysis.format}.
        </span>
      </div>
      <div className="mini-table-stack">
        {analysis.posture.evidence.length ? (
          analysis.posture.evidence.map((evidence) => <span key={evidence}>{evidence}</span>)
        ) : (
          <span>No single posture signal dominated.</span>
        )}
      </div>
    </section>
  );
}

function CurvePanel({ analysis, displayMode }: { analysis: ManaCurveAnalysis; displayMode: CurveDisplayMode }) {
  const maxCount = Math.max(1, ...analysis.curve.map((row) => row.spells));
  const total = Math.max(1, analysis.castModeCount);
  const stackTypes = cardTypeKeys.filter((type) => type !== "lands");
  return (
    <section className="panel curve-panel mana-curve-wide-panel">
      <div className="section-heading split-heading">
        <div>
          <p className="eyebrow">Cast-mode curve</p>
          <h2>Spell Mana Values</h2>
        </div>
        <span className="muted-copy">{displayMode === "percentages" ? "% of modes" : analysis.scope}</span>
      </div>
      {analysis.curve.map((row) => (
        <div className="curve-row stacked-curve-row" key={row.manaValue}>
          <span>{row.manaValue}</span>
          <div>
            <span className="stacked-curve-track" style={{ width: `${(row.spells / maxCount) * 100}%` }}>
              {stackTypes.map((type) => {
                const count = row.types[type];
                const tooltip = formatCurveTooltip(typeLabels[type], row.cards[type]);
                return count ? (
                  <i
                    aria-label={tooltip}
                    key={type}
                    style={{ background: typeColors[type], width: `${(count / Math.max(1, row.spells)) * 100}%` }}
                    tabIndex={0}
                  >
                    <span className="curve-segment-tooltip">{tooltip}</span>
                  </i>
                ) : null;
              })}
            </span>
          </div>
          <strong>{displayMode === "percentages" ? `${Math.round((row.spells / total) * 100)}%` : row.spells}</strong>
        </div>
      ))}
      <p className="muted-copy">
        Lands are excluded. Physical-card averages count each card once at its lowest castable nonland mode; cast-mode bars show separate playable halves where appropriate.
      </p>
    </section>
  );
}

function formatCurveTooltip(typeLabel: string, cards: Array<{ name: string; qty: number }>) {
  const cardText = cards.length
    ? cards
        .slice()
        .sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name))
        .map((card) => `${card.name} x${card.qty}`)
        .join(", ")
    : "No cards";
  return `${typeLabel}: ${cardText}`;
}

function TypeBreakdownPanel({ analysis }: { analysis: ManaCurveAnalysis }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <p className="eyebrow">Card types</p>
        <h2>Primary Type Breakdown</h2>
      </div>
      <div className="type-breakdown-grid">
        {cardTypeKeys.map((type) => (
          <span key={type}>
            <em style={{ background: typeColors[type] }} />
            {typeLabels[type]}
            <strong>{analysis.typeBreakdown[type]}</strong>
          </span>
        ))}
      </div>
      <p className="muted-copy">
        Physical cards are assigned one primary role, so artifact creatures are not double-counted.
        {analysis.modalSourceCount ? ` ${analysis.modalSourceCount} modal land/spell source(s) detected.` : ""}
      </p>
    </section>
  );
}

function ManaDemandPanel({ analysis }: { analysis: ManaCurveAnalysis }) {
  const colors = ["W", "U", "B", "R", "G"] as const;
  return (
    <section className="panel">
      <div className="section-heading">
        <p className="eyebrow">Mana pressure</p>
        <h2>Colored Pips vs Sources</h2>
      </div>
      <div className="mana-demand-grid">
        {colors.map((color) => (
          <div className="mana-demand-row" key={color}>
            <strong>{color}</strong>
            <span>Pips {analysis.manaDemand.pips[color]}</span>
            <span>Sources {analysis.manaSources.sources[color]}</span>
          </div>
        ))}
      </div>
      <div className="mini-table-stack">
        {analysis.manaSources.untappedByTurn.map((turn) => (
          <span key={turn.turn}>
            T{turn.turn} likely untapped:{" "}
            {colors
              .map((color) => `${color} ${turn.sources[color]}`)
              .join(" / ")}{" "}
            <em>{turn.confidence} confidence</em>
          </span>
        ))}
      </div>
      <p className="muted-copy">Source estimates are card-text based and conservative for conditional lands.</p>
    </section>
  );
}

function ComparisonPanel({ analysis }: { analysis: ManaCurveAnalysis }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <p className="eyebrow">Context ranges</p>
        <h2>Curve Shape</h2>
      </div>
      <div className="list-stack">
        {analysis.contextualRanges
          .filter((row) => row.count || row.label !== "in range")
          .map((row) => (
            <div className={`range-row ${row.label.replace(/\s+/g, "-")}`} key={row.bucket}>
              <strong>{row.bucket}</strong>
              <span>
                {row.count} cards, {Math.round(row.share * 100)}%
              </span>
              <em>
                {row.label}; expected {Math.round(row.typicalLow * 100)}-{Math.round(row.typicalHigh * 100)}%
              </em>
            </div>
          ))}
      </div>
      <p className="muted-copy">Ranges are contextual heuristics based on inferred deck posture, format, and selected scope.</p>
    </section>
  );
}

function formatExpectedRange(range: ManaCurveAnalysis["observations"][number]["expectedRange"]) {
  if (!range || (range.min === undefined && range.max === undefined)) {
    return "";
  }
  if (range.min !== undefined && range.max !== undefined) {
    return `${range.min}-${range.max}`;
  }
  if (range.min !== undefined) {
    return `${range.min}+`;
  }
  return `up to ${range.max}`;
}

function ObservationPanel({ analysis }: { analysis: ManaCurveAnalysis }) {
  return (
    <section className="panel">
      <div className="section-heading">
        <p className="eyebrow">Observations</p>
        <h2>Curve Pressure</h2>
      </div>
      <div className="list-stack">
        {analysis.observations.map((observation) => (
          <div className={`empty-state observation-card ${observation.tone}`} key={observation.title}>
            <strong>{observation.title}</strong>
            <span>{observation.detail}</span>
            {observation.measuredValue !== undefined || observation.expectedRange ? (
              <small>
                {observation.measuredValue !== undefined ? `Measured: ${observation.measuredValue}` : ""}
                {observation.expectedRange ? `${observation.measuredValue !== undefined ? " | " : ""}Expected: ${formatExpectedRange(observation.expectedRange)}` : ""}
              </small>
            ) : null}
            {observation.evidence.length ? <small>Evidence: {observation.evidence.join("; ")}</small> : null}
            <em>{observation.confidence} confidence</em>
          </div>
        ))}
      </div>
    </section>
  );
}

function SuggestionPanel({ analysis, hasMetagame }: { analysis: ManaCurveAnalysis; hasMetagame: boolean }) {
  const hasTournamentSuggestion = analysis.suggestions.some((suggestion) => suggestion.source === "similar-tournament-decks");
  return (
    <section className="panel">
      <div className="section-heading">
        <p className="eyebrow">Suggestions</p>
        <h2>{hasTournamentSuggestion ? "Similar Challenge Shells" : hasMetagame ? "Tournament Data Loaded" : "Structural Roles"}</h2>
        {hasMetagame && !hasTournamentSuggestion ? (
          <p className="muted-copy">
            Recent tournament lists are loaded, but no legal color-compatible card gaps survived filtering for this deck.
          </p>
        ) : null}
      </div>
      <div className="list-stack">
        {analysis.suggestions.length ? (
          analysis.suggestions.map((suggestion) => (
            <div className="list-row curve-suggestion-row" key={`${suggestion.cardName}-${suggestion.role}`}>
              <div>
                <strong>Add {suggestion.suggestedQuantity} {suggestion.cardName}</strong>
                <span>{suggestion.role} | {suggestion.slot} | {suggestion.problemAddressed}</span>
                <small>{suggestion.reason}</small>
                {suggestion.possibleCuts.length ? (
                  <small>Possible cuts: {suggestion.possibleCuts.join(", ")}</small>
                ) : null}
                <small>
                  Evidence: {suggestion.source === "similar-tournament-decks" ? `${suggestion.supportingDeckCount} supporting list(s)` : suggestion.source}; {suggestion.similarityConfidence} confidence; {suggestion.formatLegality}; {suggestion.colorCompatibility}
                </small>
              </div>
              <em>{suggestion.source === "similar-tournament-decks" ? "Challenge" : suggestion.source === "sideboard" ? "Sideboard" : "Role"}</em>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <strong>No clean suggestion</strong>
            <span>The curve warnings are too mild, or no legal color-compatible candidates were found.</span>
          </div>
        )}
      </div>
    </section>
  );
}
