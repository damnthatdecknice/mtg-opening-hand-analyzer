from __future__ import annotations

import random
import sys
import tempfile
import base64
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
from mtg_hand_analyzer.models import CardData, PlayDraw
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


def process_screenshot(image_path: Path, prefix: str) -> None:
    st.image(Image.open(image_path), caption="Screenshot", width="stretch")
    image = load_image(image_path)
    boxes = detect_hand_region_boxes(image)
    if boxes and max(box.confidence for box in boxes) <= 0.36:
        st.warning("Card positions were estimated instead of confidently detected. If the crops look wrong, use a tighter screenshot around the hand or upload a different screenshot size.")
    crop_paths = save_crops(image, boxes, prefix=prefix)
    st.session_state.boxes = [box.model_dump() for box in boxes]
    st.session_state.crop_paths = [str(path) for path in crop_paths]
    crop_cols = st.columns(7)
    for idx, path in enumerate(crop_paths):
        with crop_cols[idx]:
            st.image(str(path), caption=f"Crop {idx + 1}")
    if st.button("Run recognition", key=f"run_recognition_{prefix}"):
        with st.spinner("Refreshing card data from Scryfall and matching crops..."):
            cards = resolve_cards(list(recognition_counts()))
            results = recognize_crops(crop_paths, boxes, cards)
        st.session_state.recognition_results = [result.model_dump(mode="json") for result in results]
        st.success("Recognition candidates generated.")


def resolve_cards(names: list[str]) -> dict[str, CardData]:
    provider = ScryfallProvider()
    cards: dict[str, CardData] = {}
    for name in names:
        card = card_cache.resolve(name, provider, force_refresh=True)
        if not card:
            card = fixture_provider.get_card(name)
        cards[name] = enrich_card_data(name, card)
    return cards


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


init_state()
st.title("MTG Opening Hand Analyzer")
st.caption("Opening-hand math for Magic. Hosted web use means uploaded screenshots are processed on this app server.")

deck_tab, hand_tab, shot_tab, curve_tab, results_tab = st.tabs(["Deck", "Hand", "Screenshot", "Mana Curve", "Results"])

with deck_tab:
    st.subheader("Deck")
    st.session_state.deck_text = st.text_area("Paste MTG Arena decklist", st.session_state.deck_text, height=330)
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

with hand_tab:
    st.subheader("Confirm Opening Hand")
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
                st.session_state.confirmed_hand = pasted
                st.success("Pasted hand saved for analysis.")
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
            st.session_state.confirmed_hand = selected
            st.success("Hand saved for analysis.")

with shot_tab:
    st.subheader("Screenshot Recognition")
    st.write("Paste, drag/drop, or browse for an MTGO/Arena screenshot. Recognition is only a first pass; confirm the seven cards before analysis.")
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

    upload = st.file_uploader("Or drag/drop or browse for PNG, JPG, JPEG, or WEBP", type=["png", "jpg", "jpeg", "webp"])
    if upload:
        suffix = Path(upload.name).suffix or ".png"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as handle:
            handle.write(upload.getbuffer())
            image_path = Path(handle.name)
        process_screenshot(image_path, "web")

    results = st.session_state.recognition_results
    if results and unique_options:
        st.divider()
        st.subheader("Confirm Recognized Cards")
        confirmed: list[str] = []
        selectable_counts = recognition_counts()
        unique_options = sorted(selectable_counts)
        for result in results:
            idx = result["crop_index"]
            cols = st.columns([1, 2, 3])
            if result.get("crop_path"):
                cols[0].image(result["crop_path"], caption=f"Crop {idx + 1}")
            labels = [candidate["card_name"] for candidate in result["candidates"]]
            best = labels[0] if labels else unique_options[0]
            choice = cols[1].selectbox(
                f"Card {idx + 1}",
                unique_options,
                index=unique_options.index(best) if best in unique_options else 0,
                key=f"recognized_card_{idx}",
            )
            cols[2].dataframe(
                [
                    {
                        "candidate": candidate["card_name"],
                        "score": round(candidate["score"], 3),
                        "confidence": candidate["confidence_label"],
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
            st.session_state.confirmed_hand = confirmed
            st.success("Recognized hand saved for analysis.")

with curve_tab:
    st.subheader("Deck Mana Curve")
    counts = main_counts()
    if not counts:
        st.warning("Paste a deck first.")
    else:
        st.write("Refresh card data, then use this tab to catch bad mana values before analyzing hands.")
        if st.button("Refresh deck mana values from Scryfall", type="primary"):
            with st.spinner("Refreshing Scryfall data and checking mana values..."):
                st.session_state.curve_cards = {
                    name: card.model_dump()
                    for name, card in resolve_cards(list(counts)).items()
                }
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
            st.bar_chart(curve_rows, x="slot", y="cards")
            st.dataframe(curve_rows, hide_index=True, width="stretch")

            st.write("**Mana Value Verification**")
            audit_rows = mana_value_audit_rows(counts, cards)
            issue_count = sum(1 for row in audit_rows if row["status"] in {"Review", "Missing", "Lookup failed", "Scryfall only"})
            if issue_count:
                st.warning(f"{issue_count} card(s) need a closer look.")
            else:
                st.success("All deck mana values passed the symbol/face check.")
            st.dataframe(audit_rows, hide_index=True, width="stretch")
            st.caption("MDFCs and other multiface cards are checked against the castable nonland face when possible; lands are counted as 0. Lookup failed means Scryfall did not return usable card data during refresh.")

with results_tab:
    st.subheader("Results")
    hand = st.session_state.confirmed_hand
    if len(hand) != 7:
        st.warning("Confirm a seven-card hand first.")
    else:
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
                st.write("**Keep or Mulligan Signals**")
                st.write("- " + land_sentence(report["lands_in_hand"], land_turn_3, land_turn_4))
                st.write("- " + effective_source_sentence(report))
                st.write("- " + card_draw_sentence(draw_sources, library_draw_sources))
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
                st.bar_chart(rows, x="slot", y="cards")
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
