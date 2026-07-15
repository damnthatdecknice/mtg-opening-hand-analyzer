from __future__ import annotations

from mtg_hand_analyzer.analysis import analyze_hand
from mtg_hand_analyzer.card_data import FixtureCardDataProvider
from mtg_hand_analyzer.deck_parser import parse_decklist
from mtg_hand_analyzer.models import PlayDraw
from mtg_hand_analyzer.settings import CARD_FIXTURE_PATH, SAMPLE_DECK_PATH, SAMPLE_HAND_PATH


def test_sample_workflow() -> None:
    deck = parse_decklist(SAMPLE_DECK_PATH.read_text(encoding="utf-8"))
    hand = [line.strip() for line in SAMPLE_HAND_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]
    provider = FixtureCardDataProvider(CARD_FIXTURE_PATH)
    cards = {name: card for name in deck.main_counts() if (card := provider.get_card(name)) is not None}
    report = analyze_hand(deck.main_counts(), hand, cards, PlayDraw.PLAY, trials=1000, seed=99)
    assert deck.main_total == 60
    assert report["library_size"] == 53
    assert report["lands_in_hand"] == 3
    assert report["lands_remaining"] == 25
    assert "Land" in report["category_probabilities"]
    assert "Hit land 8 by turn 8" in report["land_drop_probabilities"]
    assert "Next land by turn 8" in report["land_probabilities"]
    assert report["category_probabilities"]["Land"][-1].label == "Land by turn 8"
