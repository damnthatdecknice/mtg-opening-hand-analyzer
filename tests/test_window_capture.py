from __future__ import annotations

from mtg_hand_analyzer import window_capture
from mtg_hand_analyzer.window_capture import WindowInfo, title_matches_mtgo, title_matches_mtgo_match


def test_title_matches_mtgo_client_titles() -> None:
    assert title_matches_mtgo("MAGIC: THE GATHERING ONLINE")
    assert title_matches_mtgo("Magic The Gathering Online - Match #123")
    assert title_matches_mtgo("MTGO")


def test_title_matches_mtgo_match_windows() -> None:
    assert title_matches_mtgo_match("MAGIC: THE GATHERING ONLINE   (1-on-1): Standard")
    assert title_matches_mtgo_match("Magic: The Gathering Online - 3-4 Players")
    assert not title_matches_mtgo_match("Magic: The Gathering Online - Collection")


def test_title_rejects_unrelated_windows() -> None:
    assert not title_matches_mtgo("MTG Opening Hand Analyzer")
    assert not title_matches_mtgo("Chrome - Streamlit")


def test_window_info_dimensions_are_non_negative() -> None:
    window = WindowInfo(handle=1, title="MTGO", left=40, top=20, right=10, bottom=5)
    assert window.width == 0
    assert window.height == 0


def test_find_mtgo_prefers_foreground_window(monkeypatch) -> None:
    active = WindowInfo(handle=2, title="Magic: The Gathering Online - Active Match", left=0, top=0, right=800, bottom=600)
    background = WindowInfo(handle=3, title="Magic: The Gathering Online - Collection", left=0, top=0, right=1800, bottom=1200)
    monkeypatch.setattr(window_capture, "foreground_window", lambda: active)
    monkeypatch.setattr(window_capture, "list_visible_windows", lambda: [background])

    assert window_capture.find_mtgo_window() == active


def test_find_mtgo_falls_back_to_match_window_when_foreground_is_not_mtgo(monkeypatch) -> None:
    active = WindowInfo(handle=2, title="MTG Opening Hand Analyzer", left=0, top=0, right=800, bottom=600)
    collection = WindowInfo(handle=3, title="Magic: The Gathering Online - Collection", left=0, top=0, right=1800, bottom=1200)
    match = WindowInfo(handle=4, title="Magic: The Gathering Online (1-on-1): Standard", left=0, top=0, right=1000, bottom=700)
    monkeypatch.setattr(window_capture, "foreground_window", lambda: active)
    monkeypatch.setattr(window_capture, "list_visible_windows", lambda: [collection, match])

    assert window_capture.find_mtgo_window() == match
