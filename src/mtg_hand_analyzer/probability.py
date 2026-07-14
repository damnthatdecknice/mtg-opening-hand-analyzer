from __future__ import annotations

from collections import Counter
from math import comb

from mtg_hand_analyzer.models import PlayDraw, ProbabilityDetail


def hypergeometric_exact(population: int, successes: int, draws: int, hits: int) -> float:
    if hits < 0 or successes < 0 or population < 0 or draws < 0:
        raise ValueError("Inputs must be non-negative.")
    failures = population - successes
    if successes > population or draws > population or hits > successes or draws - hits > failures:
        return 0.0
    return comb(successes, hits) * comb(failures, draws - hits) / comb(population, draws)


def probability_exactly(population: int, successes: int, draws: int, hits: int) -> float:
    return hypergeometric_exact(population, successes, draws, hits)


def probability_at_least(population: int, successes: int, draws: int, minimum_hits: int = 1) -> float:
    if minimum_hits <= 0:
        return 1.0
    max_hits = min(successes, draws)
    return sum(hypergeometric_exact(population, successes, draws, hits) for hits in range(minimum_hits, max_hits + 1))


def probability_none(population: int, successes: int, draws: int) -> float:
    return probability_exactly(population, successes, draws, 0)


def draws_by_beginning_of_turn(turn: int, play_draw: PlayDraw) -> int:
    if turn < 1:
        raise ValueError("Turn must be at least 1.")
    if play_draw == PlayDraw.PLAY:
        return max(0, turn - 1)
    return turn


def remove_hand_from_deck(main_counts: dict[str, int], hand: list[str]) -> dict[str, int]:
    library = Counter(main_counts)
    for card in hand:
        library[card] -= 1
        if library[card] < 0:
            raise ValueError(f"Hand contains more copies of {card} than the main deck.")
    return {name: qty for name, qty in library.items() if qty > 0}


def library_size(library_counts: dict[str, int]) -> int:
    return sum(library_counts.values())


def qualifying_count(library_counts: dict[str, int], qualifying_names: set[str]) -> int:
    return sum(qty for name, qty in library_counts.items() if name in qualifying_names)


def probability_detail(
    label: str,
    library_counts: dict[str, int],
    qualifying_names: set[str],
    draws: int,
    minimum_hits: int = 1,
) -> ProbabilityDetail:
    population = library_size(library_counts)
    successes = qualifying_count(library_counts, qualifying_names)
    probability = probability_at_least(population, successes, min(draws, population), minimum_hits)
    return ProbabilityDetail(
        label=label,
        probability=probability,
        library_size=population,
        qualifying_cards=successes,
        draws=min(draws, population),
        explanation=(
            f"Exact hypergeometric chance of drawing at least {minimum_hits} qualifying card(s) "
            f"in {min(draws, population)} draw(s) from {population} cards."
        ),
    )


def land_drop_probability(current_lands: int, population: int, lands_remaining: int, draws: int, target_land_drop: int) -> float:
    needed = max(0, target_land_drop - current_lands)
    return probability_at_least(population, lands_remaining, min(draws, population), needed)
