from __future__ import annotations

import random
import re
from collections import Counter
from math import sqrt

from mtg_hand_analyzer.models import COLORS, CardData, CastabilityEstimate, ManaSourceOverride, PlayDraw
from mtg_hand_analyzer.probability import draws_by_beginning_of_turn

SYMBOL_RE = re.compile(r"\{([^}]+)\}")
UNSUPPORTED_SYMBOLS = {"P", "S", "C"}


def parse_mana_cost(cost: str) -> tuple[Counter[str], int, list[str]]:
    required: Counter[str] = Counter()
    generic = 0
    warnings: list[str] = []
    for symbol in SYMBOL_RE.findall(cost):
        if symbol.isdigit():
            generic += int(symbol)
        elif symbol == "X":
            warnings.append("X costs are evaluated as zero for basic castability.")
        elif "/" in symbol:
            parts = symbol.split("/")
            colors = [part for part in parts if part in COLORS]
            if colors:
                required[colors[0]] += 1
                warnings.append(f"Hybrid symbol {{{symbol}}} is approximated as {colors[0]}.")
            else:
                warnings.append(f"Unsupported mana symbol {{{symbol}}}.")
        elif symbol in COLORS:
            required[symbol] += 1
        elif symbol in UNSUPPORTED_SYMBOLS:
            warnings.append(f"Unsupported mana symbol {{{symbol}}}.")
        else:
            warnings.append(f"Unsupported mana symbol {{{symbol}}}.")
    return required, generic, warnings


def source_profile(card: CardData, override: ManaSourceOverride | None = None) -> tuple[set[str], bool, list[str]]:
    warnings: list[str] = []
    if override:
        if override.exclude_from_castability:
            return set(), False, ["Source excluded by user override."]
        if override.conditional:
            warnings.append("Conditional source modeled optimistically after review.")
        return set(override.colors_produced), override.enters_tapped, warnings
    colors = set(card.produced_mana or [])
    if card.is_land and not colors:
        basics = {"Plains": "W", "Island": "U", "Swamp": "B", "Mountain": "R", "Forest": "G", "Wastes": "C"}
        if card.name in basics:
            colors.add(basics[card.name])
        else:
            warnings.append("Land has no produced mana data and may need review.")
    text = card.oracle_text.casefold()
    if "you may pay 2 life. if you don't" in text:
        warnings.append("Shock land modeled as available untapped because paying 2 life is allowed.")
        return colors, False, warnings
    if "unless you control two or fewer other lands" in text:
        warnings.append("Fast land modeled as untapped for early opening-hand turns.")
        return colors, False, warnings
    if any(token in text for token in ["enters the battlefield tapped", "enters tapped"]):
        return colors, True, warnings
    return colors, False, warnings


def can_pay(cost: str, available_sources: list[set[str]]) -> tuple[bool, list[str]]:
    required, generic, warnings = parse_mana_cost(cost)
    source_count = len(available_sources)
    for color, needed in required.items():
        if sum(1 for source in available_sources if color in source) < needed:
            return False, warnings
    colored_total = sum(required.values())
    return source_count >= colored_total + generic, warnings


def castability_monte_carlo(
    hand: list[str],
    library_counts: dict[str, int],
    cards: dict[str, CardData],
    play_draw: PlayDraw,
    trials: int = 20_000,
    seed: int = 20260714,
    overrides: dict[str, ManaSourceOverride] | None = None,
) -> list[CastabilityEstimate]:
    overrides = overrides or {}
    rng = random.Random(seed)
    deck_cards = [name for name, qty in library_counts.items() for _ in range(qty)]
    spells = list(dict.fromkeys(name for name in hand if not cards.get(name, CardData(name=name, normalized_name=name)).is_land))
    successes = {spell: {turn: 0 for turn in range(1, 6)} for spell in spells}
    warnings_by_spell = {spell: parse_mana_cost(cards[spell].mana_cost)[2] if spell in cards else [] for spell in spells}

    hand_lands = [name for name in hand if cards.get(name) and cards[name].is_land]
    for _ in range(trials):
        shuffled = deck_cards[:]
        rng.shuffle(shuffled)
        for turn in range(1, 6):
            draws = draws_by_beginning_of_turn(turn, play_draw)
            seen = hand_lands + [name for name in shuffled[:draws] if cards.get(name) and cards[name].is_land]
            battlefield = choose_land_sources(seen, cards, turn, overrides)
            for spell in spells:
                if spell in cards and can_pay(cards[spell].mana_cost, battlefield)[0]:
                    successes[spell][turn] += 1

    estimates: list[CastabilityEstimate] = []
    for spell in spells:
        by_turn = {turn: max(0.0, min(1.0, successes[spell][turn] / trials)) for turn in range(1, 6)}
        warnings = warnings_by_spell[spell] + [
            f"Monte Carlo estimate; about +/- {1.96 * sqrt(0.25 / trials):.1%} worst-case sampling error.",
            "Does not model mana creatures, treasures, cost reductions, alternate costs, or detailed sequencing.",
        ]
        estimates.append(CastabilityEstimate(card_name=spell, by_turn=by_turn, trials=trials, seed=seed, warnings=warnings))
    return estimates


def choose_land_sources(
    land_names_seen: list[str],
    cards: dict[str, CardData],
    turn: int,
    overrides: dict[str, ManaSourceOverride] | None = None,
) -> list[set[str]]:
    overrides = overrides or {}
    chosen = land_names_seen[:turn]
    sources: list[set[str]] = []
    for name in chosen:
        if name not in cards:
            continue
        colors, enters_tapped, _warnings = source_profile(cards[name], overrides.get(name))
        if enters_tapped and len(sources) == turn - 1:
            continue
        sources.append(colors)
    return sources
