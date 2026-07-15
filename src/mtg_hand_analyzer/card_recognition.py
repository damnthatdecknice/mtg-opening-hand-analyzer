from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

import cv2
import imagehash
import numpy as np
import requests
from PIL import Image, ImageDraw, ImageFont

from mtg_hand_analyzer.models import CardData, CropBox, RecognitionCandidate, RecognitionResult
from mtg_hand_analyzer.settings import ARTWORK_DIR

REQUEST_HEADERS = {"User-Agent": "MTGOpeningHandAnalyzer/0.1 local-desktop-app"}


def label_for_score(score: float) -> str:
    if score >= 0.82:
        return "high"
    if score >= 0.62:
        return "medium"
    return "low"


def create_placeholder_art(card: CardData, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", (240, 336), color_for_name(card.name))
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("arial.ttf", 20)
    except OSError:
        font = ImageFont.load_default()
    draw.rectangle((12, 12, 228, 324), outline=(245, 245, 235), width=4)
    draw.text((22, 28), card.name[:28], fill=(255, 255, 255), font=font)
    draw.text((22, 76), card.type_line[:28], fill=(250, 250, 210), font=font)
    image.save(path)
    return path


def color_for_name(name: str) -> tuple[int, int, int]:
    value = abs(hash(name))
    return (60 + value % 130, 50 + (value // 7) % 130, 50 + (value // 17) % 130)


def ensure_artwork(card: CardData) -> Path:
    safe = "".join(ch for ch in card.name if ch.isalnum() or ch in (" ", "_", "-")).strip().replace(" ", "_")
    path = ARTWORK_DIR / f"{safe}_full.png"
    if not path.exists():
        downloaded = download_card_image(card, path)
        if not downloaded:
            create_placeholder_art(card, path)
    return path


def reference_images_for_card(card: CardData, max_prints: int = 24) -> list[Path]:
    paths = [ensure_artwork(card)]
    paths.extend(download_print_images(card, max_prints=max_prints))
    unique: list[Path] = []
    seen: set[Path] = set()
    for path in paths:
        if path.exists() and path not in seen:
            unique.append(path)
            seen.add(path)
    return unique


def download_card_image(card: CardData, path: Path) -> bool:
    url = card.image_uris.get("normal") or card.image_uris.get("large") or card.image_uris.get("small")
    if not url:
        return False
    try:
        response = requests.get(
            url,
            timeout=15,
            headers=REQUEST_HEADERS,
        )
        response.raise_for_status()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(response.content)
        Image.open(path).verify()
    except Exception:
        if path.exists():
            path.unlink(missing_ok=True)
        return False
    return True


def download_print_images(card: CardData, max_prints: int = 24) -> list[Path]:
    safe = "".join(ch for ch in card.name if ch.isalnum() or ch in (" ", "_", "-")).strip().replace(" ", "_")
    print_dir = ARTWORK_DIR / "prints" / safe
    print_dir.mkdir(parents=True, exist_ok=True)
    existing = sorted(print_dir.glob("*.jpg")) + sorted(print_dir.glob("*.png"))
    if existing:
        return existing[:max_prints]

    query = f'!"{card.name}"'
    try:
        response = requests.get(
            "https://api.scryfall.com/cards/search",
            params={"q": query, "unique": "prints", "order": "released"},
            timeout=20,
            headers=REQUEST_HEADERS,
        )
        if response.status_code != 200:
            return []
        payload = response.json()
    except Exception:
        return []

    paths: list[Path] = []
    for index, item in enumerate(payload.get("data", [])[:max_prints], start=1):
        image_uris = item.get("image_uris") or {}
        if not image_uris and item.get("card_faces"):
            image_uris = item["card_faces"][0].get("image_uris", {})
        url = image_uris.get("normal") or image_uris.get("large") or image_uris.get("small")
        if not url:
            continue
        extension = ".jpg" if ".jpg" in url or ".jpeg" in url else ".png"
        path = print_dir / f"{index:02d}_{quote(item.get('set', 'set'))}_{quote(item.get('collector_number', '0'))}{extension}"
        if download_url_to_image(url, path):
            paths.append(path)
    return paths


def download_url_to_image(url: str, path: Path) -> bool:
    try:
        response = requests.get(url, timeout=20, headers=REQUEST_HEADERS)
        response.raise_for_status()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(response.content)
        Image.open(path).verify()
    except Exception:
        if path.exists():
            path.unlink(missing_ok=True)
        return False
    return True


def image_features(path: Path) -> tuple[imagehash.ImageHash, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    pil = normalized_card_image(path)
    phash = imagehash.phash(pil)
    arr = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    hist = cv2.calcHist([arr], [0, 1, 2], None, [8, 8, 8], [0, 256, 0, 256, 0, 256])
    cv2.normalize(hist, hist)
    edges = cv2.Canny(cv2.cvtColor(arr, cv2.COLOR_BGR2GRAY), 60, 160)
    gray = cv2.cvtColor(arr, cv2.COLOR_BGR2GRAY)
    title_strip = cv2.Canny(gray[0:32, :], 50, 140)
    art = arr[35:132, 10:150]
    art_hist = cv2.calcHist([art], [0, 1, 2], None, [8, 8, 8], [0, 256, 0, 256, 0, 256])
    cv2.normalize(art_hist, art_hist)
    return phash, hist.flatten(), edges, title_strip, art_hist.flatten()


def normalized_card_image(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGB")
    arr = np.array(image)
    trimmed = trim_dark_border(arr)
    pil = Image.fromarray(trimmed)
    pil.thumbnail((160, 224), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (160, 224), (0, 0, 0))
    x = (160 - pil.width) // 2
    y = (224 - pil.height) // 2
    canvas.paste(pil, (x, y))
    return canvas


def trim_dark_border(arr: np.ndarray) -> np.ndarray:
    if arr.size == 0:
        return arr
    gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
    mask = gray > 18
    rows = np.where(mask.any(axis=1))[0]
    cols = np.where(mask.any(axis=0))[0]
    if len(rows) == 0 or len(cols) == 0:
        return arr
    top, bottom = int(rows[0]), int(rows[-1]) + 1
    left, right = int(cols[0]), int(cols[-1]) + 1
    if bottom - top < arr.shape[0] * 0.45 or right - left < arr.shape[1] * 0.45:
        return arr
    pad_y = max(1, int((bottom - top) * 0.015))
    pad_x = max(1, int((right - left) * 0.015))
    top = max(0, top - pad_y)
    bottom = min(arr.shape[0], bottom + pad_y)
    left = max(0, left - pad_x)
    right = min(arr.shape[1], right + pad_x)
    return arr[top:bottom, left:right]


def compare_images(crop_path: Path, candidate_path: Path) -> dict[str, float]:
    crop_hash, crop_hist, crop_edges, crop_title, crop_art_hist = image_features(crop_path)
    cand_hash, cand_hist, cand_edges, cand_title, cand_art_hist = image_features(candidate_path)
    hash_score = max(0.0, 1.0 - (crop_hash - cand_hash) / 64.0)
    hist_score = float(cv2.compareHist(crop_hist.astype("float32"), cand_hist.astype("float32"), cv2.HISTCMP_CORREL))
    hist_score = max(0.0, min(1.0, (hist_score + 1.0) / 2.0))
    edge_diff = np.mean(cv2.absdiff(crop_edges, cand_edges)) / 255.0
    edge_score = max(0.0, 1.0 - float(edge_diff))
    title_diff = np.mean(cv2.absdiff(crop_title, cand_title)) / 255.0
    title_score = max(0.0, 1.0 - float(title_diff))
    art_hist_score = float(cv2.compareHist(crop_art_hist.astype("float32"), cand_art_hist.astype("float32"), cv2.HISTCMP_CORREL))
    art_hist_score = max(0.0, min(1.0, (art_hist_score + 1.0) / 2.0))
    score = 0.24 * hash_score + 0.18 * hist_score + 0.18 * edge_score + 0.22 * title_score + 0.18 * art_hist_score
    return {
        "hash": hash_score,
        "histogram": hist_score,
        "edge": edge_score,
        "title_strip": title_score,
        "art_histogram": art_hist_score,
        "weighted": score,
    }


def candidate_limit_for_card(card_name: str, deck_cards: dict[str, CardData]) -> int:
    return 20 if deck_cards.get(card_name) and deck_cards[card_name].is_land else 4


def apply_global_card_assignment(
    scored_candidates: list[list[RecognitionCandidate]],
    deck_cards: dict[str, CardData],
) -> list[list[RecognitionCandidate]]:
    if not scored_candidates:
        return scored_candidates
    card_limits = {name: candidate_limit_for_card(name, deck_cards) for name in deck_cards}
    memo: dict[tuple[int, tuple[tuple[str, int], ...]], tuple[float, list[str]]] = {}

    def search(index: int, used: dict[str, int]) -> tuple[float, list[str]]:
        if index >= len(scored_candidates):
            return 0.0, []
        key = (index, tuple(sorted(used.items())))
        if key in memo:
            return memo[key]
        best_score = float("-inf")
        best_names: list[str] = []
        for candidate in scored_candidates[index]:
            used_count = used.get(candidate.card_name, 0)
            if used_count >= card_limits.get(candidate.card_name, 4):
                continue
            used[candidate.card_name] = used_count + 1
            rest_score, rest_names = search(index + 1, used)
            used[candidate.card_name] = used_count
            if used_count == 0:
                used.pop(candidate.card_name, None)
            total = candidate.score + rest_score
            if total > best_score:
                best_score = total
                best_names = [candidate.card_name] + rest_names
        memo[key] = (best_score, best_names)
        return memo[key]

    _score, assigned_names = search(0, {})
    if len(assigned_names) != len(scored_candidates):
        return scored_candidates
    reordered: list[list[RecognitionCandidate]] = []
    for candidates, assigned_name in zip(scored_candidates, assigned_names, strict=True):
        chosen = next((candidate for candidate in candidates if candidate.card_name == assigned_name), None)
        if chosen is None:
            reordered.append(candidates)
            continue
        reordered.append([chosen] + [candidate for candidate in candidates if candidate.card_name != assigned_name])
    return reordered


def verification_for_candidates(candidates: list[RecognitionCandidate]) -> tuple[str, list[str]]:
    if not candidates:
        return "Needs review", ["No recognition candidates were generated."]
    best = candidates[0]
    runner_up = candidates[1] if len(candidates) > 1 else None
    notes: list[str] = []
    if runner_up:
        gap = best.score - runner_up.score
        if gap < 0:
            notes.append(f"Deck-count check selected this over a higher raw image score ({runner_up.card_name}).")
        elif gap < 0.025:
            notes.append(f"Top two image matches are nearly tied: {runner_up.card_name}.")
        elif gap < 0.060:
            notes.append(f"Runner-up is close: {runner_up.card_name}.")
    title_score = best.signals.get("title_strip", 0.0)
    art_score = best.signals.get("art_histogram", 0.0)
    if best.score < 0.58:
        notes.append("Overall image match is weak.")
    elif best.score < 0.68:
        notes.append("Overall image match is only moderate.")
    if title_score and title_score < 0.70:
        notes.append("Card-name/title strip match is weak.")
    if art_score and art_score < 0.58:
        notes.append("Artwork color check is weak.")
    if best.score < 0.58 or any(note.startswith("Deck-count") for note in notes):
        return "Needs review", notes
    if notes:
        return "Double-check", notes
    return "Likely", ["Top match is clearly ahead on the available image checks."]


def recognize_crops(
    crop_paths: list[Path],
    boxes: list[CropBox],
    deck_cards: dict[str, CardData],
    top_n: int = 3,
) -> list[RecognitionResult]:
    artwork = {name: reference_images_for_card(card) for name, card in deck_cards.items()}
    scored_by_crop: list[list[RecognitionCandidate]] = []
    for crop_path in crop_paths:
        candidates: list[RecognitionCandidate] = []
        for name, art_paths in artwork.items():
            best_path = art_paths[0]
            best_signals = compare_images(crop_path, best_path)
            for art_path in art_paths[1:]:
                signals = compare_images(crop_path, art_path)
                if signals["weighted"] > best_signals["weighted"]:
                    best_signals = signals
                    best_path = art_path
            signals = best_signals
            score = signals["weighted"]
            candidates.append(
                RecognitionCandidate(
                    card_name=name,
                    score=score,
                    confidence_label=label_for_score(score),
                    signals=signals,
                    image_path=best_path,
                )
            )
        candidates.sort(key=lambda candidate: candidate.score, reverse=True)
        scored_by_crop.append(candidates)
    assigned_candidates = apply_global_card_assignment(scored_by_crop, deck_cards)
    results: list[RecognitionResult] = []
    for index, (crop_path, candidates) in enumerate(zip(crop_paths, assigned_candidates, strict=True)):
        verification_label, verification_notes = verification_for_candidates(candidates)
        results.append(
            RecognitionResult(
                crop_index=index,
                crop_box=boxes[index],
                candidates=candidates[:top_n],
                crop_path=crop_path,
                verification_label=verification_label,
                verification_notes=verification_notes,
            )
        )
    return results
