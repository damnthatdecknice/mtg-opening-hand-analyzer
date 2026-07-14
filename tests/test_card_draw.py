from __future__ import annotations

from math import isclose

from mtg_hand_analyzer.card_draw import (
    draw_amount,
    draw_look_depth,
    estimated_probability_with_extra_looks,
    expected_extra_draws_by_turn,
)
from mtg_hand_analyzer.models import CardData, CastabilityEstimate
from mtg_hand_analyzer.probability import probability_at_least


def test_draw_amount_detects_simple_card_draw() -> None:
    assert draw_amount(CardData(name="Opt", normalized_name="opt", oracle_text="Scry 1, then draw a card.")) == 1
    assert draw_amount(CardData(name="Divination", normalized_name="divination", oracle_text="Draw two cards.")) == 2


def test_draw_look_depth_counts_selection_plus_draw() -> None:
    assert draw_look_depth(CardData(name="Opt", normalized_name="opt", oracle_text="Scry 1, then draw a card.")) == 2
    assert (
        draw_look_depth(
            CardData(
                name="Sleight of Hand",
                normalized_name="sleight of hand",
                oracle_text="Look at the top two cards of your library. Put one of them into your hand and the other on the bottom of your library.",
            )
        )
        == 2
    )


def test_draw_amount_skips_opponent_or_each_player_draw() -> None:
    assert draw_amount(CardData(name="Howling Mine", normalized_name="howling mine", oracle_text="Each player draws a card.")) == 0


def test_expected_extra_draws_uses_previous_turn_castability() -> None:
    estimate = CastabilityEstimate(
        card_name="Opt",
        by_turn={1: 0.5, 2: 0.9, 3: 1.0, 4: 1.0, 5: 1.0},
        trials=100,
        seed=1,
    )
    source = type("Source", (), {"card_name": "Opt", "cards_drawn": 1})()
    assert expected_extra_draws_by_turn([source], [estimate], 2) == 0.5


def test_estimated_probability_interpolates_fractional_extra_draws() -> None:
    population = 53
    successes = 20
    natural = 2
    expected = (
        probability_at_least(population, successes, 2) * 0.5
        + probability_at_least(population, successes, 3) * 0.5
    )
    actual = estimated_probability_with_extra_looks(population, successes, natural, 0.5)
    assert isclose(actual, expected)


def test_estimated_probability_caps_at_one() -> None:
    assert estimated_probability_with_extra_looks(10, 10, 10, 5.0) == 1.0
