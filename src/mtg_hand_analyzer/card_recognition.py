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


def reference_images_for_card(card: CardData, max_prints: int = 10) -> list[Path]:
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


def download_print_images(card: CardData, max_prints: int = 10) -> list[Path]:
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


def image_features(path: Path) -> tuple[imagehash.ImageHash, np.ndarray, np.ndarray, np.ndarray]:
    pil = Image.open(path).convert("RGB").resize((160, 224))
    phash = imagehash.phash(pil)
    arr = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    hist = cv2.calcHist([arr], [0, 1, 2], None, [8, 8, 8], [0, 256, 0, 256, 0, 256])
    cv2.normalize(hist, hist)
    edges = cv2.Canny(cv2.cvtColor(arr, cv2.COLOR_BGR2GRAY), 60, 160)
    gray = cv2.cvtColor(arr, cv2.COLOR_BGR2GRAY)
    title_strip = cv2.Canny(gray[0:34, :], 50, 140)
    return phash, hist.flatten(), edges, title_strip


def compare_images(crop_path: Path, candidate_path: Path) -> dict[str, float]:
    crop_hash, crop_hist, crop_edges, crop_title = image_features(crop_path)
    cand_hash, cand_hist, cand_edges, cand_title = image_features(candidate_path)
    hash_score = max(0.0, 1.0 - (crop_hash - cand_hash) / 64.0)
    hist_score = float(cv2.compareHist(crop_hist.astype("float32"), cand_hist.astype("float32"), cv2.HISTCMP_CORREL))
    hist_score = max(0.0, min(1.0, (hist_score + 1.0) / 2.0))
    edge_diff = np.mean(cv2.absdiff(crop_edges, cand_edges)) / 255.0
    edge_score = max(0.0, 1.0 - float(edge_diff))
    title_diff = np.mean(cv2.absdiff(crop_title, cand_title)) / 255.0
    title_score = max(0.0, 1.0 - float(title_diff))
    score = 0.30 * hash_score + 0.25 * hist_score + 0.20 * edge_score + 0.25 * title_score
    return {
        "hash": hash_score,
        "histogram": hist_score,
        "edge": edge_score,
        "title_strip": title_score,
        "weighted": score,
    }


def recognize_crops(
    crop_paths: list[Path],
    boxes: list[CropBox],
    deck_cards: dict[str, CardData],
    top_n: int = 3,
) -> list[RecognitionResult]:
    artwork = {name: reference_images_for_card(card) for name, card in deck_cards.items()}
    results: list[RecognitionResult] = []
    for index, crop_path in enumerate(crop_paths):
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
        results.append(
            RecognitionResult(
                crop_index=index,
                crop_box=boxes[index],
                candidates=candidates[:top_n],
                crop_path=crop_path,
            )
        )
    return results
