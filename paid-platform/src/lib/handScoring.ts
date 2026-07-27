export type CastabilityScoreRow = {
  cardName?: string;
  manaValue: number;
  turn1?: number;
  turn2: number;
  turn3: number;
};

export type ManaSufficiencyInput = {
  landsInHand: number;
  effectiveLandsInHand: number;
  profileLabel: string;
  curveTop: number;
  averageManaValue: number;
  turn2LandDrop: number;
  turn3LandDrop: number;
  turn4LandDrop: number;
  hasCastableRamp: boolean;
};

export type ScoreAdjustment = {
  adjustment: number;
  cap: number;
  note: string;
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

export function manaSufficiencyAdjustment(input: ManaSufficiencyInput): ScoreAdjustment {
  const isLowCurve = input.profileLabel === "Low-curve pressure";
  const isManaHungry =
    input.profileLabel === "Ramp or big-mana curve" ||
    input.profileLabel === "Control/value curve" ||
    input.curveTop >= 4 ||
    input.averageManaValue >= 2.8;
  const requiredEarlyMana = isLowCurve ? 2 : isManaHungry ? 3 : 2;
  const hasEnoughRawMana = input.effectiveLandsInHand >= requiredEarlyMana;

  if (input.landsInHand === 0) {
    return {
      adjustment: -45,
      cap: 18,
      note: "No-land hands are not functional without an unusual free-mana plan."
    };
  }

  if (input.landsInHand === 1) {
    if (input.hasCastableRamp && input.turn3LandDrop >= 0.58) {
      return {
        adjustment: isManaHungry ? -28 : -22,
        cap: isManaHungry ? 48 : 54,
        note: "One land plus ramp is still a fragile opener; castable ramp only keeps this from being an automatic mulligan."
      };
    }

    if (isManaHungry || input.turn3LandDrop < 0.45) {
      return {
        adjustment: -38,
        cap: 42,
        note: `This hand is below the deck's mana requirement: one land with ${Math.round(input.turn3LandDrop * 100)}% to make the third land drop by turn 3.`
      };
    }

    return {
      adjustment: -28,
      cap: 52,
      note: "One-land hands need exceptional help; this hand is being capped for mana risk."
    };
  }

  if (input.landsInHand === 2 && input.averageManaValue > 3) {
    if (input.turn4LandDrop < 0.7 || !input.hasCastableRamp) {
      return {
        adjustment: -18,
        cap: 58,
        note: `This deck averages over 3 mana value, so a two-land hand needs strong help; fourth land by turn 4 is ${Math.round(input.turn4LandDrop * 100)}%.`
      };
    }

    return {
      adjustment: -10,
      cap: 66,
      note: "This deck averages over 3 mana value, so a two-land hand is still being taxed even with ramp support."
    };
  }

  if (!hasEnoughRawMana && input.turn3LandDrop < 0.55) {
    return {
      adjustment: -18,
      cap: 58,
      note: `This hand is short of the deck's preferred early mana and only ${Math.round(input.turn3LandDrop * 100)}% to make the third land drop by turn 3.`
    };
  }

  if (isManaHungry && input.effectiveLandsInHand === 2 && !input.hasCastableRamp && input.turn4LandDrop < 0.6) {
    return {
      adjustment: -14,
      cap: 62,
      note: `This curve wants stable fourth-mana development; the fourth land by turn 4 is only ${Math.round(input.turn4LandDrop * 100)}%.`
    };
  }

  if (input.landsInHand === 2 && input.turn2LandDrop < 0.72 && input.turn3LandDrop < 0.62) {
    return {
      adjustment: -8,
      cap: 68,
      note: "The hand has two lands, but follow-up land drops are still below a comfortable range."
    };
  }

  return { adjustment: 0, cap: 100, note: "" };
}
