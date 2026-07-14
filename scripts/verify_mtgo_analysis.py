from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from mtg_hand_analyzer.analysis import analyze_hand
from mtg_hand_analyzer.card_cache import CardCache
from mtg_hand_analyzer.card_data import ScryfallProvider
from mtg_hand_analyzer.deck_parser import parse_decklist
from mtg_hand_analyzer.models import PlayDraw
from mtg_hand_analyzer.settings import CARD_DB_PATH


def main() -> None:
    deck = parse_decklist(os.environ["USER_DECK"])
    hand = [card.strip() for card in os.environ["USER_HAND"].split("|") if card.strip()]
    cache = CardCache(CARD_DB_PATH)
    provider = ScryfallProvider()
    cards = {
        name: card
        for name in deck.main_counts()
        if (card := cache.resolve(name, provider)) is not None
    }
    report = analyze_hand(deck.main_counts(), hand, cards, PlayDraw.PLAY, trials=1000, seed=7)
    print("lands_in_hand", report["lands_in_hand"])
    print("avg_mv", round(report["average_mana_value"], 2))
    for estimate in report["castability"]:
        print(estimate.card_name, {turn: round(value, 2) for turn, value in estimate.by_turn.items()})


if __name__ == "__main__":
    main()
