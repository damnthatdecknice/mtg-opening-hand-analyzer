from __future__ import annotations

from math import comb, isclose

from mtg_hand_analyzer.models import PlayDraw
from mtg_hand_analyzer.probability import (
    draws_by_beginning_of_turn,
    probability_at_least,
    probability_exactly,
    probability_none,
    remove_hand_from_deck,
)


def test_exact_hypergeometric_known_values() -> None:
    population = 53
    successes = 24
    draws = 2
    expected_none = comb(29, 2) / comb(53, 2)
    expected_at_least_one = 1 - expected_none
    assert isclose(probability_none(population, successes, draws), expected_none)
    assert isclose(probability_at_least(population, successes, draws), expected_at_least_one)
    assert isclose(probability_exactly(population, successes, draws, 1), comb(24, 1) * comb(29, 1) / comb(53, 2))


def test_play_draw_counts() -> None:
    assert [draws_by_beginning_of_turn(turn, PlayDraw.PLAY) for turn in range(1, 6)] == [0, 1, 2, 3, 4]
    assert [draws_by_beginning_of_turn(turn, PlayDraw.DRAW) for turn in range(1, 6)] == [1, 2, 3, 4, 5]


def test_remove_hand_from_library() -> None:
    library = remove_hand_from_deck({"Mountain": 12, "Plains": 8, "Lightning Strike": 4}, ["Mountain", "Plains", "Lightning Strike"])
    assert library == {"Mountain": 11, "Plains": 7, "Lightning Strike": 3}
