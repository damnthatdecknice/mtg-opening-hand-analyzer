export type CastabilityScoreRow = {
  manaValue: number;
  turn2: number;
  turn3: number;
};

export function castabilityScoreAdjustment(castability: CastabilityScoreRow[]) {
  const spellRows = castability.filter((row) => row.manaValue > 0);
  const earlyRows = spellRows.filter((row) => row.manaValue <= 2);
  if (!spellRows.length) {
    return { adjustment: 0, note: "" };
  }

  const bestTurn3 = Math.max(...spellRows.map((row) => row.turn3));
  const bestEarlyTurn2 = earlyRows.length ? Math.max(...earlyRows.map((row) => row.turn2)) : 1;
  const averageEarlyTurn2 = earlyRows.length
    ? earlyRows.reduce((total, row) => total + row.turn2, 0) / earlyRows.length
    : 1;

  if (bestTurn3 < 0.2) {
    return {
      adjustment: -34,
      note: "Color access is a major issue: the hand is unlikely to cast any spell by turn 3."
    };
  }

  if (earlyRows.length && bestEarlyTurn2 < 0.25) {
    return {
      adjustment: -28,
      note: "The hand has cheap spells, but the current mana cannot cast them reliably."
    };
  }

  if (earlyRows.length && averageEarlyTurn2 < 0.5) {
    return {
      adjustment: -Math.round((0.5 - averageEarlyTurn2) * 32),
      note: "Early spell castability is strained by color access."
    };
  }

  if (bestTurn3 < 0.55) {
    return {
      adjustment: -12,
      note: "The hand may develop slowly because castable spells are not reliable by turn 3."
    };
  }

  return { adjustment: 0, note: "" };
}
