from __future__ import annotations

from mtg_hand_analyzer.mana import can_pay, castability_monte_carlo, parse_mana_cost, source_profile
from mtg_hand_analyzer.models import CardData, PlayDraw
from mtg_hand_analyzer.land_inference import infer_land_card


def test_parse_generic_and_colors() -> None:
    required, generic, warnings = parse_mana_cost("{2}{R}{W}")
    assert required["R"] == 1
    assert required["W"] == 1
    assert generic == 2
    assert warnings == []


def test_missing_colors_and_hybrid_warning() -> None:
    assert not can_pay("{R}{W}", [{"R"}, {"R"}])[0]
    required, _, warnings = parse_mana_cost("{R/W}")
    assert required["R"] == 1
    assert warnings


def test_reproducible_monte_carlo() -> None:
    cards = {
        "Mountain": CardData(name="Mountain", normalized_name="mountain", type_line="Basic Land - Mountain", is_land=True, produced_mana=["R"]),
        "Lightning Strike": CardData(name="Lightning Strike", normalized_name="lightning strike", mana_cost="{1}{R}", mana_value=2, type_line="Instant", colors=["R"]),
    }
    hand = ["Mountain", "Lightning Strike", "Lightning Strike", "Lightning Strike", "Lightning Strike", "Lightning Strike", "Lightning Strike"]
    library = {"Mountain": 20}
    first = castability_monte_carlo(hand, library, cards, PlayDraw.PLAY, trials=1000, seed=7)
    second = castability_monte_carlo(hand, library, cards, PlayDraw.PLAY, trials=1000, seed=7)
    assert first[0].by_turn == second[0].by_turn


def test_castability_never_exceeds_one_with_duplicate_spells() -> None:
    cards = {
        "Island": CardData(
            name="Island",
            normalized_name="island",
            type_line="Basic Land - Island",
            is_land=True,
            produced_mana=["U"],
        ),
        "Opt": CardData(
            name="Opt",
            normalized_name="opt",
            mana_cost="{U}",
            mana_value=1,
            type_line="Instant",
            oracle_text="Scry 1, then draw a card.",
        ),
    }
    hand = ["Island", "Island", "Opt", "Opt", "Opt", "Opt", "Opt"]
    estimates = castability_monte_carlo(hand, {}, cards, PlayDraw.PLAY, trials=50, seed=3)
    assert len(estimates) == 1
    assert all(0.0 <= value <= 1.0 for value in estimates[0].by_turn.values())


def test_shock_and_fast_lands_are_not_always_tapped() -> None:
    steam_vents = CardData(
        name="Steam Vents",
        normalized_name="steam vents",
        type_line="Land - Island Mountain",
        is_land=True,
        produced_mana=["U", "R"],
        oracle_text="As this land enters, you may pay 2 life. If you don't, it enters tapped.",
    )
    spirebluff = CardData(
        name="Spirebluff Canal",
        normalized_name="spirebluff canal",
        type_line="Land",
        is_land=True,
        produced_mana=["U", "R"],
        oracle_text="This land enters tapped unless you control two or fewer other lands.",
    )
    assert source_profile(steam_vents)[1] is False
    assert source_profile(spirebluff)[1] is False


def test_known_land_inference_for_empty_cache() -> None:
    steam_vents = infer_land_card("Steam Vents")
    spirebluff = infer_land_card("Spirebluff Canal")
    island = infer_land_card("Island")
    assert steam_vents is not None and steam_vents.is_land and set(steam_vents.produced_mana) == {"U", "R"}
    assert spirebluff is not None and spirebluff.is_land and set(spirebluff.produced_mana) == {"U", "R"}
    assert island is not None and island.is_land and island.produced_mana == ["U"]
