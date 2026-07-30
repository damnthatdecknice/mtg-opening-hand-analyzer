import { parseDecklist } from "./deckParser";
import { normalizeFingerprintName } from "./firstDeckOnboarding";

export type DeckVersionDiffRow = {
  key: string;
  section: "main" | "sideboard";
  name: string;
  oldQty: number;
  newQty: number;
  delta: number;
};

function aggregateDecklist(decklist: string, side: "old" | "new") {
  const rows = new Map<string, DeckVersionDiffRow>();
  for (const card of parseDecklist(decklist).cards) {
    const normalizedName = normalizeFingerprintName(card.name);
    const key = `${card.section}:${normalizedName}`;
    const existing =
      rows.get(key) ??
      ({
        key,
        section: card.section,
        name: card.name.trim().replace(/\s+/g, " "),
        oldQty: 0,
        newQty: 0,
        delta: 0
      } satisfies DeckVersionDiffRow);
    rows.set(
      key,
      side === "old"
        ? {
            ...existing,
            name: existing.name || card.name.trim().replace(/\s+/g, " "),
            oldQty: existing.oldQty + card.qty
          }
        : {
            ...existing,
            name: existing.name || card.name.trim().replace(/\s+/g, " "),
            newQty: existing.newQty + card.qty
          }
    );
  }
  return rows;
}

export function diffDecklistsBySection(oldDecklist: string, newDecklist: string): DeckVersionDiffRow[] {
  const oldRows = aggregateDecklist(oldDecklist, "old");
  const newRows = aggregateDecklist(newDecklist, "new");

  return Array.from(new Set([...Array.from(oldRows.keys()), ...Array.from(newRows.keys())]))
    .map((key) => {
      const oldRow = oldRows.get(key);
      const newRow = newRows.get(key);
      const section = oldRow?.section ?? newRow?.section ?? "main";
      const name = newRow?.name ?? oldRow?.name ?? key.split(":").slice(1).join(":");
      const oldQty = oldRow?.oldQty ?? 0;
      const newQty = newRow?.newQty ?? 0;
      return {
        key,
        section,
        name,
        oldQty,
        newQty,
        delta: newQty - oldQty
      };
    })
    .filter((row) => row.delta !== 0)
    .sort(
      (a, b) =>
        a.section.localeCompare(b.section) ||
        Math.abs(b.delta) - Math.abs(a.delta) ||
        a.name.localeCompare(b.name)
    );
}
