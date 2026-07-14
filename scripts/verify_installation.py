from __future__ import annotations

from pathlib import Path

from mtg_hand_analyzer.analysis import analyze_hand
from mtg_hand_analyzer.card_data import FixtureCardDataProvider
from mtg_hand_analyzer.deck_parser import parse_decklist
from mtg_hand_analyzer.models import PlayDraw
from mtg_hand_analyzer.settings import CARD_FIXTURE_PATH, SAMPLE_DECK_PATH, SAMPLE_HAND_PATH


def main() -> None:
    deck = parse_decklist(SAMPLE_DECK_PATH.read_text(encoding="utf-8"))
    hand = [line.strip() for line in SAMPLE_HAND_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]
    provider = FixtureCardDataProvider(Path(CARD_FIXTURE_PATH))
    cards = {name: provider.get_card(name) for name in deck.main_counts()}
    resolved = {name: card for name, card in cards.items() if card is not None}
    report = analyze_hand(deck.main_counts(), hand, resolved, PlayDraw.PLAY, trials=1000, seed=1)
    print("Installation verified.")
    print(f"Main deck: {deck.main_total}")
    print(f"Confirmed hand: {len(hand)}")
    print(f"Remaining library: {report['library_size']}")


if __name__ == "__main__":
    main()
