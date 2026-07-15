from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from mtg_hand_analyzer.models import CropBox
from mtg_hand_analyzer.settings import CROP_DIR


def load_image(path: Path) -> np.ndarray:
    image = Image.open(path).convert("RGB")
    return cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)


def detect_hand_region_boxes(image: np.ndarray, expected_cards: int = 7) -> list[CropBox]:
    height, width = image.shape[:2]
    mtgo_boxes = detect_mtgo_hand_row_boxes(image, expected_cards)
    if len(mtgo_boxes) == expected_cards:
        return mtgo_boxes

    work_image, scale = resize_for_detection(image)
    work_height, work_width = work_image.shape[:2]

    boxes: list[CropBox] = []
    for start_fraction, end_fraction in candidate_vertical_bands(work_width, work_height):
        y_offset = int(work_height * start_fraction)
        band = work_image[y_offset : int(work_height * end_fraction), :]
        boxes.extend(detect_card_like_boxes_in_band(band, y_offset, work_width, work_height))

    scaled_boxes = [scale_box(box, scale, width, height) for box in boxes]
    chosen = select_best_seven(scaled_boxes, width, height, expected_cards)
    if len(chosen) == expected_cards:
        return chosen
    return normalized_fallback_boxes(width, height, expected_cards)


def detect_mtgo_hand_row_boxes(image: np.ndarray, expected_cards: int = 7) -> list[CropBox]:
    precise_bottom_row = detect_mtgo_bottom_hand_boxes(image, expected_cards)
    if len(precise_bottom_row) == expected_cards:
        return precise_bottom_row
    return scan_card_rows_by_projection(image, expected_cards)


def scan_card_rows_by_projection(image: np.ndarray, expected_cards: int = 7) -> list[CropBox]:
    height, width = image.shape[:2]
    if height < 250 or width < 500:
        return []

    work_image, scale = resize_for_detection(image)
    work_height, work_width = work_image.shape[:2]
    hsv = cv2.cvtColor(work_image, cv2.COLOR_BGR2HSV)
    color_mask = ((hsv[:, :, 2] > 55) & (hsv[:, :, 1] > 22)).astype("uint8")
    bright_mask = (hsv[:, :, 2] > 138).astype("uint8")
    row_mask = (color_mask.astype(bool) | bright_mask.astype(bool)).astype("uint8")
    row_mask[:, : int(work_width * 0.05)] = 0
    row_mask[:, int(work_width * 0.96) :] = 0

    candidate_groups: list[tuple[float, list[CropBox]]] = []
    min_band = max(80, int(work_height * 0.12))
    max_band = max(min_band + 1, int(work_height * 0.36))
    step = max(12, int(work_height * 0.025))
    band_heights = sorted({min_band, int(work_height * 0.18), int(work_height * 0.24), max_band})
    for band_height in band_heights:
        if band_height >= work_height:
            continue
        for y0 in range(int(work_height * 0.30), max(1, work_height - band_height), step):
            y1 = y0 + band_height
            band_mask = row_mask[y0:y1, :]
            boxes = boxes_from_projection_band(band_mask, y0, work_width, work_height, expected_cards)
            if len(boxes) >= expected_cards:
                group = select_best_bottom_row(boxes, work_width, work_height, expected_cards)
                if len(group) == expected_cards:
                    score = score_card_row(group, work_width, work_height)
                    candidate_groups.append((score, group))

    if not candidate_groups:
        return []
    chosen = max(candidate_groups, key=lambda item: item[0])[1]
    scaled = [scale_box(box, scale, width, height) for box in chosen]
    return sorted(scaled, key=lambda box: box.x)


def boxes_from_projection_band(
    band_mask: np.ndarray,
    y_offset: int,
    image_width: int,
    image_height: int,
    expected_cards: int,
) -> list[CropBox]:
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 5))
    band_mask = cv2.morphologyEx(band_mask, cv2.MORPH_OPEN, kernel)
    column_density = band_mask.mean(axis=0)
    segments = density_segments(
        column_density,
        active_threshold=0.075,
        min_width=max(28, int(image_width * 0.025)),
        max_gap=max(3, int(image_width * 0.006)),
    )
    card_like: list[CropBox] = []
    for x0, x1 in segments:
        segment_width = x1 - x0
        if not (image_width * 0.025 <= segment_width <= image_width * 0.18):
            continue
        submask = band_mask[:, x0:x1]
        row_density = submask.mean(axis=1)
        row_segments = density_segments(
            row_density,
            active_threshold=0.075,
            min_width=max(18, int(image_height * 0.025)),
            max_gap=max(4, int(image_height * 0.008)),
        )
        if not row_segments:
            continue
        y0 = row_segments[0][0] + y_offset
        y1 = row_segments[-1][1] + y_offset
        box_height = y1 - y0
        if box_height <= 0:
            continue
        aspect = segment_width / box_height
        if not (0.42 <= aspect <= 1.20 and image_height * 0.08 <= box_height <= image_height * 0.42):
            continue
        lower_bias = (y0 + box_height / 2) / image_height
        density_score = float(submask.mean())
        count_bias = min(0.2, len(segments) / max(expected_cards, 1) * 0.05)
        card_like.append(
            CropBox(
                x=x0,
                y=max(0, y0 - max(3, int(segment_width * 0.03))),
                width=segment_width,
                height=min(image_height - y0, box_height + max(6, int(segment_width * 0.06))),
                confidence=min(1.0, 0.45 + lower_bias * 0.25 + density_score * 0.25 + count_bias),
            )
        )
    return card_like


def score_card_row(group: list[CropBox], image_width: int, image_height: int) -> float:
    centers_y = [box.y + box.height / 2 for box in group]
    widths = [box.width for box in group]
    heights = [box.height for box in group]
    span = (group[-1].x + group[-1].width - group[0].x) / max(image_width, 1)
    lower_bias = float(np.mean(centers_y) / max(image_height, 1))
    y_alignment = float(np.std(centers_y) / max(image_height, 1))
    width_consistency = float(np.std(widths) / max(np.mean(widths), 1))
    height_consistency = float(np.std(heights) / max(np.mean(heights), 1))
    return (
        sum(box.confidence for box in group)
        + span * 0.5
        + lower_bias * 0.4
        - y_alignment * 5
        - width_consistency * 1.5
        - height_consistency
    )


def detect_mtgo_bottom_hand_boxes(image: np.ndarray, expected_cards: int = 7) -> list[CropBox]:
    height, width = image.shape[:2]
    if height < 250 or width < 500:
        return []

    y_start = int(height * 0.70)
    y_end = max(y_start + 1, height - max(6, int(height * 0.015)))
    band = image[y_start:y_end, :]
    hsv = cv2.cvtColor(band, cv2.COLOR_BGR2HSV)

    # MTGO hands sit on a dark strip; the actual cards have saturated art/borders/text boxes.
    mask = ((hsv[:, :, 2] > 55) & (hsv[:, :, 1] > 25)).astype("uint8")
    row_mask = (mask.astype(bool) | (hsv[:, :, 2] > 135)).astype("uint8")
    mask[:, : int(width * 0.07)] = 0
    mask[:, int(width * 0.92) :] = 0
    row_mask[:, : int(width * 0.07)] = 0
    row_mask[:, int(width * 0.92) :] = 0

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    row_mask = cv2.morphologyEx(row_mask, cv2.MORPH_OPEN, kernel)
    column_density = mask.mean(axis=0)
    segments = density_segments(
        column_density,
        active_threshold=0.08,
        min_width=max(38, int(width * 0.035)),
        max_gap=max(3, int(width * 0.004)),
    )
    card_like = []
    for x0, x1 in segments:
        segment_width = x1 - x0
        if not (width * 0.035 <= segment_width <= width * 0.14):
            continue
        submask = row_mask[:, x0:x1]
        row_density = submask.mean(axis=1)
        row_segments = density_segments(
            row_density,
            active_threshold=0.08,
            min_width=max(18, int(height * 0.035)),
            max_gap=max(4, int(height * 0.008)),
        )
        if not row_segments:
            continue
        y0 = int(row_segments[0][0] + y_start)
        y1 = int(row_segments[-1][1] + y_start)
        top_padding = max(6, int(segment_width * 0.10))
        bottom_padding = max(4, int(segment_width * 0.025))
        y0 = max(y_start, y0 - top_padding)
        y1 = min(height, y1 + bottom_padding)
        box_height = y1 - y0
        aspect = segment_width / max(box_height, 1)
        if not (0.42 <= aspect <= 1.15 and height * 0.10 <= box_height <= height * 0.42):
            continue
        lower_bias = (y0 + box_height / 2) / height
        card_like.append(
            CropBox(
                x=x0,
                y=y0,
                width=segment_width,
                height=box_height,
                confidence=min(1.0, 0.55 + lower_bias * 0.35),
            )
        )

    if len(card_like) < expected_cards:
        return []
    return select_best_bottom_row(card_like, width, height, expected_cards)


def density_segments(
    density: np.ndarray,
    active_threshold: float,
    min_width: int,
    max_gap: int,
) -> list[tuple[int, int]]:
    active = density > active_threshold
    segments: list[tuple[int, int]] = []
    in_segment = False
    start = 0
    last_active = 0
    for index, is_active in enumerate(active):
        if is_active:
            if not in_segment:
                start = index
                in_segment = True
            last_active = index
        elif in_segment and index - last_active > max_gap:
            end = last_active + 1
            if end - start >= min_width:
                segments.append((start, end))
            in_segment = False
    if in_segment:
        end = last_active + 1
        if end - start >= min_width:
            segments.append((start, end))
    return segments


def select_best_bottom_row(
    boxes: list[CropBox],
    image_width: int,
    image_height: int,
    expected_cards: int,
) -> list[CropBox]:
    boxes = sorted(non_overlapping_boxes(boxes), key=lambda box: box.x)
    if len(boxes) <= expected_cards:
        return boxes
    candidates: list[tuple[float, list[CropBox]]] = []
    for start in range(0, len(boxes) - expected_cards + 1):
        group = boxes[start : start + expected_cards]
        y_centers = [box.y + box.height / 2 for box in group]
        widths = [box.width for box in group]
        heights = [box.height for box in group]
        bottom_bias = float(np.mean(y_centers) / max(image_height, 1))
        y_alignment = float(np.std(y_centers) / max(image_height, 1))
        width_consistency = float(np.std(widths) / max(np.mean(widths), 1))
        height_consistency = float(np.std(heights) / max(np.mean(heights), 1))
        span = (group[-1].x + group[-1].width - group[0].x) / max(image_width, 1)
        score = (
            sum(box.confidence for box in group)
            + bottom_bias
            + span * 0.4
            - y_alignment * 4
            - width_consistency
            - height_consistency
        )
        candidates.append((score, group))
    return max(candidates, key=lambda item: item[0])[1]


def resize_for_detection(image: np.ndarray, max_width: int = 1400) -> tuple[np.ndarray, float]:
    height, width = image.shape[:2]
    if width <= max_width:
        return image, 1.0
    scale = max_width / width
    resized = cv2.resize(image, (max_width, max(1, int(height * scale))), interpolation=cv2.INTER_AREA)
    return resized, scale


def candidate_vertical_bands(width: int, height: int) -> list[tuple[float, float]]:
    aspect = width / max(height, 1)
    if aspect < 1.25:
        return [(0.0, 1.0), (0.18, 1.0), (0.35, 1.0)]
    if aspect > 2.4:
        return [(0.0, 1.0), (0.25, 1.0), (0.45, 1.0), (0.55, 1.0)]
    return [(0.0, 1.0), (0.30, 1.0), (0.45, 1.0), (0.54, 1.0), (0.62, 1.0)]


def detect_card_like_boxes_in_band(
    band: np.ndarray,
    y_offset: int,
    image_width: int,
    image_height: int,
) -> list[CropBox]:
    if band.size == 0:
        return []
    gray = cv2.cvtColor(band, cv2.COLOR_BGR2GRAY)
    gray = cv2.equalizeHist(gray)
    edges = cv2.Canny(gray, 60, 160)
    kernel_size = max(5, int(min(image_width, image_height) * 0.006))
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (kernel_size, kernel_size))
    closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    boxes: list[CropBox] = []
    min_area = image_width * image_height * 0.0008
    max_area = image_width * image_height * 0.18
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        aspect = w / max(h, 1)
        area = w * h
        if area < min_area or area > max_area or not 0.28 <= aspect <= 1.45:
            continue
        vertical_preference = (y + y_offset + h / 2) / max(image_height, 1)
        confidence = min(1.0, 0.25 + vertical_preference * 0.35 + min(0.4, area / (image_width * image_height * 0.04)))
        boxes.append(CropBox(x=x, y=y + y_offset, width=w, height=h, confidence=confidence))
    return boxes


def scale_box(box: CropBox, scale: float, image_width: int, image_height: int) -> CropBox:
    if scale == 1.0:
        return box
    inv = 1.0 / scale
    x = max(0, min(image_width - 1, int(round(box.x * inv))))
    y = max(0, min(image_height - 1, int(round(box.y * inv))))
    width = max(1, min(image_width - x, int(round(box.width * inv))))
    height = max(1, min(image_height - y, int(round(box.height * inv))))
    return CropBox(x=x, y=y, width=width, height=height, confidence=box.confidence)


def select_best_seven(
    boxes: list[CropBox],
    image_width: int,
    image_height: int,
    expected_cards: int,
) -> list[CropBox]:
    boxes = non_overlapping_boxes(boxes)
    if len(boxes) < expected_cards:
        return []
    candidates: list[tuple[float, list[CropBox]]] = []
    sorted_boxes = sorted(boxes, key=lambda box: box.x)
    for start in range(0, len(sorted_boxes) - expected_cards + 1):
        group = sorted_boxes[start : start + expected_cards]
        heights = [box.height for box in group]
        centers_y = [box.y + box.height / 2 for box in group]
        spread_x = (group[-1].x + group[-1].width - group[0].x) / max(image_width, 1)
        height_mean = float(np.mean(heights))
        height_variance = float(np.std(heights) / max(height_mean, 1))
        y_variance = float(np.std(centers_y) / max(image_height, 1))
        lower_bias = float(np.mean(centers_y) / max(image_height, 1))
        score = (
            sum(box.confidence for box in group)
            + spread_x
            + lower_bias * 0.8
            - height_variance * 2.0
            - y_variance * 3.0
        )
        candidates.append((score, group))
    best = max(candidates, key=lambda item: item[0])[1]
    return sorted(best, key=lambda box: box.x)


def non_overlapping_boxes(boxes: list[CropBox]) -> list[CropBox]:
    kept: list[CropBox] = []
    for box in sorted(boxes, key=lambda item: item.width * item.height, reverse=True):
        if all(iou(box, other) < 0.45 for other in kept):
            kept.append(box)
    return kept


def iou(a: CropBox, b: CropBox) -> float:
    x1 = max(a.x, b.x)
    y1 = max(a.y, b.y)
    x2 = min(a.x + a.width, b.x + b.width)
    y2 = min(a.y + a.height, b.y + b.height)
    intersection = max(0, x2 - x1) * max(0, y2 - y1)
    union = a.width * a.height + b.width * b.height - intersection
    return intersection / union if union else 0.0


def normalized_fallback_boxes(width: int, height: int, expected_cards: int = 7) -> list[CropBox]:
    aspect = width / max(height, 1)
    if aspect >= 1.45:
        card_w = int(width * 0.115)
        card_h = int(card_w * 1.38)
        overlap = int(card_w * 0.18)
        y = int(height * 0.62)
    else:
        card_h = int(height * 0.82)
        card_w = int(card_h / 1.38)
        overlap = max(0, int((expected_cards * card_w - width * 0.94) / max(expected_cards - 1, 1)))
        y = int(height * 0.08)
    card_w = max(24, min(card_w, width))
    card_h = max(34, min(card_h, height))
    overlap = max(0, min(overlap, card_w - 8))
    step = max(1, card_w - overlap)
    total_w = expected_cards * card_w - (expected_cards - 1) * overlap
    if total_w > width:
        step = max(1, width // expected_cards)
        card_w = min(card_w, step + max(0, int(step * 0.25)))
        total_w = step * (expected_cards - 1) + card_w
    start_x = max(0, int((width - total_w) / 2))
    y = max(0, min(y, height - card_h))
    return [
        CropBox(
            x=min(width - card_w, start_x + index * step),
            y=max(0, min(y, height - card_h)),
            width=card_w,
            height=card_h,
            confidence=0.35,
        )
        for index in range(expected_cards)
    ]


def extract_artwork_region(image: np.ndarray, box: CropBox) -> np.ndarray:
    crop = image[box.y : box.y + box.height, box.x : box.x + box.width]
    if crop.size == 0:
        return crop
    aspect = box.width / max(box.height, 1)
    if box.confidence >= 0.80 and 0.42 <= aspect <= 0.90:
        return crop
    h, w = crop.shape[:2]
    return crop[int(h * 0.10) : int(h * 0.62), int(w * 0.08) : int(w * 0.92)]


def save_crops(image: np.ndarray, boxes: list[CropBox], prefix: str = "crop") -> list[Path]:
    CROP_DIR.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for index, box in enumerate(boxes, start=1):
        crop = extract_artwork_region(image, box)
        path = CROP_DIR / f"{prefix}_{index}.png"
        cv2.imwrite(str(path), crop)
        paths.append(path)
    return paths
