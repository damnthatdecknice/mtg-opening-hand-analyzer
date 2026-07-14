from __future__ import annotations

from mtg_hand_analyzer.analysis import analyze_hand
from mtg_hand_analyzer.models import CardData, PlayDraw


def test_analysis_counts_lands_from_confirmed_hand_not_alphabetic_defaults() -> None:
    counts = {
        "Boomerang Basics": 4,
        "Burst Lightning": 4,
        "Opt": 4,
        "Sleight of Hand": 4,
        "Slickshot Show-Off": 4,
        "Spirebluff Canal": 4,
        "Steam Vents": 4,
    }
    hand = [
        "Opt",
        "Steam Vents",
        "Sleight of Hand",
        "Slickshot Show-Off",
        "Spirebluff Canal",
        "Burst Lightning",
        "Boomerang Basics",
    ]
    cards = {
        "Boomerang Basics": CardData(name="Boomerang Basics", normalized_name="boomerang basics", mana_cost="{U}", mana_value=1, type_line="Instant", colors=["U"]),
        "Burst Lightning": CardData(name="Burst Lightning", normalized_name="burst lightning", mana_cost="{R}", mana_value=1, type_line="Instant", colors=["R"]),
        "Opt": CardData(name="Opt", normalized_name="opt", mana_cost="{U}", mana_value=1, type_line="Instant", colors=["U"], oracle_text="Draw a card."),
        "Sleight of Hand": CardData(name="Sleight of Hand", normalized_name="sleight of hand", mana_cost="{U}", mana_value=1, type_line="Sorcery", colors=["U"]),
        "Slickshot Show-Off": CardData(name="Slickshot Show-Off", normalized_name="slickshot show-off", mana_cost="{1}{R}", mana_value=2, type_line="Creature", colors=["R"]),
        "Spirebluff Canal": CardData(name="Spirebluff Canal", normalized_name="spirebluff canal", type_line="Land", is_land=True, produced_mana=["U", "R"], oracle_text="This land enters tapped unless you control two or fewer other lands."),
        "Steam Vents": CardData(name="Steam Vents", normalized_name="steam vents", type_line="Land - Island Mountain", is_land=True, produced_mana=["U", "R"], oracle_text="As this land enters, you may pay 2 life. If you don't, it enters tapped."),
    }
    report = analyze_hand(counts, hand, cards, PlayDraw.PLAY, trials=200, seed=1)
    assert report["lands_in_hand"] == 2
    assert report["average_mana_value"] > 0


def test_known_lands_are_counted_even_without_scryfall_data() -> None:
    counts = {
        "Opt": 4,
        "Steam Vents": 4,
        "Spirebluff Canal": 4,
        "Burst Lightning": 4,
        "Sleight of Hand": 4,
        "Secret Identity": 2,
        "Slickshot Show-Off": 4,
    }
    hand = [
        "Opt",
        "Steam Vents",
        "Secret Identity",
        "Sleight of Hand",
        "Slickshot Show-Off",
        "Spirebluff Canal",
        "Burst Lightning",
    ]
    cards = {
        "Opt": CardData(name="Opt", normalized_name="opt", mana_cost="{U}", mana_value=1, type_line="Instant", colors=["U"]),
        "Burst Lightning": CardData(name="Burst Lightning", normalized_name="burst lightning", mana_cost="{R}", mana_value=1, type_line="Instant", colors=["R"]),
        "Sleight of Hand": CardData(name="Sleight of Hand", normalized_name="sleight of hand", mana_cost="{U}", mana_value=1, type_line="Sorcery", colors=["U"]),
        "Secret Identity": CardData(name="Secret Identity", normalized_name="secret identity", mana_cost="{U}", mana_value=1, type_line="Instant", colors=["U"]),
        "Slickshot Show-Off": CardData(name="Slickshot Show-Off", normalized_name="slickshot show-off", mana_cost="{1}{R}", mana_value=2, type_line="Creature", colors=["R"]),
    }
    report = analyze_hand(counts, hand, cards, PlayDraw.PLAY, trials=200, seed=2)
    assert report["lands_in_hand"] == 2
    assert report["lands_remaining"] == 6
    castability = {estimate.card_name: estimate for estimate in report["castability"]}
    assert castability["Opt"].by_turn[1] == 1.0
    assert castability["Burst Lightning"].by_turn[1] == 1.0
    assert castability["Slickshot Show-Off"].by_turn[2] == 1.0
