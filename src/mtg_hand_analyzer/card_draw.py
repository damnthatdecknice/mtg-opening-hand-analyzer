from __future__ import annotations

import re
from dataclasses import dataclass
from math import floor

from mtg_hand_analyzer.models import CardData, CastabilityEstimate
from mtg_hand_analyzer.probability import probability_at_least

NUMBER_WORDS = {
    "a": 1,
    "an": 1,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
}
DRAW_RE = re.compile(r"\bdraw\s+(?P<count>a|an|one|two|three|four|five|\d+)\s+cards?\b", re.IGNORECASE)
SCRY_RE = re.compile(r"\bscry\s+(?P<count>\d+|one|two|three|four|five)\b", re.IGNORECASE)
SURVEIL_RE = re.compile(r"\bsurveil\s+(?P<count>\d+|one|two|three|four|five)\b", re.IGNORECASE)
LOOK_TOP_RE = re.compile(r"\blook at the top (?P<count>\d+|one|two|three|four|five) cards?\b", re.IGNORECASE)
SKIP_PHRASES = ("each player draws", "target player draws", "opponent draws")


@dataclass(frozen=True)
class DrawSource:
    card_name: str
    cards_drawn: int
    cards_seen: int
    text: str


def _number_value(raw: str) -> int:
    return int(raw) if raw.isdigit() else NUMBER_WORDS.get(raw.casefold(), 0)


def draw_amount(card: CardData) -> int:
    text = " ".join([card.oracle_text, *(face.oracle_text for face in card.faces)]).casefold()
    if any(phrase in text for phrase in SKIP_PHRASES):
        return 0
    matches = DRAW_RE.findall(text)
    if not matches:
        return 0
    amounts: list[int] = []
    for raw in matches:
        amounts.append(_number_value(raw))
    return max(amounts, default=0)


def selection_look_amount(card: CardData) -> int:
    text = " ".join([card.oracle_text, *(face.oracle_text for face in card.faces)]).casefold()
    if any(phrase in text for phrase in SKIP_PHRASES):
        return 0
    amounts: list[int] = []
    for pattern in (SCRY_RE, SURVEIL_RE, LOOK_TOP_RE):
        amounts.extend(_number_value(raw) for raw in pattern.findall(text))
    return max(amounts, default=0)


def draw_look_depth(card: CardData) -> int:
    drawn = draw_amount(card)
    selection = selection_look_amount(card)
    if drawn <= 0 and selection <= 0:
        return 0
    if "look at the top" in card.oracle_text.casefold():
        return max(drawn, selection)
    return drawn + selection


def draw_sources(cards: dict[str, CardData], names: list[str] | set[str]) -> list[DrawSource]:
    sources: list[DrawSource] = []
    for name in sorted(set(names)):
        card = cards.get(name)
        if not card:
            continue
        amount = draw_amount(card)
        look_depth = draw_look_depth(card)
        if amount > 0 or look_depth > 0:
            sources.append(DrawSource(card_name=name, cards_drawn=amount, cards_seen=look_depth, text=card.oracle_text))
    return sources


def expected_extra_looks_by_turn(
    hand_sources: list[DrawSource],
    castability: list[CastabilityEstimate],
    turn: int,
) -> float:
    if turn <= 1:
        return 0.0
    cast_by_name = {estimate.card_name: estimate for estimate in castability}
    total = 0.0
    for source in hand_sources:
        estimate = cast_by_name.get(source.card_name)
        if not estimate:
            continue
        # Cards seen by a spell cast during turn N are treated as extra looks by the next turn.
        total += getattr(source, "cards_seen", source.cards_drawn) * estimate.by_turn.get(turn - 1, 0.0)
    return total


def expected_extra_draws_by_turn(
    hand_sources: list[DrawSource],
    castability: list[CastabilityEstimate],
    turn: int,
) -> float:
    return expected_extra_looks_by_turn(hand_sources, castability, turn)


def estimated_probability_with_extra_looks(
    population: int,
    successes: int,
    natural_draws: int,
    expected_extra_draws: float,
    minimum_hits: int = 1,
) -> float:
    base_draws = max(0, min(population, natural_draws))
    extra = max(0.0, expected_extra_draws)
    lower_draws = min(population, base_draws + floor(extra))
    upper_draws = min(population, lower_draws + 1)
    fraction = extra - floor(extra)
    lower = probability_at_least(population, successes, lower_draws, minimum_hits)
    upper = probability_at_least(population, successes, upper_draws, minimum_hits)
    return max(0.0, min(1.0, lower * (1.0 - fraction) + upper * fraction))
