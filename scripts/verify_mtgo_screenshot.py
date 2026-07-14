from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from mtg_hand_analyzer.card_cache import CardCache
from mtg_hand_analyzer.card_data import ScryfallProvider
from mtg_hand_analyzer.card_recognition import recognize_crops
from mtg_hand_analyzer.deck_parser import parse_decklist
from mtg_hand_analyzer.screenshot_detection import detect_hand_region_boxes, load_image, save_crops
from mtg_hand_analyzer.settings import CARD_DB_PATH


def main() -> None:
    deck = parse_decklist(os.environ["USER_DECK"])
    image_path = Path(os.environ["USER_SCREENSHOT"])
    cache = CardCache(CARD_DB_PATH)
    provider = ScryfallProvider()
    cards = {}
    for name in deck.main_counts():
        card = cache.resolve(name, provider)
        if card:
            cards[name] = card
    image = load_image(image_path)
    boxes = detect_hand_region_boxes(image)
    crops = save_crops(image, boxes, prefix="verify_mtgo")
    results = recognize_crops(crops, boxes, cards)
    print(f"Resolved cards: {len(cards)}")
    for index, result in enumerate(results, start=1):
        candidates = [
            (
                candidate.card_name,
                round(candidate.score, 3),
                candidate.confidence_label,
                round(candidate.signals.get("title_strip", 0), 3),
            )
            for candidate in result.candidates
        ]
        print(index, candidates)


if __name__ == "__main__":
    main()
