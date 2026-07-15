from __future__ import annotations

from mtg_hand_analyzer.card_data import card_from_scryfall


def test_scryfall_mana_value_uses_castable_face_for_multiface_cards() -> None:
    card = card_from_scryfall(
        {
            "name": "Example Spell // Example Land",
            "cmc": 0,
            "type_line": "Instant // Land",
            "card_faces": [
                {
                    "name": "Example Spell",
                    "mana_cost": "{1}{U}",
                    "type_line": "Instant",
                    "oracle_text": "Draw a card.",
                },
                {
                    "name": "Example Land",
                    "mana_cost": "",
                    "type_line": "Land",
                    "oracle_text": "This land enters tapped.",
                },
            ],
        }
    )
    assert card.mana_cost == "{1}{U}"
    assert card.mana_value == 2


def test_scryfall_mana_value_double_checks_planeswalker_cost() -> None:
    card = card_from_scryfall(
        {
            "name": "Example Walker",
            "cmc": 99,
            "mana_cost": "{2}{R}{R}",
            "type_line": "Legendary Planeswalker - Example",
            "oracle_text": "+1: Do a thing.",
        }
    )
    assert card.mana_value == 4
