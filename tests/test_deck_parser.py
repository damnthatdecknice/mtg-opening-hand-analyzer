from __future__ import annotations

from mtg_hand_analyzer.deck_parser import (
    analysis_counts_for_hand,
    parse_decklist,
    recognition_counts,
    validate_hand_counts,
)


def test_arena_deck_with_sideboard_and_punctuation() -> None:
    deck = parse_decklist(
        """
        Deck
        4 Imodane's Recruiter
        2 Invasion of Gobakhan
        1 Wear // Tear
        4 Boseiju, Who Endures

        Sideboard
        3 Destroy Evil
        1 Urabrask's Forge
        """
    )
    assert not deck.issues
    assert deck.main_total == 11
    assert deck.sideboard_total == 4
    assert deck.main_counts()["Boseiju, Who Endures"] == 4


def test_blank_lines_duplicate_lines_and_headings() -> None:
    deck = parse_decklist("Main Deck\n2 Mountain\n\n3 Mountain\nSideboard\n1 Rest in Peace")
    assert deck.main_counts()["Mountain"] == 5
    assert deck.sideboard_counts()["Rest in Peace"] == 1


def test_invalid_and_missing_quantities_report_issues() -> None:
    deck = parse_decklist("Deck\nLightning Strike\n0 Mountain")
    assert len(deck.issues) == 2
    assert deck.main_total == 0


def test_hand_copy_validation() -> None:
    errors = validate_hand_counts({"Mountain": 2, "Lightning Strike": 4}, ["Mountain"] * 3 + ["Lightning Strike"] * 4)
    assert errors == ["Mountain: hand has 3, deck contains 2."]


def test_sideboard_cards_are_available_for_recognition_only_by_default() -> None:
    main = {"Mountain": 4, "Lightning Strike": 4}
    sideboard = {"Destroy Evil": 2}

    assert recognition_counts(main, sideboard)["Destroy Evil"] == 2
    effective, seen = analysis_counts_for_hand(main, sideboard, ["Mountain", "Lightning Strike"])

    assert "Destroy Evil" not in effective
    assert seen == []


def test_observed_sideboard_card_is_added_to_analysis_counts() -> None:
    main = {"Mountain": 4, "Lightning Strike": 4}
    sideboard = {"Destroy Evil": 2}
    hand = ["Mountain"] * 3 + ["Lightning Strike"] * 3 + ["Destroy Evil"]

    effective, seen = analysis_counts_for_hand(main, sideboard, hand)

    assert effective["Destroy Evil"] == 1
    assert seen == ["Destroy Evil"]
    assert validate_hand_counts(effective, hand) == []
