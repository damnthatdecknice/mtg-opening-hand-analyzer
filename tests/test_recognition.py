from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance

from mtg_hand_analyzer.card_data import FixtureCardDataProvider
from mtg_hand_analyzer.card_recognition import apply_global_card_assignment, ensure_artwork, recognize_crops, trim_dark_border
from mtg_hand_analyzer.models import CardData, CropBox, RecognitionCandidate
from mtg_hand_analyzer.settings import CARD_FIXTURE_PATH


def test_recognition_restricted_to_deck_and_top_three(tmp_path: Path) -> None:
    provider = FixtureCardDataProvider(CARD_FIXTURE_PATH)
    names = ["Lightning Strike", "Mountain", "Plains"]
    cards = {name: provider.get_card(name) for name in names}
    deck_cards = {name: card for name, card in cards.items() if card is not None}
    target = ensure_artwork(deck_cards["Lightning Strike"])
    crop = tmp_path / "crop.png"
    ImageEnhance.Brightness(Image.open(target).convert("RGB")).enhance(1.08).save(crop)
    results = recognize_crops([crop], [CropBox(x=0, y=0, width=100, height=140)], deck_cards)
    candidates = [candidate.card_name for candidate in results[0].candidates]
    assert "Lightning Strike" in candidates[:3]
    assert set(candidates).issubset(set(names))


def test_low_confidence_still_returns_manual_candidates(tmp_path: Path) -> None:
    provider = FixtureCardDataProvider(CARD_FIXTURE_PATH)
    card = provider.get_card("Lightning Strike")
    assert card is not None
    crop = tmp_path / "blank.png"
    Image.new("RGB", (240, 336), (0, 0, 0)).save(crop)
    result = recognize_crops([crop], [CropBox(x=0, y=0, width=100, height=140)], {"Lightning Strike": card})[0]
    assert result.candidates
    assert result.candidates[0].confidence_label in {"low", "medium", "high"}


def test_global_assignment_avoids_repeating_nonlands_when_alternative_is_close() -> None:
    cards = {
        "A": CardData(name="A", normalized_name="a", type_line="Instant"),
        "B": CardData(name="B", normalized_name="b", type_line="Creature"),
    }
    scored = [
        [
            RecognitionCandidate(card_name="A", score=0.90, confidence_label="high"),
            RecognitionCandidate(card_name="B", score=0.89, confidence_label="high"),
        ]
        for _ in range(5)
    ]

    assigned = apply_global_card_assignment(scored, cards)

    assert [row[0].card_name for row in assigned].count("A") == 4
    assert [row[0].card_name for row in assigned].count("B") == 1


def test_trim_dark_border_removes_preview_padding() -> None:
    image = Image.new("RGB", (100, 140), (0, 0, 0))
    inner = Image.new("RGB", (60, 90), (120, 140, 160))
    image.paste(inner, (20, 25))

    trimmed = trim_dark_border(np.array(image))

    assert trimmed.shape[0] < 140
    assert trimmed.shape[1] < 100
