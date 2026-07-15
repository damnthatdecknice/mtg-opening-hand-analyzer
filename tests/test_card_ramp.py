from __future__ import annotations

from mtg_hand_analyzer.card_ramp import ramp_source
from mtg_hand_analyzer.models import CardData


def test_ramp_source_detects_treasure() -> None:
    source = ramp_source(
        CardData(
            name="Big Score",
            normalized_name="big score",
            mana_cost="{3}{R}",
            type_line="Instant",
            oracle_text="Create two Treasure tokens.",
        )
    )
    assert source is not None
    assert source.ramp_type == "Treasure"


def test_ramp_source_detects_mana_permanent() -> None:
    source = ramp_source(
        CardData(
            name="Llanowar Elves",
            normalized_name="llanowar elves",
            mana_cost="{G}",
            type_line="Creature - Elf Druid",
            oracle_text="{T}: Add {G}.",
        )
    )
    assert source is not None
    assert source.ramp_type == "Mana permanent"
