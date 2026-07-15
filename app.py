from __future__ import annotations

import random
import sys
import tempfile
import base64
import html
from difflib import SequenceMatcher
import time
import zlib
from collections import Counter
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components
from PIL import Image

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from mtg_hand_analyzer.analysis import analyze_hand
from mtg_hand_analyzer.card_cache import CardCache
from mtg_hand_analyzer.card_data import FixtureCardDataProvider, ScryfallProvider
from mtg_hand_analyzer.card_draw import draw_look_depth
from mtg_hand_analyzer.card_recognition import recognize_crops
from mtg_hand_analyzer.deck_parser import (
    analysis_counts_for_hand,
    parse_decklist,
    recognition_counts as deck_recognition_counts,
    structural_warnings,
    validate_hand_counts,
)
from mtg_hand_analyzer.land_inference import enrich_card_data
from mtg_hand_analyzer.mana import mana_value_from_cost, parse_mana_cost
from mtg_hand_analyzer.models import CardData, CropBox, PlayDraw
from mtg_hand_analyzer.screenshot_detection import detect_hand_region_boxes, load_image, save_crops
from mtg_hand_analyzer.settings import CARD_DB_PATH, CARD_FIXTURE_PATH, SAMPLE_DECK_PATH, ensure_data_dirs

st.set_page_config(page_title="MTG Opening Hand Analyzer", layout="wide")
ensure_data_dirs()

card_cache = CardCache(CARD_DB_PATH)
fixture_provider = FixtureCardDataProvider(CARD_FIXTURE_PATH)
paste_image_component = components.declare_component(
    "paste_image_component",
    path=str(ROOT / "components" / "clipboard_image"),
)
title_ocr_component = components.declare_component(
    "title_ocr_component",
    path=str(ROOT / "components" / "title_ocr"),
)


def jace_background_data_uri() -> str:
    background_path = ROOT / "assets" / "jace_user_background.png"
    encoded = base64.b64encode(background_path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def inject_theme() -> None:
    css = (
        """
        <style>
          :root {
            --jace-bg: #030711;
            --jace-overlay: rgba(2, 7, 17, 0.34);
            --jace-panel: rgba(9, 18, 33, 0.78);
            --jace-panel-strong: rgba(11, 23, 42, 0.86);
            --jace-border: rgba(128, 205, 255, 0.34);
            --jace-border-soft: rgba(130, 157, 198, 0.22);
            --jace-text: #f4f9ff;
            --jace-muted: #adc3dd;
            --jace-faint: #7f94ae;
            --jace-cyan: #65d8ff;
            --jace-violet: #9c8cff;
            --jace-gold: #e2c174;
            --jace-danger: #ff7464;
            --jace-success: #7de0b1;
            --jace-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
            --content-rail-width: min(920px, 68vw);
          }
          .stApp {
            background: var(--jace-bg);
            color: var(--jace-text);
          }
          .jace-bg-layer,
          .jace-bg-shade {
            position: fixed;
            inset: 0;
            pointer-events: none;
          }
          .jace-bg-layer {
            background-image: url("__JACE_BG__");
            background-position: center right;
            background-repeat: no-repeat;
            background-size: cover;
            opacity: 1;
            z-index: 0;
          }
          .jace-bg-shade {
            background:
              linear-gradient(90deg, rgba(2,7,17,0.68) 0%, rgba(2,7,17,0.44) 37%, rgba(2,7,17,0.24) 68%, rgba(2,7,17,0.12) 100%),
              linear-gradient(180deg, rgba(2,7,17,0.28), rgba(2,7,17,0.42));
            z-index: 0;
          }
          .stApp::before {
            content: "";
            position: fixed;
            inset: 0;
            pointer-events: none;
            background:
              radial-gradient(ellipse at 46% 48%, rgba(4, 9, 18, 0.38) 0%, rgba(4, 9, 18, 0.18) 42%, rgba(4, 9, 18, 0.02) 72%),
              linear-gradient(90deg, rgba(1, 5, 13, 0.3), transparent 32%, transparent 83%, rgba(1, 5, 13, 0.02));
            z-index: 0;
          }
          .stApp::after {
            content: "";
            position: fixed;
            inset: 0;
            pointer-events: none;
            background:
              linear-gradient(180deg, rgba(255,255,255,0.035), transparent 18rem),
              radial-gradient(circle at 78% 32%, rgba(101, 216, 255, 0.08), transparent 18rem);
            opacity: 0.28;
            z-index: 0;
          }
          .block-container {
            max-width: 1480px;
            padding-top: 1.35rem;
            position: relative;
            z-index: 1;
          }
          div[data-testid="stTabs"] {
            max-width: var(--content-rail-width);
          }
          div[data-testid="stTabs"] > div:first-child {
            border-bottom-color: rgba(128, 205, 255, 0.18);
          }
          .stMarkdown, .stText, .stCaption, p, li, label, span {
            color: inherit;
          }
          .mtg-header {
            border: 1px solid var(--jace-border);
            border-radius: 10px;
            background:
              linear-gradient(135deg, rgba(13, 31, 56, 0.62), rgba(5, 11, 22, 0.58)),
              radial-gradient(circle at 92% 0%, rgba(101, 216, 255, 0.1), transparent 22rem);
            backdrop-filter: blur(12px) saturate(130%);
            box-shadow: var(--jace-shadow), inset 0 1px 0 rgba(255,255,255,0.1);
            padding: 16px 24px 18px;
            margin-bottom: 14px;
            max-width: var(--content-rail-width);
            position: relative;
            overflow: hidden;
          }
          .mtg-header::before {
            content: "";
            position: absolute;
            inset: 0;
            background:
              linear-gradient(118deg, transparent 0 54%, rgba(101, 216, 255, 0.14) 54.2% 54.5%, transparent 54.8% 100%),
              linear-gradient(62deg, transparent 0 69%, rgba(156, 140, 255, 0.12) 69.2% 69.6%, transparent 69.8% 100%);
            opacity: 0.8;
            pointer-events: none;
          }
          .mtg-header::after {
            content: "";
            position: absolute;
            left: 0;
            right: 0;
            bottom: 0;
            height: 3px;
            background: linear-gradient(90deg, transparent, var(--jace-cyan), var(--jace-violet), transparent);
          }
          .mtg-kicker {
            color: var(--jace-gold);
            font-size: 0.78rem;
            font-weight: 800;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            position: relative;
          }
          .mtg-title {
            color: var(--jace-text);
            font-size: clamp(1.8rem, 3.4vw, 3.2rem);
            font-weight: 900;
            letter-spacing: 0;
            line-height: 1.02;
            margin: 4px 0 8px;
            position: relative;
            text-shadow: 0 0 18px rgba(101, 216, 255, 0.22);
          }
          .mtg-subtitle {
            color: var(--jace-muted);
            font-size: 1rem;
            margin: 0;
            max-width: 820px;
            position: relative;
          }
          div[data-testid="stTabs"] button {
            border-radius: 8px 8px 0 0;
            color: var(--jace-muted);
            font-weight: 800;
            padding-top: 0.65rem;
            padding-bottom: 0.65rem;
            min-height: 2.35rem;
          }
          div[data-testid="stTabs"] button[aria-selected="true"] {
            color: var(--jace-text);
            border-bottom-color: var(--jace-cyan);
            background: linear-gradient(180deg, rgba(101, 216, 255, 0.1), rgba(101, 216, 255, 0));
          }
          div[data-testid="stMetric"] {
            background: linear-gradient(180deg, rgba(14, 29, 50, 0.84), rgba(7, 13, 24, 0.82));
            border: 1px solid var(--jace-border-soft);
            border-radius: 10px;
            padding: 14px 16px;
            backdrop-filter: blur(10px) saturate(120%);
            box-shadow: 0 12px 28px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.08);
          }
          div[data-testid="stMetric"] label {
            color: var(--jace-muted);
            font-weight: 800;
          }
          div[data-testid="stMetricValue"] {
            color: var(--jace-text);
            font-weight: 900;
          }
          div[data-testid="stExpander"],
          div[data-testid="stDataFrame"],
          div[data-testid="stFileUploader"],
          div[data-testid="stTextArea"] textarea,
          div[data-testid="stSelectbox"] div[data-baseweb="select"] > div,
          div[data-testid="stNumberInput"] input {
            border-color: var(--jace-border-soft);
          }
          div[data-testid="stTextArea"] textarea,
          div[data-testid="stTextInput"] input,
          div[data-testid="stNumberInput"] input {
            background: rgba(3, 8, 17, 0.96);
            color: var(--jace-text);
            border-radius: 6px;
            caret-color: var(--jace-cyan);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 28px rgba(0,0,0,0.2);
            max-width: var(--content-rail-width);
          }
          div[data-testid="stSelectbox"] div[data-baseweb="select"] > div,
          div[data-testid="stFileUploader"] section {
            background: rgba(6, 13, 25, 0.94);
            color: var(--jace-text);
            border-radius: 8px;
          }
          div[data-testid="stSelectbox"] div[data-baseweb="select"] {
            min-width: 0;
          }
          div[data-testid="stSelectbox"] div[data-baseweb="select"] span {
            white-space: normal;
            line-height: 1.2;
          }
          div[data-testid="stDataFrame"] {
            background: rgba(5, 10, 19, 0.9);
            border-radius: 8px;
            max-width: var(--content-rail-width);
          }
          div[data-testid="stVegaLiteChart"],
          div[data-testid="stImage"],
          div[data-testid="stAlert"],
          div[data-testid="stExpander"],
          iframe {
            max-width: var(--content-rail-width);
          }
          img {
            opacity: 1;
            mix-blend-mode: normal;
          }
          .stButton > button {
            background: linear-gradient(135deg, rgba(32, 115, 178, 0.92), rgba(23, 34, 74, 0.92));
            border: 1px solid rgba(101, 216, 255, 0.58);
            border-radius: 6px;
            color: var(--jace-text);
            font-weight: 850;
            box-shadow: 0 10px 24px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.04) inset;
          }
          .stButton > button:hover {
            border-color: var(--jace-gold);
            color: #ffffff;
            background: linear-gradient(135deg, rgba(43, 141, 209, 0.96), rgba(33, 45, 92, 0.96));
          }
          .stButton > button:focus,
          .stButton > button:focus-visible,
          textarea:focus,
          input:focus {
            outline: 2px solid rgba(101, 216, 255, 0.72);
            outline-offset: 2px;
          }
          .stButton > button:disabled,
          .stButton > button[disabled] {
            background: rgba(24, 35, 52, 0.82);
            border-color: rgba(126, 148, 174, 0.26);
            color: rgba(230, 239, 250, 0.55);
            box-shadow: none;
          }
          .stAlert {
            border-radius: 8px;
            border: 1px solid var(--jace-border-soft);
            background: rgba(8, 16, 29, 0.92);
          }
          h2, h3 {
            letter-spacing: 0;
            color: var(--jace-text);
            max-width: var(--content-rail-width);
          }
          h2 {
            margin-top: 0.85rem;
            margin-bottom: 0.65rem;
          }
          hr {
            max-width: var(--content-rail-width);
            border-color: rgba(128, 205, 255, 0.18);
          }
          code {
            background: rgba(101, 216, 255, 0.12);
            color: #d9f6ff;
            border: 1px solid rgba(101, 216, 255, 0.2);
            border-radius: 5px;
            padding: 0.1rem 0.32rem;
          }
          .section-card {
            background:
              linear-gradient(135deg, rgba(15, 33, 58, 0.86), rgba(6, 12, 24, 0.82)),
              radial-gradient(circle at 92% 12%, rgba(101, 216, 255, 0.12), transparent 18rem);
            border: 1px solid var(--jace-border-soft);
            border-radius: 10px;
            padding: 14px 18px 16px;
            margin: 10px 0 16px;
            max-width: var(--content-rail-width);
            backdrop-filter: blur(10px) saturate(118%);
            box-shadow: var(--jace-shadow), inset 0 1px 0 rgba(255,255,255,0.08);
            position: relative;
            overflow: hidden;
          }
          .section-card.wide {
            max-width: min(1080px, 76vw);
          }
          .section-card::before {
            content: "";
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 3px;
            background: linear-gradient(180deg, var(--jace-cyan), var(--jace-violet));
            opacity: 0.9;
          }
          .section-card::after {
            content: "";
            position: absolute;
            left: 18px;
            right: 18px;
            bottom: 0;
            height: 1px;
            background: linear-gradient(90deg, rgba(101,216,255,0.4), transparent 65%);
          }
          .section-card .mtg-kicker,
          .section-card .mtg-subtitle {
            position: relative;
          }
          .section-card .mtg-subtitle {
            line-height: 1.55;
          }
          @media (max-width: 900px) {
            .jace-bg-layer {
              background-position: 68% top;
              background-size: auto 100%;
            }
            .mtg-header,
            .section-card {
              max-width: 100%;
            }
            .mtg-header { padding: 14px 16px 16px; }
          }
          @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
              scroll-behavior: auto !important;
              transition-duration: 0.001ms !important;
              animation-duration: 0.001ms !important;
              animation-iteration-count: 1 !important;
            }
          }
        </style>
        """
    ).replace("__JACE_BG__", jace_background_data_uri())
    st.markdown(
        css,
        unsafe_allow_html=True,
    )


def render_header() -> None:
    st.markdown(
        """
        <div class="jace-bg-layer" aria-hidden="true"></div>
        <div class="jace-bg-shade" aria-hidden="true"></div>
        <div class="mtg-header">
          <div class="mtg-kicker">Competitive opener lab</div>
          <div class="mtg-title">MTG Opening Hand Analyzer</div>
          <p class="mtg-subtitle">Opening-hand math for Magic</p>
        </div>
        """,
        unsafe_allow_html=True,
    )


def section_panel(title: str, body: str, *, wide: bool = False) -> None:
    card_class = "section-card wide" if wide else "section-card"
    st.markdown(
        f"""
        <div class="{card_class}">
          <div class="mtg-kicker">{html.escape(title)}</div>
          <div class="mtg-subtitle">{html.escape(body)}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def content_rail(main_ratio: float = 0.68):
    return st.columns([main_ratio, 1 - main_ratio], gap="large")


def init_state() -> None:
    default_deck = SAMPLE_DECK_PATH.read_text(encoding="utf-8") if SAMPLE_DECK_PATH.exists() else ""
    saved_deck = decode_deck_param(st.query_params.get("deck", ""))
    defaults = {
        "deck_text": saved_deck or default_deck,
        "confirmed_hand": [],
        "recognition_results": [],
        "crop_paths": [],
        "boxes": [],
        "play_draw": PlayDraw.PLAY.value,
        "trials": 5000,
        "seed": 20260714,
        "last_pasted_image_timestamp": 0,
        "ocr_results": [],
        "crop_adjust_x": 0,
        "crop_adjust_y": 0,
        "crop_adjust_width": 100,
        "crop_adjust_height": 100,
    }
    for key, value in defaults.items():
        st.session_state.setdefault(key, value)


def encode_deck_param(deck_text: str) -> str:
    if not deck_text.strip():
        return ""
    compressed = zlib.compress(deck_text.encode("utf-8"))
    return base64.urlsafe_b64encode(compressed).decode("ascii").rstrip("=")


def decode_deck_param(raw: str) -> str:
    if not raw:
        return ""
    try:
        padded = raw + "=" * (-len(raw) % 4)
        return zlib.decompress(base64.urlsafe_b64decode(padded)).decode("utf-8")
    except Exception:
        return ""


def remember_deck_in_url(deck_text: str) -> None:
    encoded = encode_deck_param(deck_text)
    if encoded:
        st.query_params["deck"] = encoded
    elif "deck" in st.query_params:
        del st.query_params["deck"]


def pasted_image_path(payload: dict | None) -> Path | None:
    if not payload or not isinstance(payload, dict):
        return None
    data_url = payload.get("dataUrl", "")
    if not isinstance(data_url, str) or "," not in data_url:
        return None
    header, encoded = data_url.split(",", 1)
    suffix = ".png"
    if "jpeg" in header or "jpg" in header:
        suffix = ".jpg"
    elif "webp" in header:
        suffix = ".webp"
    try:
        image_bytes = base64.b64decode(encoded)
    except Exception:
        return None
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
        handle.write(image_bytes)
        return Path(handle.name)


def image_data_url(path: Path) -> str:
    suffix = path.suffix.lower()
    mime = "image/png"
    if suffix in {".jpg", ".jpeg"}:
        mime = "image/jpeg"
    elif suffix == ".webp":
        mime = "image/webp"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def crop_adjustment_controls(prefix: str) -> tuple[int, int, int, int]:
    with st.expander("Adjust detected card row", expanded=False):
        st.caption("Use these when the seven crop previews are shifted, too narrow, or clipping the card names.")
        c1, c2, c3, c4, c5 = st.columns([1, 1, 1, 1, 1])
        x_offset = c1.slider("Move sideways", -120, 120, int(st.session_state.crop_adjust_x), 2, key=f"{prefix}_crop_x")
        y_offset = c2.slider("Move up/down", -120, 120, int(st.session_state.crop_adjust_y), 2, key=f"{prefix}_crop_y")
        width_pct = c3.slider("Crop width", 75, 135, int(st.session_state.crop_adjust_width), 1, key=f"{prefix}_crop_w")
        height_pct = c4.slider("Crop height", 75, 140, int(st.session_state.crop_adjust_height), 1, key=f"{prefix}_crop_h")
        if c5.button("Reset", key=f"{prefix}_crop_reset"):
            for key, value in {
                "crop_adjust_x": 0,
                "crop_adjust_y": 0,
                "crop_adjust_width": 100,
                "crop_adjust_height": 100,
            }.items():
                st.session_state[key] = value
            st.rerun()
        st.session_state.crop_adjust_x = x_offset
        st.session_state.crop_adjust_y = y_offset
        st.session_state.crop_adjust_width = width_pct
        st.session_state.crop_adjust_height = height_pct
    return x_offset, y_offset, width_pct, height_pct


def adjusted_crop_boxes(
    boxes: list[CropBox],
    image_width: int,
    image_height: int,
    x_offset: int,
    y_offset: int,
    width_pct: int,
    height_pct: int,
) -> list[CropBox]:
    adjusted: list[CropBox] = []
    for box in boxes:
        new_width = min(image_width, max(8, int(round(box.width * width_pct / 100))))
        new_height = min(image_height, max(8, int(round(box.height * height_pct / 100))))
        center_x = box.x + box.width // 2 + x_offset
        center_y = box.y + box.height // 2 + y_offset
        x = max(0, min(image_width - new_width, center_x - new_width // 2))
        y = max(0, min(image_height - new_height, center_y - new_height // 2))
        adjusted.append(
            CropBox(
                x=int(x),
                y=int(y),
                width=int(min(new_width, image_width - x)),
                height=int(min(new_height, image_height - y)),
                confidence=box.confidence,
            )
        )
    return adjusted


def clean_ocr_text(text: str) -> str:
    return " ".join("".join(ch if ch.isalnum() or ch in " '-,/" else " " for ch in text).split()).strip()


def best_ocr_match(text: str, options: list[str]) -> tuple[str | None, float]:
    cleaned = clean_ocr_text(text).casefold()
    if not cleaned:
        return None, 0.0
    best_name = None
    best_score = 0.0
    for option in options:
        option_key = option.casefold()
        score = SequenceMatcher(None, cleaned, option_key).ratio()
        if cleaned in option_key:
            score = max(score, min(1.0, len(cleaned) / max(1, len(option_key)) + 0.2))
        if score > best_score:
            best_name = option
            best_score = score
    return best_name, best_score


def ocr_result_map() -> dict[int, dict]:
    results = st.session_state.get("ocr_results", [])
    if not isinstance(results, list):
        return {}
    mapped: dict[int, dict] = {}
    for result in results:
        if isinstance(result, dict) and isinstance(result.get("id"), int):
            mapped[result["id"]] = result
    return mapped


def process_screenshot(image_path: Path, prefix: str) -> None:
    st.image(Image.open(image_path), caption="Screenshot", width="stretch")
    image = load_image(image_path)
    boxes = detect_hand_region_boxes(image)
    if boxes and max(box.confidence for box in boxes) <= 0.36:
        st.warning("Card positions were estimated instead of confidently detected. If the crops look wrong, use a tighter screenshot around the hand or upload a different screenshot size.")
    x_offset, y_offset, width_pct, height_pct = crop_adjustment_controls(prefix)
    boxes = adjusted_crop_boxes(boxes, image.shape[1], image.shape[0], x_offset, y_offset, width_pct, height_pct)
    crop_signature = f"{image_path}:{x_offset}:{y_offset}:{width_pct}:{height_pct}"
    if st.session_state.get("crop_signature") != crop_signature:
        st.session_state.crop_signature = crop_signature
        st.session_state.ocr_results = []
        st.session_state.recognition_signature = ""
    crop_paths = save_crops(image, boxes, prefix=prefix)
    st.session_state.boxes = [box.model_dump() for box in boxes]
    st.session_state.crop_paths = [str(path) for path in crop_paths]
    crop_cols = st.columns(7)
    for idx, path in enumerate(crop_paths):
        with crop_cols[idx]:
            st.image(str(path), caption=f"Crop {idx + 1}")
    if crop_paths:
        ocr_payload = title_ocr_component(
            crops=[{"id": index, "dataUrl": image_data_url(path)} for index, path in enumerate(crop_paths)],
            key=f"title_ocr_{prefix}",
            default=None,
            height=54,
        )
        if isinstance(ocr_payload, dict) and ocr_payload.get("results"):
            st.session_state.ocr_results = ocr_payload["results"]
    counts = recognition_counts()
    recognition_signature = f"{crop_signature}:{sorted(counts.items())}"
    if crop_paths and counts and st.session_state.get("recognition_signature") != recognition_signature:
        with st.spinner("Reading crops and matching cards..."):
            cards = resolve_cards(list(counts))
            results = recognize_crops(crop_paths, boxes, cards)
        st.session_state.recognition_signature = recognition_signature
        st.session_state.recognition_results = [result.model_dump(mode="json") for result in results]
        st.success("Card candidates generated. Confirm or correct the seven cards below.")


def resolve_cards(names: list[str], retry_delay_seconds: float = 0.75) -> dict[str, CardData]:
    provider = ScryfallProvider(retries=3)
    cards: dict[str, CardData] = {}
    for name in names:
        card = card_cache.resolve(name, provider, force_refresh=True)
        if not card:
            time.sleep(retry_delay_seconds)
            card = card_cache.resolve(name, provider, force_refresh=True)
        if not card:
            card = fixture_provider.get_card(name)
        cards[name] = enrich_card_data(name, card)
    return cards


def retry_card_lookups(names: list[str], delay_seconds: float = 0.75) -> dict[str, CardData]:
    cards: dict[str, CardData] = {}
    for index, name in enumerate(names):
        if index:
            time.sleep(delay_seconds)
        cards.update(resolve_cards([name], retry_delay_seconds=delay_seconds))
    return cards


def failed_lookup_names_from_cards(counts: dict[str, int], cards: dict[str, CardData]) -> list[str]:
    return [
        row["card"]
        for row in mana_value_audit_rows(counts, cards)
        if row["status"] in {"Missing", "Lookup failed"}
    ]


def card_payloads(cards: dict[str, CardData]) -> dict[str, dict]:
    return {name: card.model_dump() for name, card in cards.items()}


def parsed_deck():
    return parse_decklist(st.session_state.deck_text)


def main_counts() -> dict[str, int]:
    return parsed_deck().main_counts()


def sideboard_counts() -> dict[str, int]:
    return parsed_deck().sideboard_counts()


def recognition_counts() -> dict[str, int]:
    return deck_recognition_counts(main_counts(), sideboard_counts())


def effective_counts_for_hand(hand: list[str]) -> tuple[dict[str, int], list[str]]:
    return analysis_counts_for_hand(main_counts(), sideboard_counts(), hand)


def fmt_pct(value: float) -> str:
    return f"{max(0.0, min(1.0, value)):.1%}"


def score_label(score: int) -> str:
    if score >= 80:
        return "strong keep signal"
    if score >= 65:
        return "reasonable keep signal"
    if score >= 45:
        return "context-dependent"
    return "high mulligan pressure"


def hand_texture_score(report: dict, castability: dict) -> int:
    lands = report.get("effective_lands_in_hand", report["lands_in_hand"])
    score = 50
    if lands in {2, 3}:
        score += 18
    elif lands in {1, 4}:
        score += 2
    else:
        score -= 18
    score += min(18, report["early_plays"][1] * 6 + report["early_plays"][2] * 3)
    if report["hand_draw_sources"]:
        score += min(12, sum(source.cards_seen for source in report["hand_draw_sources"]) * 3)
    if report["average_mana_value"] > 3.0 and lands < 3:
        score -= 12
    if castability and all(estimate.by_turn.get(2, 0.0) < 0.5 for estimate in castability.values()):
        score -= 15
    return max(0, min(100, score))


def opening_hand_tags(report: dict, hand: list[str], cards: dict[str, CardData], castability: dict) -> list[str]:
    tags: list[str] = []
    lands = report.get("lands_in_hand", 0)
    effective_sources = report.get("effective_lands_in_hand", lands)
    early_play_count = report["early_plays"].get(1, 0) + report["early_plays"].get(2, 0)
    spells = [name for name in hand if cards.get(name) and not cards[name].is_land]
    avg_mv = report.get("average_mana_value", 0.0)
    if lands <= 1:
        tags.append("mana light")
    elif lands >= 5:
        tags.append("flood risk")
    elif lands in {2, 3}:
        tags.append("normal land count")
    if effective_sources > lands:
        tags.append("has land-equivalent ramp")
    if early_play_count:
        tags.append("early play available")
    else:
        tags.append("slow start")
    if report.get("hand_draw_sources"):
        tags.append("has card selection")
    if report.get("hand_ramp_sources"):
        tags.append("has ramp")
    if avg_mv >= 3.0 and lands < 3:
        tags.append("top-heavy for its lands")
    if castability and spells:
        weak_casts = [
            name
            for name in spells
            if castability.get(name) and max(castability[name].by_turn.get(1, 0.0), castability[name].by_turn.get(2, 0.0)) < 0.45
        ]
        if len(weak_casts) >= max(1, len(spells) // 2):
            tags.append("castability concern")
    if report.get("observed_sideboard_cards"):
        tags.append("sideboard card seen")
    if not tags:
        tags.append("clean but unremarkable")
    return tags


def land_sentence(lands_in_hand: int, third_land: float, fourth_land: float) -> str:
    if lands_in_hand >= 4:
        return "You already have several lands; the main risk to watch is drawing too many more lands."
    if lands_in_hand == 3:
        return f"This is a three-land hand. The 4th land by turn 4 is {fmt_pct(fourth_land)}."
    if lands_in_hand == 2:
        return f"This is a two-land hand. The 3rd land by turn 3 is {fmt_pct(third_land)}."
    return f"This is a low-land hand. The 3rd land by turn 3 is {fmt_pct(third_land)}."


def effective_source_sentence(report: dict) -> str:
    actual = report["lands_in_hand"]
    effective = report.get("effective_lands_in_hand", actual)
    equivalents = report.get("hand_land_equivalent_sources", [])
    if effective == actual:
        return "No land-equivalent ramp sources were found in the confirmed hand."
    names = ", ".join(source.card_name for source in equivalents)
    return f"This hand has {actual} actual land(s), but plays closer to {effective} mana source(s) because of {names}."


def card_draw_sentence(hand_sources, library_sources) -> str:
    if hand_sources:
        names = ", ".join(source.card_name for source in hand_sources)
        return f"You have card draw/selection in hand: {names}."
    if library_sources:
        return f"You do not have card draw in hand, but {len(library_sources)} draw/look source(s) remain in the library."
    return "No clear card-draw effects were found from the available card text."


def parse_pasted_hand(text: str, counts: dict[str, int]) -> list[str]:
    normalized_to_name = {name.casefold(): name for name in counts}
    selected: list[str] = []
    for raw_line in text.splitlines():
        line = " ".join(raw_line.strip().split())
        if not line:
            continue
        if " " in line and line.split(" ", 1)[0].isdigit():
            qty_text, name = line.split(" ", 1)
            qty = int(qty_text)
        else:
            qty, name = 1, line
        matched = normalized_to_name.get(name.casefold())
        if matched:
            selected.extend([matched] * qty)
    return selected[:7]


def required_colors(spells: list[str], cards: dict[str, CardData]) -> list[str]:
    required: set[str] = set()
    for name in spells:
        card = cards.get(name)
        if not card:
            continue
        parsed, _generic, _warnings = parse_mana_cost(card.mana_cost)
        required.update(parsed)
    return sorted(required)


def is_interaction(card: CardData) -> bool:
    text = card.oracle_text.casefold()
    terms = [
        "counter target",
        "deals",
        "damage to",
        "destroy target",
        "exile target",
        "return target",
        "tap target",
        "can't attack",
        "gets -",
    ]
    return any(term in text for term in terms)


def is_threat(card: CardData) -> bool:
    text = card.oracle_text.casefold()
    return "Creature" in card.type_line or "Planeswalker" in card.type_line or "create" in text or "token" in text


def has_current_colors(spell_name: str, lands: list[str], cards: dict[str, CardData]) -> bool:
    card = cards.get(spell_name)
    if not card:
        return False
    required, _generic, _warnings = parse_mana_cost(card.mana_cost)
    available = {color for name in lands for color in cards[name].produced_mana}
    return all(color in available for color in required)


def texture_score_for_cards(hand: list[str], cards: dict[str, CardData]) -> int:
    lands = [name for name in hand if cards.get(name) and cards[name].is_land]
    spells = [name for name in hand if cards.get(name) and not cards[name].is_land]
    land_count = len(lands)
    score = 50
    if land_count in {2, 3}:
        score += 18
    elif land_count in {1, 4}:
        score += 2
    else:
        score -= 18
    one_drops = sum(1 for name in spells if cards[name].mana_value <= 1 and has_current_colors(name, lands, cards))
    two_drops = sum(1 for name in spells if cards[name].mana_value <= 2 and has_current_colors(name, lands, cards))
    score += min(18, one_drops * 6 + two_drops * 3)
    score += min(12, sum(draw_look_depth(cards[name]) for name in spells) * 3)
    nonland_mv = [cards[name].mana_value for name in spells]
    average_mv = sum(nonland_mv) / len(nonland_mv) if nonland_mv else 0.0
    if average_mv > 3.0 and land_count < 3:
        score -= 12
    if spells and two_drops == 0:
        score -= 15
    return max(0, min(100, score))


def best_mulligan_six(opening_seven: list[str], cards: dict[str, CardData]) -> tuple[list[str], str, int]:
    best_hand = opening_seven[:6]
    best_bottom = opening_seven[6]
    best_score = -1
    for index, card_name in enumerate(opening_seven):
        kept = opening_seven[:index] + opening_seven[index + 1 :]
        score = texture_score_for_cards(kept, cards)
        if score > best_score:
            best_hand = kept
            best_bottom = card_name
            best_score = score
    return best_hand, best_bottom, best_score


def mulligan_comparison_lines(counts: dict[str, int], cards: dict[str, CardData], current_score: int, samples: int = 1500) -> list[str]:
    deck_cards = [name for name, qty in counts.items() for _ in range(qty)]
    if len(deck_cards) < 7:
        return ["Not enough main-deck cards to simulate a fresh 7."]
    rng = random.Random(20260714)
    scores: list[int] = []
    bottomed: Counter[str] = Counter()
    land_counts: Counter[int] = Counter()
    for _ in range(samples):
        shuffled = deck_cards[:]
        rng.shuffle(shuffled)
        kept_six, bottom_card, best_score = best_mulligan_six(shuffled[:7], cards)
        scores.append(best_score)
        bottomed[bottom_card] += 1
        land_counts[sum(1 for name in kept_six if cards.get(name) and cards[name].is_land)] += 1
    scores.sort()
    average = sum(scores) / len(scores)
    median = scores[len(scores) // 2]
    better = sum(1 for score in scores if score > current_score) / len(scores)
    same_or_better = sum(1 for score in scores if score >= current_score) / len(scores)
    p25 = scores[len(scores) // 4]
    p75 = scores[(len(scores) * 3) // 4]
    common_bottoms = ", ".join(f"{name} ({count / samples:.0%})" for name, count in bottomed.most_common(3))
    land_mix = ", ".join(f"{lands} land: {count / samples:.0%}" for lands, count in sorted(land_counts.items()))
    return [
        f"Current hand texture: {current_score}/100.",
        f"Simulated mulligan-to-six average: {average:.1f}/100; median: {median}/100.",
        f"Middle half of mulligan outcomes: {p25}/100 to {p75}/100.",
        f"Fresh 7 then bottom 1 is better about {better:.1%} of the time.",
        f"Fresh 7 then bottom 1 is at least as good about {same_or_better:.1%} of the time.",
        f"Typical kept-six land counts: {land_mix}.",
        f"Most commonly bottomed cards: {common_bottoms}.",
        "This is a seeded simulation, not exact matchup EV.",
    ]


def sequencing_notes(lands: list[str], spells: list[str], cards: dict[str, CardData], castability: dict) -> list[str]:
    notes: list[str] = []
    shock_lands = [name for name in lands if "you may pay 2 life" in cards[name].oracle_text.casefold()]
    fast_lands = [name for name in lands if "two or fewer other lands" in cards[name].oracle_text.casefold()]
    tapped_lands = [
        name
        for name in lands
        if "enters tapped" in cards[name].oracle_text.casefold() and name not in shock_lands and name not in fast_lands
    ]
    if shock_lands:
        notes.append("Shock land option: " + ", ".join(shock_lands) + " can preserve tempo if paying 2 life matters.")
    if fast_lands:
        notes.append("Fast land timing: " + ", ".join(fast_lands) + " is best early before it risks entering tapped.")
    if tapped_lands:
        notes.append("Consider leading on tapped land(s) when you do not have a turn-1 spell: " + ", ".join(tapped_lands))
    one_mana_spells = [
        name
        for name in spells
        if cards.get(name) and cards[name].mana_value <= 1 and castability.get(name) and castability[name].by_turn.get(1, 0.0) >= 0.8
    ]
    if one_mana_spells:
        notes.append("Turn-1 options that look live: " + ", ".join(one_mana_spells))
    if not notes:
        notes.append("No obvious sequencing trap detected from land text and early castability.")
    return notes


def deck_curve_rows(counts: dict[str, int], cards: dict[str, CardData]) -> list[dict]:
    buckets: dict[str, int] = {"Land": 0, "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6+": 0}
    for name, qty in counts.items():
        card = cards.get(name)
        if not card:
            continue
        if card.is_land:
            buckets["Land"] += qty
            continue
        value = int(card.mana_value)
        key = "6+" if value >= 6 else str(value)
        buckets[key] += qty
    return [{"slot": key, "cards": value} for key, value in buckets.items()]


def spell_curve_rows(counts: dict[str, int], cards: dict[str, CardData]) -> list[dict]:
    return [row for row in deck_curve_rows(counts, cards) if row["slot"] != "Land"]


def land_plan_chart_rows(report: dict) -> list[dict]:
    rows: list[dict] = []
    land_drop_probs = report.get("land_drop_probabilities", {})
    effective_drop_probs = report.get("effective_land_drop_probabilities", {})
    turns = sorted(
        {
            int(label.split(" by turn ")[-1])
            for label in [*land_drop_probs.keys(), *effective_drop_probs.keys()]
            if " by turn " in label
        }
    )
    for turn in turns:
        land_key = f"Hit land {turn} by turn {turn}"
        source_key = f"Hit source {turn} by turn {turn}"
        if land_key in land_drop_probs:
            rows.append(
                {
                    "turn": turn,
                    "chance": round(land_drop_probs[land_key] * 100, 1),
                    "series": "Land drop chance",
                }
            )
        if source_key in effective_drop_probs:
            rows.append(
                {
                    "turn": turn,
                    "chance": round(effective_drop_probs[source_key] * 100, 1),
                    "series": "Land or land-equivalent",
                }
            )
    return rows


def draw_impact_chart_rows(report: dict) -> list[dict]:
    rows: list[dict] = []
    for turn, impact in report.get("card_draw_impact", {}).items():
        rows.append(
            {
                "turn": turn,
                "chance": round(impact["next_land_natural"] * 100, 1),
                "series": "Natural next-land chance",
            }
        )
        rows.append(
            {
                "turn": turn,
                "chance": round(impact["next_land_with_hand_draw"] * 100, 1),
                "series": "With draw/look spells",
            }
        )
    return rows


def checked_card_mana_value(card: CardData) -> tuple[float | None, str]:
    if card.source == "unresolved":
        return None, "lookup failed"
    if not card.type_line and not card.mana_cost:
        return None, "missing card data"
    direct_value = mana_value_from_cost(card.mana_cost)
    if direct_value or card.mana_cost:
        return direct_value, "mana cost"
    for face in card.faces:
        if "Land" not in face.type_line and face.mana_cost:
            return mana_value_from_cost(face.mana_cost), f"face: {face.name}"
    if card.is_land:
        return 0.0, "land"
    return None, "Scryfall value only"


def mana_value_audit_rows(counts: dict[str, int], cards: dict[str, CardData]) -> list[dict]:
    rows = []
    for name, qty in counts.items():
        card = cards.get(name)
        if not card:
            rows.append(
                {
                    "status": "Missing",
                    "card": name,
                    "qty": qty,
                    "app mana value": "",
                    "symbol check": "",
                    "check source": "No card data found",
                    "mana cost used": "",
                    "type": "",
                    "multiface": "",
                }
            )
            continue
        checked_value, check_source = checked_card_mana_value(card)
        if check_source in {"lookup failed", "missing card data"}:
            status = "Lookup failed"
            checked_display = ""
        elif checked_value is None:
            status = "Scryfall only"
            checked_display = ""
        elif abs(card.mana_value - checked_value) > 0.01:
            status = "Review"
            checked_display = checked_value
        else:
            status = "OK"
            checked_display = checked_value
        rows.append(
            {
                "status": status,
                "card": name,
                "qty": qty,
                "app mana value": card.mana_value,
                "symbol check": checked_display,
                "check source": check_source,
                "mana cost used": card.mana_cost or "(none)",
                "type": card.type_line,
                "multiface": "yes" if card.is_multiface else "no",
            }
        )
    return rows


def run_analysis(hand: list[str], play_draw: PlayDraw, trials: int, seed: int) -> tuple[dict, dict[str, CardData]]:
    counts, sideboard_seen = effective_counts_for_hand(hand)
    cards = resolve_cards(list(counts))
    report = analyze_hand(counts, hand, cards, play_draw, trials=trials, seed=seed)
    report["observed_sideboard_cards"] = sideboard_seen
    return report, cards


def save_confirmed_hand_and_analyze(hand: list[str], message: str) -> None:
    st.session_state.confirmed_hand = hand
    with st.spinner("Saving hand and running analysis..."):
        try:
            report, cards = run_analysis(
                hand,
                PlayDraw(st.session_state.play_draw),
                int(st.session_state.trials),
                int(st.session_state.seed),
            )
        except ValueError as exc:
            st.error(str(exc))
            return
    st.session_state.last_report = report
    st.session_state.last_cards = {name: card.model_dump() for name, card in cards.items()}
    st.success(message + " Analysis updated.")


inject_theme()
init_state()
render_header()

deck_tab, hand_tab, shot_tab, curve_tab, results_tab = st.tabs(["Deck", "Hand", "Screenshot", "Mana Curve", "Results"])

with deck_tab:
    st.subheader("Deck")
    deck_input_col, deck_spacer_col = content_rail()
    with deck_input_col:
        section_panel(
            "deck matrix",
            "Paste your main deck first. To include a sideboard, put Sideboard on its own line, then list those cards below it. Sideboard cards help screenshot recognition, but are ignored for analysis unless one appears in the confirmed hand.",
            wide=True,
        )
        st.session_state.deck_text = st.text_area("Paste MTG Arena decklist", st.session_state.deck_text, height=260)
        c_save, c_clear = st.columns([1, 1])
        if c_save.button("Remember this deck in this browser"):
            remember_deck_in_url(st.session_state.deck_text)
            st.success("Deck saved into this page URL. Refreshing or reopening this URL will restore it.")
        if c_clear.button("Clear remembered deck"):
            if "deck" in st.query_params:
                del st.query_params["deck"]
            st.success("Remembered deck cleared from the URL.")
        if st.query_params.get("deck"):
            st.caption("This deck is stored in the page URL. Do not share the URL if the decklist is private.")
        deck = parsed_deck()
        c1, c2, c3 = st.columns(3)
        c1.metric("Main deck", deck.main_total)
        c2.metric("Sideboard", deck.sideboard_total)
        c3.metric("Unique main cards", len(deck.main_counts()))
        if deck.issues:
            st.error("Some lines could not be parsed.")
            for issue in deck.issues[:10]:
                st.write(f"Line {issue.line_number}: {issue.message} `{issue.line}`")
        for warning in structural_warnings(deck):
            st.warning(warning)
        with st.expander("Main deck list", expanded=False):
            st.dataframe([line.model_dump() for line in deck.main], hide_index=True, width="stretch")
        if deck.sideboard:
            with st.expander("Sideboard cards used for recognition", expanded=False):
                st.dataframe([line.model_dump() for line in deck.sideboard], hide_index=True, width="stretch")
    with deck_spacer_col:
        st.empty()

with hand_tab:
    st.subheader("Confirm Opening Hand")
    hand_col, hand_spacer_col = content_rail(0.92)
    with hand_col:
        section_panel("manual override", "Enter the exact seven cards when screenshot recognition is uncertain, or use this to validate a known opener directly.")
        counts = main_counts()
        selectable_counts = recognition_counts()
        unique_options = sorted(selectable_counts)
        if not unique_options:
            st.warning("Paste a deck first.")
        else:
            pasted_hand = st.text_area(
                "Paste a hand list",
                placeholder="One card per line, or lines like `2 Island`.",
                height=120,
            )
            if st.button("Use pasted hand"):
                pasted = parse_pasted_hand(pasted_hand, selectable_counts)
                effective_counts, _sideboard_seen = effective_counts_for_hand(pasted)
                errors = ["Could not find seven valid cards from the pasted hand."] if len(pasted) != 7 else validate_hand_counts(effective_counts, pasted)
                for error in errors:
                    st.error(error)
                if not errors:
                    save_confirmed_hand_and_analyze(pasted, "Pasted hand saved.")
            defaults = st.session_state.confirmed_hand if len(st.session_state.confirmed_hand) == 7 else []
            selected: list[str] = []
            cols = st.columns(7)
            for index in range(7):
                default = defaults[index] if index < len(defaults) else unique_options[index % len(unique_options)]
                with cols[index]:
                    selected.append(
                        st.selectbox(
                            f"Card {index + 1}",
                            unique_options,
                            index=unique_options.index(default) if default in unique_options else 0,
                            key=f"manual_card_{index}",
                        )
                    )
            effective_counts, sideboard_seen = effective_counts_for_hand(selected)
            errors = validate_hand_counts(effective_counts, selected)
            if sideboard_seen:
                st.info("Sideboard card observed in hand: " + ", ".join(sideboard_seen) + ". Analysis will include the observed copy/copies so the hand can be evaluated.")
            for error in errors:
                st.error(error)
            if st.button("Use this hand", disabled=bool(errors)):
                save_confirmed_hand_and_analyze(selected, "Hand saved.")
    with hand_spacer_col:
        st.empty()

with shot_tab:
    st.subheader("Screenshot Recognition")
    shot_col, shot_spacer_col = content_rail()
    with shot_col:
        section_panel("vision stack", "Paste, drag/drop, or browse for an MTGO/Arena screenshot. Recognition is a first pass; the final seven cards stay under your control.")
        pasted_payload = paste_image_component(key="pasted_screenshot", default=None, height=150)
        pasted_timestamp = pasted_payload.get("timestamp", 0) if isinstance(pasted_payload, dict) else 0
        if pasted_timestamp and pasted_timestamp != st.session_state.last_pasted_image_timestamp:
            pasted_path = pasted_image_path(pasted_payload)
            if pasted_path:
                st.session_state.last_pasted_image_timestamp = pasted_timestamp
                st.session_state.pasted_image_path = str(pasted_path)
                st.success("Pasted screenshot received.")
            else:
                st.error("The pasted clipboard data could not be read as an image.")

        if st.session_state.get("pasted_image_path"):
            process_screenshot(Path(st.session_state.pasted_image_path), "pasted")

        results = st.session_state.recognition_results
        if results and unique_options:
            st.divider()
            st.subheader("Confirm Recognized Cards")
            confirmed: list[str] = []
            selectable_counts = recognition_counts()
            unique_options = sorted(selectable_counts)
            ocr_by_crop = ocr_result_map()
            for result in results:
                idx = result["crop_index"]
                cols = st.columns([1, 2, 3])
                if result.get("crop_path"):
                    cols[0].image(result["crop_path"], caption=f"Crop {idx + 1}")
                labels = [candidate["card_name"] for candidate in result["candidates"]]
                best = labels[0] if labels else unique_options[0]
                ocr_result = ocr_by_crop.get(idx, {})
                ocr_match, ocr_score = best_ocr_match(str(ocr_result.get("text", "")), unique_options)
                if ocr_match and ocr_score >= 0.72:
                    best = ocr_match
                choice = cols[1].selectbox(
                    f"Card {idx + 1}",
                    unique_options,
                    index=unique_options.index(best) if best in unique_options else 0,
                    key=f"recognized_card_{idx}",
                )
                if ocr_result:
                    ocr_text = clean_ocr_text(str(ocr_result.get("text", ""))) or "no title text read"
                    cols[1].caption(f"OCR: {ocr_text} ({ocr_score:.0%} deck match)")
                verification = result.get("verification_label", "Review")
                notes = result.get("verification_notes", [])
                if verification == "Likely":
                    cols[1].success("Likely")
                elif verification == "Double-check":
                    cols[1].warning("Double-check: " + " ".join(notes[:2]))
                else:
                    cols[1].error("Needs review: " + " ".join(notes[:2]))
                cols[2].dataframe(
                    [
                        {
                            "candidate": candidate["card_name"],
                            "score": round(candidate["score"], 3),
                            "confidence": candidate["confidence_label"],
                            "title": round(candidate.get("signals", {}).get("title_strip", 0), 3),
                            "rendered title": round(candidate.get("signals", {}).get("rendered_title", 0), 3),
                            "art": round(candidate.get("signals", {}).get("art_histogram", 0), 3),
                        }
                        for candidate in result["candidates"]
                    ],
                    hide_index=True,
                    width="stretch",
                )
                confirmed.append(choice)
            effective_counts, sideboard_seen = effective_counts_for_hand(confirmed)
            errors = validate_hand_counts(effective_counts, confirmed)
            if sideboard_seen:
                st.info("Sideboard card observed in recognized hand: " + ", ".join(sideboard_seen) + ". Analysis will include the observed copy/copies so the hand can be evaluated.")
            for error in errors:
                st.error(error)
            if st.button("Use recognized hand", disabled=bool(errors)):
                save_confirmed_hand_and_analyze(confirmed, "Recognized hand saved.")
    with shot_spacer_col:
        st.empty()

with curve_tab:
    st.subheader("Deck Mana Curve")
    curve_col, curve_spacer_col = content_rail()
    with curve_col:
        section_panel("mana audit", "Refresh Scryfall data and inspect the curve, MDFC checks, and any cards that need another lookup.")
        counts = main_counts()
        if not counts:
            st.warning("Paste a deck first.")
        else:
            st.write("Refresh card data, then use this tab to catch bad mana values before analyzing hands.")
            if st.button("Refresh deck mana values from Scryfall", type="primary"):
                with st.spinner("Refreshing Scryfall data and checking mana values..."):
                    refreshed_cards = resolve_cards(list(counts))
                    auto_retry_names = failed_lookup_names_from_cards(counts, refreshed_cards)
                    if auto_retry_names:
                        st.info(
                            "Retrying failed lookup"
                            + ("s" if len(auto_retry_names) != 1 else "")
                            + " automatically: "
                            + ", ".join(auto_retry_names)
                        )
                        retried_cards = retry_card_lookups(auto_retry_names)
                        refreshed_cards.update(retried_cards)
                    st.session_state.curve_cards = card_payloads(refreshed_cards)
                st.success("Deck mana values refreshed.")

            raw_curve_cards = st.session_state.get("curve_cards")
            if not raw_curve_cards:
                st.info("Click refresh to build the curve and mana value audit.")
            else:
                cards = {name: CardData.model_validate(payload) for name, payload in raw_curve_cards.items()}
                missing = [name for name in counts if name not in cards]
                if missing:
                    st.warning("Some current deck cards have not been refreshed yet. Click refresh after deck edits.")

                land_total = sum(qty for name, qty in counts.items() if cards.get(name) and cards[name].is_land)
                spell_total = sum(qty for name, qty in counts.items() if cards.get(name) and not cards[name].is_land)
                avg_spell_mv_values = [
                    cards[name].mana_value
                    for name, qty in counts.items()
                    for _ in range(qty)
                    if cards.get(name) and not cards[name].is_land
                ]
                avg_spell_mv = sum(avg_spell_mv_values) / len(avg_spell_mv_values) if avg_spell_mv_values else 0.0

                c1, c2, c3 = st.columns(3)
                c1.metric("Lands", land_total)
                c2.metric("Spells", spell_total)
                c3.metric("Avg spell mana value", f"{avg_spell_mv:.2f}")

                st.write("**Spell Mana Curve**")
                curve_rows = spell_curve_rows(counts, cards)
                chart_col, _chart_space = st.columns([0.62, 0.38])
                with chart_col:
                    st.bar_chart(curve_rows, x="slot", y="cards", height=220)
                st.dataframe(curve_rows, hide_index=True, width="stretch")

                st.write("**Mana Value Verification**")
                audit_rows = mana_value_audit_rows(counts, cards)
                issue_count = sum(1 for row in audit_rows if row["status"] in {"Review", "Missing", "Lookup failed", "Scryfall only"})
                failed_lookup_names = [
                    row["card"]
                    for row in audit_rows
                    if row["status"] in {"Missing", "Lookup failed"}
                ]
                if issue_count:
                    st.warning(f"{issue_count} card(s) need a closer look.")
                else:
                    st.success("All deck mana values passed the symbol/face check.")
                if failed_lookup_names:
                    st.caption("If Scryfall was briefly unavailable or rate-limited, retry only the failed cards instead of refreshing the full deck.")
                    if st.button(
                        f"Retry failed lookup{'s' if len(failed_lookup_names) != 1 else ''} ({len(failed_lookup_names)})",
                        key="retry_failed_scryfall_lookups",
                    ):
                        with st.spinner("Retrying failed Scryfall lookup(s) with a short pause between cards..."):
                            retried = retry_card_lookups(failed_lookup_names)
                            updated_cards = dict(cards)
                            updated_cards.update(retried)
                            st.session_state.curve_cards = card_payloads(updated_cards)
                        still_failed = [
                            name
                            for name, card in retried.items()
                            if checked_card_mana_value(card)[1] in {"lookup failed", "missing card data"}
                        ]
                        if still_failed:
                            st.warning("Still failed: " + ", ".join(still_failed))
                        else:
                            st.success("All failed lookups resolved on retry.")
                        st.rerun()
                st.dataframe(audit_rows, hide_index=True, width="stretch")
                st.caption("MDFCs and other multiface cards are checked against the castable nonland face when possible; lands are counted as 0. Lookup failed means Scryfall did not return usable card data during refresh.")
    with curve_spacer_col:
        st.empty()

with results_tab:
    st.subheader("Results")
    hand = st.session_state.confirmed_hand
    if len(hand) != 7:
        st.warning("Confirm a seven-card hand first.")
    else:
        section_panel("opening hand telemetry", "Analyze land drops, effective sources, draw depth, castability, ramp, and mulligan pressure for the confirmed seven.")
        c1, c2, c3 = st.columns(3)
        play_draw = c1.radio("Play or draw", [PlayDraw.PLAY.value, PlayDraw.DRAW.value], horizontal=True)
        trials = c2.number_input("Castability simulations", min_value=1000, max_value=50000, value=int(st.session_state.trials), step=1000)
        seed = c3.number_input("Simulation seed", value=int(st.session_state.seed), step=1)
        if st.button("Analyze hand", type="primary"):
            st.session_state.play_draw = play_draw
            st.session_state.trials = trials
            st.session_state.seed = seed
            with st.spinner("Refreshing Scryfall data and running the hand analysis..."):
                try:
                    report, cards = run_analysis(hand, PlayDraw(play_draw), int(trials), int(seed))
                except ValueError as exc:
                    st.error(str(exc))
                    st.stop()
            st.session_state.last_report = report
            st.session_state.last_cards = {name: card.model_dump() for name, card in cards.items()}

        report = st.session_state.get("last_report")
        raw_cards = st.session_state.get("last_cards")
        if report and raw_cards:
            cards = {name: CardData.model_validate(payload) for name, payload in raw_cards.items()}
            castability = {estimate.card_name: estimate for estimate in report["castability"]}
            score = hand_texture_score(report, castability)
            land_turn_3 = report["land_drop_probabilities"].get("Hit land 3 by turn 3", 0.0)
            land_turn_4 = report["land_drop_probabilities"].get("Hit land 4 by turn 4", 0.0)
            lands = [name for name in hand if cards.get(name) and cards[name].is_land]
            spells = [name for name in hand if cards.get(name) and not cards[name].is_land]
            draw_sources = report["hand_draw_sources"]
            library_draw_sources = report["library_draw_sources"]
            observed_sideboard = report.get("observed_sideboard_cards", [])
            if observed_sideboard:
                st.info(
                    "Observed sideboard card(s): "
                    + ", ".join(observed_sideboard)
                    + ". The analysis includes the observed copy/copies but does not guess which main-deck card was sideboarded out."
                )

            overview, deep, curve, mulligan, other = st.tabs(["Overview", "Deep Data", "Mana Curve", "Mulligan", "OTHER"])
            with overview:
                m1, m2, m3, m4 = st.columns(4)
                m1.metric("Lands", report["lands_in_hand"])
                m2.metric("Effective sources", report.get("effective_lands_in_hand", report["lands_in_hand"]))
                m3.metric("Avg mana value", f"{report['average_mana_value']:.2f}")
                m4.metric("Texture", f"{score}/100")
                st.write("**Opening Hand Tags**")
                st.write(" ".join(f"`{tag}`" for tag in opening_hand_tags(report, hand, cards, castability)))
                st.write("**Keep or Mulligan Signals**")
                st.write("- " + land_sentence(report["lands_in_hand"], land_turn_3, land_turn_4))
                st.write("- " + effective_source_sentence(report))
                st.write("- " + card_draw_sentence(draw_sources, library_draw_sources))
                st.write("**Land Drop Plan**")
                chart_col, _chart_space = st.columns([0.68, 0.32])
                with chart_col:
                    st.line_chart(land_plan_chart_rows(report), x="turn", y="chance", color="series", height=220)
                st.info(f"Third-land check: {fmt_pct(land_turn_3)} by turn 3.")
                st.write("**Key Chances**")
                st.write(f"- Find the 3rd land by turn 3: {fmt_pct(land_turn_3)}")
                st.write(f"- Find the 4th land by turn 4: {fmt_pct(land_turn_4)}")
                effective_turn_3 = report.get("effective_land_drop_probabilities", {}).get("Hit source 3 by turn 3")
                effective_turn_4 = report.get("effective_land_drop_probabilities", {}).get("Hit source 4 by turn 4")
                if effective_turn_3 is not None:
                    st.write(f"- Find the 3rd land or land-equivalent by turn 3: {fmt_pct(effective_turn_3)}")
                if effective_turn_4 is not None:
                    st.write(f"- Find the 4th land or land-equivalent by turn 4: {fmt_pct(effective_turn_4)}")
                for detail in ["Next land by turn 2", "Next land by turn 3"]:
                    if detail in report["land_probabilities"]:
                        st.write(f"- {detail}: {fmt_pct(report['land_probabilities'][detail].probability)}")
                st.write("**Card Draw and Looks**")
                if draw_sources:
                    chart_col, _chart_space = st.columns([0.68, 0.32])
                    with chart_col:
                        st.line_chart(draw_impact_chart_rows(report), x="turn", y="chance", color="series", height=210)
                    for source in draw_sources:
                        st.write(f"- {source.card_name}: sees {source.cards_seen} card(s) deep and draws {source.cards_drawn}.")
                    for turn, impact in report["card_draw_impact"].items():
                        extra = impact["expected_extra_looks"]
                        if extra > 0.01:
                            st.write(
                                f"- By turn {turn}: next-land chance changes from "
                                f"{fmt_pct(impact['next_land_natural'])} to about {fmt_pct(impact['next_land_with_hand_draw'])}."
                            )
                else:
                    st.write("- No clear draw/look spell in the confirmed hand.")
                st.write("**Mulligan Comparison**")
                for line in mulligan_comparison_lines(main_counts(), cards, score)[:5]:
                    st.write("- " + line)
                st.caption("Full mulligan details remain in the Mulligan tab.")
                st.write("**Ramp Check**")
                if report.get("hand_land_equivalent_sources"):
                    for source in report["hand_land_equivalent_sources"]:
                        st.write(f"- {source.card_name}: counts as {source.equivalent_type}; {source.timing}.")
                if report["hand_ramp_sources"]:
                    for source in report["hand_ramp_sources"]:
                        st.write(f"- {source.card_name}: {source.ramp_type}, {source.timing}.")
                if not report.get("hand_land_equivalent_sources") and not report["hand_ramp_sources"]:
                    st.write("- No ramp source detected in the confirmed hand.")
                st.write("**Spell Castability**")
                cast_rows = []
                for estimate in report["castability"]:
                    cast_rows.append(
                        {
                            "card": estimate.card_name,
                            "T1": fmt_pct(estimate.by_turn.get(1, 0.0)),
                            "T2": fmt_pct(estimate.by_turn.get(2, 0.0)),
                            "T3": fmt_pct(estimate.by_turn.get(3, 0.0)),
                        }
                    )
                st.dataframe(cast_rows, hide_index=True, width="stretch")

            with deep:
                st.write("**Land Details**")
                land_rows = []
                for detail in report["land_probabilities"].values():
                    land_rows.append(
                        {
                            "stat": detail.label,
                            "probability": fmt_pct(detail.probability),
                            "library": detail.library_size,
                            "qualifying": detail.qualifying_cards,
                            "draws": detail.draws,
                            "method": detail.method,
                        }
                    )
                for label, probability in report["land_drop_probabilities"].items():
                    land_rows.append(
                        {
                            "stat": label,
                            "probability": fmt_pct(probability),
                            "library": report["library_size"],
                            "qualifying": report["lands_remaining"],
                            "draws": "",
                            "method": "exact",
                        }
                    )
                for detail in report.get("effective_land_probabilities", {}).values():
                    land_rows.append(
                        {
                            "stat": detail.label,
                            "probability": fmt_pct(detail.probability),
                            "library": detail.library_size,
                            "qualifying": detail.qualifying_cards,
                            "draws": detail.draws,
                            "method": "exact draw chance; land-equivalent heuristic",
                        }
                    )
                for label, probability in report.get("effective_land_drop_probabilities", {}).items():
                    land_rows.append(
                        {
                            "stat": label,
                            "probability": fmt_pct(probability),
                            "library": report["library_size"],
                            "qualifying": report.get("effective_lands_remaining", report["lands_remaining"]),
                            "draws": "",
                            "method": "heuristic",
                        }
                    )
                st.dataframe(land_rows, hide_index=True, width="stretch")
                st.write("**Draw Types by Turn**")
                category_rows = []
                for category, details in report["category_probabilities"].items():
                    if category not in {"Land", "Creature", "Instant", "Sorcery", "Noncreature spell"}:
                        continue
                    row = {"category": category}
                    for detail in details:
                        row[f"T{detail.label[-1]}"] = fmt_pct(detail.probability)
                    category_rows.append(row)
                st.dataframe(category_rows, hide_index=True, width="stretch")
                st.write("**Full Castability Estimates**")
                cast_rows = []
                for estimate in report["castability"]:
                    row = {"card": estimate.card_name}
                    for turn, value in estimate.by_turn.items():
                        row[f"T{turn}"] = fmt_pct(value)
                    row["trials"] = estimate.trials
                    row["seed"] = estimate.seed
                    cast_rows.append(row)
                st.dataframe(cast_rows, hide_index=True, width="stretch")

            with curve:
                st.write("**Deck Mana Curve**")
                rows = deck_curve_rows(main_counts(), cards)
                chart_col, _chart_space = st.columns([0.62, 0.38])
                with chart_col:
                    st.bar_chart(rows, x="slot", y="cards", height=220)
                st.dataframe(rows, hide_index=True, width="stretch")
                st.write("**Mana Value Audit**")
                audit_rows = []
                for name, qty in main_counts().items():
                    card = cards.get(name)
                    if not card:
                        continue
                    audit_rows.append(
                        {
                            "card": name,
                            "qty": qty,
                            "mana value": card.mana_value,
                            "mana cost used": card.mana_cost or "(none)",
                            "type": card.type_line,
                            "multiface": card.is_multiface,
                        }
                    )
                st.dataframe(audit_rows, hide_index=True, width="stretch")
                st.caption("Mana value here is the app's practical castability value after checking Scryfall data against mana symbols and card faces.")

            with mulligan:
                st.write("**Current Hand**")
                st.write(f"- Hand texture score: {score}/100 ({score_label(score)})")
                st.write("- " + land_sentence(report["lands_in_hand"], land_turn_3, land_turn_4))
                st.write("**Fresh 7, Bottom 1**")
                for line in mulligan_comparison_lines(main_counts(), cards, score):
                    st.write("- " + line)
                st.caption("This compares your current 7 to a seeded London mulligan to 6.")

            with other:
                available_colors = sorted({color for name in lands for color in cards[name].produced_mana})
                needed_colors = required_colors(spells, cards)
                missing_colors = [color for color in needed_colors if color not in available_colors]
                interaction = [name for name in spells if is_interaction(cards[name])]
                threats = [name for name in spells if is_threat(cards[name])]
                duplicates = [f"{name} x{qty}" for name, qty in Counter(hand).items() if qty > 1]
                st.write("**Competitive Snapshot**")
                st.write(f"- Hand texture score: {score}/100 ({score_label(score)})")
                st.write(f"- Opening resources: {len(lands)} land(s), {len(spells)} spell(s), {len(draw_sources)} draw/look card(s)")
                st.write(f"- Main-deck land ratio after this hand: {report['lands_remaining']}/{report['library_size']} remaining")
                st.write("**Ramp Sources**")
                if report.get("hand_land_equivalent_sources"):
                    for source in report["hand_land_equivalent_sources"]:
                        st.write(f"- {source.card_name}: {source.equivalent_type}, {source.timing}.")
                if report["hand_ramp_sources"]:
                    for source in report["hand_ramp_sources"]:
                        st.write(f"- {source.card_name}: {source.ramp_type}, {source.timing}.")
                if not report.get("hand_land_equivalent_sources") and not report["hand_ramp_sources"]:
                    st.write("- No ramp source detected in the confirmed hand.")
                if report.get("library_land_equivalent_sources"):
                    names = ", ".join(source.card_name for source in report["library_land_equivalent_sources"][:10])
                    st.write(f"- Land equivalents still in library: {names}.")
                if report["library_ramp_sources"]:
                    names = ", ".join(source.card_name for source in report["library_ramp_sources"][:10])
                    st.write(f"- Ramp still in library: {names}.")
                st.write("**Color Check**")
                st.write("- Available colors from lands in hand: " + (", ".join(available_colors) if available_colors else "none"))
                st.write("- Spell colors needed now: " + (", ".join(needed_colors) if needed_colors else "none"))
                if missing_colors:
                    st.write("- Color bottleneck: missing " + ", ".join(missing_colors) + ".")
                else:
                    st.write("- No immediate color bottleneck from the confirmed hand.")
                st.write("**Role Pieces**")
                st.write("- Interaction in hand: " + (", ".join(interaction) if interaction else "none clearly detected"))
                st.write("- Threats/pressure in hand: " + (", ".join(threats) if threats else "none clearly detected"))
                st.write("**Sequencing Prompts**")
                for note in sequencing_notes(lands, spells, cards, castability):
                    st.write("- " + note)
                st.write("**Hand Shape Flags**")
                st.write("- Duplicate cards: " + (", ".join(duplicates) if duplicates else "none"))
                st.caption("Limits: effective-source math counts MDFC land faces and cheap land-equivalent ramp, but castability still does not fully model treasures, cost reductions, alternate costs, or detailed sequencing.")
