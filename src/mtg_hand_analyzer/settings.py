from __future__ import annotations

import sys
from pathlib import Path

if getattr(sys, "frozen", False):
    PROJECT_ROOT = Path(sys.executable).resolve().parent
    BUNDLED_ROOT = Path(getattr(sys, "_MEIPASS", PROJECT_ROOT))
else:
    PROJECT_ROOT = Path(__file__).resolve().parents[2]
    BUNDLED_ROOT = PROJECT_ROOT

DATA_DIR = PROJECT_ROOT / "data"
CACHE_DIR = DATA_DIR / "cache"
SAMPLES_DIR = DATA_DIR / "samples"
_BUNDLED_SAMPLES_DIR = BUNDLED_ROOT / "data" / "samples"
CARD_FIXTURE_PATH = (
    SAMPLES_DIR / "sample_cards.json"
    if (SAMPLES_DIR / "sample_cards.json").exists()
    else _BUNDLED_SAMPLES_DIR / "sample_cards.json"
)
SAMPLE_DECK_PATH = (
    SAMPLES_DIR / "sample_deck.txt"
    if (SAMPLES_DIR / "sample_deck.txt").exists()
    else _BUNDLED_SAMPLES_DIR / "sample_deck.txt"
)
SAMPLE_HAND_PATH = (
    SAMPLES_DIR / "sample_hand.txt"
    if (SAMPLES_DIR / "sample_hand.txt").exists()
    else _BUNDLED_SAMPLES_DIR / "sample_hand.txt"
)
APP_DB_PATH = CACHE_DIR / "app.sqlite"
CARD_DB_PATH = CACHE_DIR / "cards.sqlite"
CROP_DIR = CACHE_DIR / "crops"
ARTWORK_DIR = CACHE_DIR / "artwork"


def ensure_data_dirs() -> None:
    for path in [CACHE_DIR, SAMPLES_DIR, CROP_DIR, ARTWORK_DIR, SAMPLES_DIR / "user_arena_screenshots"]:
        path.mkdir(parents=True, exist_ok=True)
