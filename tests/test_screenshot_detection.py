from __future__ import annotations

import cv2
import numpy as np

from mtg_hand_analyzer.screenshot_detection import (
    detect_hand_region_boxes,
    normalized_fallback_boxes,
)


def test_fallback_boxes_fit_many_screenshot_sizes() -> None:
    for width, height in [(640, 360), (1920, 1080), (3840, 2160), (900, 900), (720, 1280)]:
        boxes = normalized_fallback_boxes(width, height)
        assert len(boxes) == 7
        for box in boxes:
            assert 0 <= box.x < width
            assert 0 <= box.y < height
            assert box.x + box.width <= width
            assert box.y + box.height <= height


def test_detector_handles_hand_only_crop() -> None:
    image = np.zeros((360, 900, 3), dtype=np.uint8)
    image[:] = (34, 40, 48)
    card_w, card_h = 120, 172
    start_x, y = 38, 70
    for index in range(7):
        x = start_x + index * 112
        cv2.rectangle(image, (x, y), (x + card_w, y + card_h), (210, 210, 225), 4)
        cv2.rectangle(image, (x + 10, y + 20), (x + card_w - 10, y + 95), (80, 110, 160), -1)

    boxes = detect_hand_region_boxes(image)
    assert len(boxes) == 7
    assert boxes == sorted(boxes, key=lambda box: box.x)


def test_detector_handles_large_full_screenshot() -> None:
    image = np.zeros((1440, 2560, 3), dtype=np.uint8)
    image[:] = (20, 26, 34)
    card_w, card_h = 250, 350
    start_x, y = 460, 920
    for index in range(7):
        x = start_x + index * 220
        cv2.rectangle(image, (x, y), (x + card_w, y + card_h), (220, 220, 230), 5)
        cv2.rectangle(image, (x + 20, y + 35), (x + card_w - 20, y + 190), (90, 120, 170), -1)

    boxes = detect_hand_region_boxes(image)
    assert len(boxes) == 7
    assert boxes[0].x < boxes[-1].x


def test_detector_handles_mtgo_bottom_hand_layout() -> None:
    image = np.zeros((1024, 1911, 3), dtype=np.uint8)
    image[:] = (30, 34, 38)
    cv2.rectangle(image, (175, 380), (1724, 730), (120, 130, 136), -1)
    y = 779
    for index in range(7):
        x = 188 + index * 181
        cv2.rectangle(image, (x - 8, y - 8), (x + 168, y + 237), (6, 6, 6), -1)
        cv2.rectangle(image, (x, y), (x + 160, y + 225), (230, 230, 235), 3)
        cv2.rectangle(image, (x + 8, y + 20), (x + 152, y + 125), (80, 150, 210), -1)
        cv2.rectangle(image, (x + 8, y + 145), (x + 152, y + 215), (210, 225, 235), -1)

    boxes = detect_hand_region_boxes(image)
    assert len(boxes) == 7
    assert 760 <= boxes[0].y <= 790
    assert 170 <= boxes[0].x <= 205
    assert 140 <= boxes[0].width <= 180


def test_detector_handles_shifted_hand_row_without_fixed_bottom_assumption() -> None:
    image = np.zeros((1100, 1900, 3), dtype=np.uint8)
    image[:] = (24, 28, 34)
    cv2.rectangle(image, (130, 120), (1760, 520), (70, 80, 90), -1)
    y = 575
    for index in range(7):
        x = 250 + index * 180
        cv2.rectangle(image, (x - 8, y - 8), (x + 168, y + 237), (8, 8, 8), -1)
        cv2.rectangle(image, (x, y), (x + 160, y + 225), (232, 232, 238), 3)
        cv2.rectangle(image, (x + 8, y + 20), (x + 152, y + 125), (80, 150, 210), -1)
        cv2.rectangle(image, (x + 8, y + 145), (x + 152, y + 215), (210, 225, 235), -1)

    boxes = detect_hand_region_boxes(image)

    assert len(boxes) == 7
    assert boxes[0].confidence > 0.35
    assert 560 <= boxes[0].y <= 610
    assert boxes == sorted(boxes, key=lambda box: box.x)
