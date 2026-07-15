from __future__ import annotations

from unittest.mock import Mock, patch

from mtg_hand_analyzer.card_data import ScryfallProvider, card_from_scryfall, scryfall_name_candidates, scryfall_query_name


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


def test_scryfall_query_name_strips_arena_set_annotations() -> None:
    assert scryfall_query_name("1 Llanowar Wastes (DMU) 245") == "Llanowar Wastes"


def test_scryfall_candidates_handle_split_card_separators() -> None:
    candidates = scryfall_name_candidates("Wear / Tear")

    assert "Wear // Tear" in candidates
    assert "Wear" in candidates


def test_scryfall_provider_retries_transient_failures() -> None:
    retry_response = Mock(status_code=503, headers={})
    success_response = Mock(status_code=200, headers={})
    success_response.json.return_value = {
        "name": "Professor Dellian Fel",
        "mana_cost": "{2}{B}{G}",
        "type_line": "Legendary Planeswalker — Dellian",
        "cmc": 4,
    }
    with patch("mtg_hand_analyzer.card_data.time.sleep"), patch(
        "mtg_hand_analyzer.card_data.requests.get",
        side_effect=[retry_response, success_response],
    ):
        card = ScryfallProvider(retries=1).get_card("Professor Dellian Fel")

    assert card is not None
    assert card.name == "Professor Dellian Fel"
    assert card.mana_value == 4
