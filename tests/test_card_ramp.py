from __future__ import annotations

from mtg_hand_analyzer.analysis import analyze_hand
from mtg_hand_analyzer.card_ramp import land_equivalent_source, ramp_source
from mtg_hand_analyzer.models import CardData, CardFace, PlayDraw


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


def test_land_equivalent_detects_mdfc_land_face() -> None:
    source = land_equivalent_source(
        CardData(
            name="Bala Ged Recovery",
            normalized_name="bala ged recovery",
            mana_cost="{2}{G}",
            type_line="Sorcery",
            faces=[
                CardFace(name="Bala Ged Recovery", mana_cost="{2}{G}", type_line="Sorcery"),
                CardFace(name="Bala Ged Sanctuary", type_line="Land"),
            ],
            is_multiface=True,
        )
    )
    assert source is not None
    assert source.equivalent_type == "MDFC land face"


def test_analysis_counts_land_equivalents_as_effective_sources() -> None:
    cards = {
        "Forest": CardData(
            name="Forest",
            normalized_name="forest",
            type_line="Basic Land - Forest",
            is_land=True,
            produced_mana=["G"],
        ),
        "Llanowar Elves": CardData(
            name="Llanowar Elves",
            normalized_name="llanowar elves",
            mana_cost="{G}",
            mana_value=1,
            type_line="Creature - Elf Druid",
            oracle_text="{T}: Add {G}.",
        ),
        "Bala Ged Recovery": CardData(
            name="Bala Ged Recovery",
            normalized_name="bala ged recovery",
            mana_cost="{2}{G}",
            mana_value=3,
            type_line="Sorcery",
            faces=[
                CardFace(name="Bala Ged Recovery", mana_cost="{2}{G}", type_line="Sorcery"),
                CardFace(name="Bala Ged Sanctuary", type_line="Land"),
            ],
            is_multiface=True,
        ),
        "Grizzly Bears": CardData(
            name="Grizzly Bears",
            normalized_name="grizzly bears",
            mana_cost="{1}{G}",
            mana_value=2,
            type_line="Creature",
        ),
    }
    counts = {"Forest": 20, "Llanowar Elves": 4, "Bala Ged Recovery": 4, "Grizzly Bears": 32}
    hand = ["Forest", "Forest", "Llanowar Elves", "Bala Ged Recovery", "Grizzly Bears", "Grizzly Bears", "Grizzly Bears"]

    report = analyze_hand(counts, hand, cards, PlayDraw.PLAY, trials=1000)

    assert report["lands_in_hand"] == 2
    assert report["effective_lands_in_hand"] == 4
    assert {source.card_name for source in report["hand_land_equivalent_sources"]} == {
        "Bala Ged Recovery",
        "Llanowar Elves",
    }
