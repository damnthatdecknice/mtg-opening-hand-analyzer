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
    bottom_slots = detect_bottom_seven_card_slots(image, expected_cards)
    if len(bottom_slots) == expected_cards:
        return bottom_slots

    sliced_boxes = detect_bottom_hand_by_row_slicing(image, expected_cards)
    if len(sliced_boxes) == expected_cards:
        return sliced_boxes

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
        return [normalize_card_box_dimensions(box, width, height) for box in chosen]
    return normalized_bottom_hand_boxes(width, height, expected_cards)


def detect_bottom_seven_card_slots(image: np.ndarray, expected_cards: int = 7) -> list[CropBox]:
    height, width = image.shape[:2]
    if expected_cards <= 0 or height < 160 or width < 320:
        return []

    bottom_start = int(height * 0.35)
    region = image[bottom_start:, :]
    mask = bottom_card_foreground_mask(region)
    row_bounds = largest_bottom_band(mask, bottom_start, height)
    if row_bounds is None:
        return []
    y0, y1 = row_bounds
    row_mask = mask[y0 - bottom_start : y1 - bottom_start, :]
    x_bounds = row_horizontal_bounds(row_mask, width)
    if x_bounds is None:
        return []
    x0, x1 = x_bounds
    row_height = y1 - y0
    row_width = x1 - x0
    if row_height < height * 0.08 or row_width < width * 0.20:
        return []
    row_span = row_width / max(width, 1)
    if row_span > 0.92 and row_height > height * 0.42:
        return []

    slot_width = row_width / expected_cards
    if slot_width < 20:
        return []
    card_height = estimate_card_height_from_slot(slot_width, row_height, height)
    y = estimate_card_top_from_band(y0, y1, card_height, height)
    boxes = []
    for index in range(expected_cards):
        left = x0 + index * slot_width
        right = x0 + (index + 1) * slot_width
        slot_x = int(round(left))
        slot_w = int(round(right)) - slot_x
        boxes.append(
            CropBox(
                x=max(0, min(slot_x, width - max(1, slot_w))),
                y=y,
                width=max(1, min(slot_w, width - slot_x)),
                height=card_height,
                confidence=0.88,
            )
        )
    return boxes


def bottom_card_foreground_mask(region: np.ndarray) -> np.ndarray:
    hsv = cv2.cvtColor(region, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
    saturated = (hsv[:, :, 1] > 24) & (hsv[:, :, 2] > 35)
    bright = hsv[:, :, 2] > 130
    edges = cv2.Canny(gray, 35, 120) > 0
    mask = (saturated | bright | edges).astype("uint8")
    open_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    close_kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT,
        (max(9, int(region.shape[1] * 0.004)), max(9, int(region.shape[0] * 0.07))),
    )
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, open_kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, close_kernel)
    return mask


def largest_bottom_band(mask: np.ndarray, y_offset: int, image_height: int) -> tuple[int, int] | None:
    row_density = mask.mean(axis=1)
    segments = density_segments(
        row_density,
        active_threshold=0.035,
        min_width=max(24, int(image_height * 0.045)),
        max_gap=max(5, int(image_height * 0.012)),
    )
    if not segments:
        return None
    candidates: list[tuple[float, tuple[int, int]]] = []
    for start, end in segments:
        abs_start = start + y_offset
        abs_end = end + y_offset
        band_height = abs_end - abs_start
        center_bias = (abs_start + abs_end) / 2 / max(image_height, 1)
        if center_bias < 0.45:
            continue
        score = band_height / max(image_height, 1) + center_bias * 0.35
        candidates.append((score, (abs_start, abs_end)))
    if not candidates:
        return None
    return max(candidates, key=lambda item: item[0])[1]


def row_horizontal_bounds(row_mask: np.ndarray, image_width: int) -> tuple[int, int] | None:
    column_density = row_mask.mean(axis=0)
    segments = density_segments(
        column_density,
        active_threshold=0.025,
        min_width=max(12, int(image_width * 0.006)),
        max_gap=max(6, int(image_width * 0.008)),
    )
    if not segments:
        return None
    left = min(start for start, _end in segments)
    right = max(end for _start, end in segments)
    pad = max(2, int((right - left) * 0.004))
    return max(0, left - pad), min(image_width, right + pad)


def estimate_card_height_from_slot(slot_width: float, row_height: int, image_height: int) -> int:
    height_from_width = int(round(slot_width * 1.42))
    target = max(row_height, height_from_width)
    return max(24, min(target, int(image_height * 0.68)))


def estimate_card_top_from_band(y0: int, y1: int, card_height: int, image_height: int) -> int:
    band_height = y1 - y0
    if band_height >= card_height:
        y = y0 + int((band_height - card_height) * 0.12)
    else:
        y = y0 - int((card_height - band_height) * 0.18)
    return max(0, min(y, image_height - card_height))


def detect_bottom_hand_by_row_slicing(image: np.ndarray, expected_cards: int = 7) -> list[CropBox]:
    height, width = image.shape[:2]
    if height < 250 or width < 500:
        return []

    y_start = int(height * 0.40)
    y_end = max(y_start + 1, height - max(4, int(height * 0.01)))
    band = image[y_start:y_end, :]
    hsv = cv2.cvtColor(band, cv2.COLOR_BGR2HSV)
    mask = (((hsv[:, :, 2] > 58) & (hsv[:, :, 1] > 22)) | (hsv[:, :, 2] > 145)).astype("uint8")
    mask[:, : int(width * 0.045)] = 0
    mask[:, int(width * 0.94) :] = 0

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    row_density = mask.mean(axis=1)
    row_segments = density_segments(
        row_density,
        active_threshold=0.045,
        min_width=max(35, int(height * 0.045)),
        max_gap=max(6, int(height * 0.01)),
    )
    if not row_segments:
        return []

    row_candidates: list[tuple[float, list[CropBox]]] = []
    for row_y0, row_y1 in row_segments:
        row_height = row_y1 - row_y0
        if not (height * 0.10 <= row_height <= height * 0.62):
            continue
        row_center = (row_y0 + row_y1) / 2 + y_start
        if row_center < height * 0.46:
            continue
        row_mask = mask[row_y0:row_y1, :]
        column_density = row_mask.mean(axis=0)
        column_segments = density_segments(
            column_density,
            active_threshold=0.035,
            min_width=max(45, int(width * 0.025)),
            max_gap=max(6, int(width * 0.006)),
        )
        boxes = bottom_row_boxes_from_columns(
            column_segments,
            row_y0 + y_start,
            row_height,
            width,
            height,
            expected_cards,
        )
        if len(boxes) == expected_cards:
            bottom_bias = row_center / max(height, 1)
            span = (boxes[-1].x + boxes[-1].width - boxes[0].x) / max(width, 1)
            score = bottom_bias + span * 0.4 + sum(box.confidence for box in boxes)
            row_candidates.append((score, boxes))

    if not row_candidates:
        return []
    return max(row_candidates, key=lambda item: item[0])[1]


def bottom_row_boxes_from_columns(
    column_segments: list[tuple[int, int]],
    row_y: int,
    row_height: int,
    image_width: int,
    image_height: int,
    expected_cards: int,
) -> list[CropBox]:
    if not column_segments:
        return []
    left = min(start for start, _ in column_segments)
    right = max(end for _, end in column_segments)
    row_width = right - left
    if row_width <= 0:
        return []

    if len(column_segments) >= expected_cards:
        chosen = choose_bottom_row_segments(column_segments, image_width, expected_cards)
        segment_widths = [end - start for start, end in chosen]
        card_width = int(np.median(segment_widths))
        card_height = inferred_card_height(card_width, row_height, image_height)
        y = inferred_card_y(row_y, row_height, card_height, image_height)
        boxes = []
        for start, end in chosen:
            center = (start + end) / 2
            x = int(round(center - card_width / 2))
            boxes.append(
                normalize_card_box_dimensions(
                    CropBox(
                        x=max(0, min(x, image_width - card_width)),
                        y=y,
                        width=max(24, card_width),
                        height=card_height,
                        confidence=0.80,
                    ),
                    image_width,
                    image_height,
                )
            )
        return sorted(boxes, key=lambda box: box.x)

    slot_width = row_width / expected_cards
    card_width = int(slot_width)
    card_height = inferred_card_height(card_width, row_height, image_height)
    y = inferred_card_y(row_y, row_height, card_height, image_height)
    boxes = []
    for index in range(expected_cards):
        slot_left = left + index * slot_width
        slot_center = slot_left + slot_width / 2
        x = int(round(slot_center - card_width / 2))
        boxes.append(
            CropBox(
                x=max(0, min(x, image_width - card_width)),
                y=y,
                width=max(24, card_width),
                height=card_height,
                confidence=0.68,
            )
        )
    return sorted(boxes, key=lambda box: box.x)


def inferred_card_height(card_width: int, row_height: int, image_height: int) -> int:
    height_from_width = int(round(card_width * 1.48))
    if row_height <= height_from_width:
        target_height = height_from_width
    else:
        target_height = min(row_height, int(round(height_from_width * 1.08)))
    return max(34, min(target_height, int(image_height * 0.62)))


def inferred_card_y(row_y: int, row_height: int, card_height: int, image_height: int) -> int:
    if row_height > card_height:
        y = row_y + int((row_height - card_height) * 0.65)
    else:
        missing_height = max(0, card_height - row_height)
        y = row_y - int(missing_height * 0.22)
    return max(0, min(y, image_height - card_height))


def choose_bottom_row_segments(
    column_segments: list[tuple[int, int]],
    image_width: int,
    expected_cards: int,
) -> list[tuple[int, int]]:
    if len(column_segments) <= expected_cards:
        return column_segments
    candidates: list[tuple[float, list[tuple[int, int]]]] = []
    for start in range(0, len(column_segments) - expected_cards + 1):
        group = column_segments[start : start + expected_cards]
        widths = [end - begin for begin, end in group]
        centers = [(begin + end) / 2 for begin, end in group]
        gaps = [centers[index + 1] - centers[index] for index in range(expected_cards - 1)]
        span = (group[-1][1] - group[0][0]) / max(image_width, 1)
        width_consistency = float(np.std(widths) / max(np.mean(widths), 1))
        gap_consistency = float(np.std(gaps) / max(np.mean(gaps), 1)) if gaps else 0.0
        score = span - width_consistency - gap_consistency
        candidates.append((score, group))
    return max(candidates, key=lambda item: item[0])[1]


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
    scaled = [normalize_card_box_dimensions(box, width, height) for box in scaled]
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

    if len(card_like) >= expected_cards:
        return select_best_bottom_row(card_like, width, height, expected_cards)
    inferred = infer_bottom_hand_boxes_from_partial_row(card_like, width, height, expected_cards)
    if len(inferred) == expected_cards:
        return inferred
    return []


def infer_bottom_hand_boxes_from_partial_row(
    boxes: list[CropBox],
    image_width: int,
    image_height: int,
    expected_cards: int,
) -> list[CropBox]:
    boxes = sorted(non_overlapping_boxes(boxes), key=lambda box: box.x)
    if len(boxes) < 2:
        return []
    widths = [box.width for box in boxes]
    heights = [box.height for box in boxes]
    card_width = int(np.median(widths))
    card_height = int(np.median(heights))
    centers = [box.x + box.width / 2 for box in boxes]
    gaps = [centers[index + 1] - centers[index] for index in range(len(centers) - 1)]
    plausible_gaps = [gap for gap in gaps if card_width * 0.45 <= gap <= card_width * 1.85]
    if plausible_gaps:
        step = int(np.median(plausible_gaps))
    else:
        span = boxes[-1].x + boxes[-1].width - boxes[0].x
        step = int((span - card_width) / max(expected_cards - 1, 1))
    if step <= 0:
        return []

    first_center = min(centers)
    best_start_center = first_center
    best_score = float("inf")
    for anchor_index, center in enumerate(centers):
        for slot_index in range(expected_cards):
            start_center = center - slot_index * step
            slot_centers = [start_center + index * step for index in range(expected_cards)]
            if slot_centers[0] - card_width / 2 < 0 or slot_centers[-1] + card_width / 2 > image_width:
                continue
            score = sum(min(abs(center - slot_center) for slot_center in slot_centers) for center in centers)
            score += abs(anchor_index - slot_index) * 0.05
            if score < best_score:
                best_score = score
                best_start_center = start_center

    y_values = [box.y for box in boxes]
    y = int(np.median(y_values))
    card_width = max(24, min(card_width, image_width))
    card_height = max(34, min(card_height, image_height))
    result = []
    for index in range(expected_cards):
        center = best_start_center + index * step
        x = int(round(center - card_width / 2))
        normalized = normalize_card_box_dimensions(
            CropBox(
                x=max(0, min(x, image_width - card_width)),
                y=max(0, min(y, image_height - card_height)),
                width=card_width,
                height=card_height,
                confidence=0.62,
            ),
            image_width,
            image_height,
        )
        result.append(normalized)
    return sorted(result, key=lambda box: box.x)


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


def normalize_card_box_dimensions(box: CropBox, image_width: int, image_height: int) -> CropBox:
    target_width = box.width
    target_height = box.height
    aspect = box.width / max(box.height, 1)
    if aspect > 0.76:
        target_height = max(target_height, int(round(box.width * 1.40)))
    elif aspect < 0.52:
        target_width = max(target_width, int(round(box.height * 0.62)))

    target_width = min(target_width, image_width)
    target_height = min(target_height, image_height)
    extra_w = max(0, target_width - box.width)
    extra_h = max(0, target_height - box.height)
    x = box.x - extra_w // 2
    y = box.y - int(extra_h * 0.70)
    x = max(0, min(x, image_width - target_width))
    y = max(0, min(y, image_height - target_height))
    return CropBox(
        x=x,
        y=y,
        width=target_width,
        height=target_height,
        confidence=box.confidence,
    )


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
    return normalized_bottom_hand_boxes(width, height, expected_cards)


def normalized_bottom_hand_boxes(width: int, height: int, expected_cards: int = 7) -> list[CropBox]:
    aspect = width / max(height, 1)
    if aspect >= 1.45:
        card_h = int(height * 0.24)
        card_w = int(card_h * 0.70)
        overlap = max(0, int((expected_cards * card_w - width * 0.72) / max(expected_cards - 1, 1)))
        y = int(height - card_h - max(6, height * 0.015))
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


def extract_card_region(image: np.ndarray, box: CropBox) -> np.ndarray:
    return image[box.y : box.y + box.height, box.x : box.x + box.width]


def save_crops(image: np.ndarray, boxes: list[CropBox], prefix: str = "crop") -> list[Path]:
    CROP_DIR.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for index, box in enumerate(boxes, start=1):
        crop = extract_card_region(image, box)
        path = CROP_DIR / f"{prefix}_{index}.png"
        cv2.imwrite(str(path), crop)
        paths.append(path)
    return paths
