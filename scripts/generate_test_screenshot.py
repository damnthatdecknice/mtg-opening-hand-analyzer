from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from PIL import Image, ImageDraw

from mtg_hand_analyzer.card_data import FixtureCardDataProvider
from mtg_hand_analyzer.card_recognition import ensure_artwork
from mtg_hand_analyzer.settings import CARD_FIXTURE_PATH, SAMPLE_HAND_PATH, SAMPLES_DIR, ensure_data_dirs


def generate(path: Path, resolution: tuple[int, int] = (1920, 1080)) -> Path:
    ensure_data_dirs()
    provider = FixtureCardDataProvider(CARD_FIXTURE_PATH)
    hand = [line.strip() for line in SAMPLE_HAND_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]
    canvas = Image.new("RGB", resolution, (22, 30, 38))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle((0, int(resolution[1] * 0.55), resolution[0], resolution[1]), fill=(34, 44, 54))
    card_w = int(resolution[0] * 0.115)
    card_h = int(card_w * 1.38)
    overlap = int(card_w * 0.18)
    total_w = len(hand) * card_w - (len(hand) - 1) * overlap
    x = (resolution[0] - total_w) // 2
    y = int(resolution[1] * 0.62)
    for index, name in enumerate(hand):
        card = provider.get_card(name)
        if card is None:
            continue
        art = Image.open(ensure_artwork(card)).convert("RGB").resize((card_w, card_h))
        angle = [-5, -3, -1, 0, 1, 3, 5][index]
        rotated = art.rotate(angle, expand=True, fillcolor=(20, 24, 30))
        canvas.paste(rotated, (x + index * (card_w - overlap), y - abs(index - 3) * 8))
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path)
    return path


if __name__ == "__main__":
    output = SAMPLES_DIR / "synthetic_arena_hand.png"
    print(generate(output))
