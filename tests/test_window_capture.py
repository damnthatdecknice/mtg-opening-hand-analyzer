from __future__ import annotations

from mtg_hand_analyzer.window_capture import WindowInfo, title_matches_mtgo


def test_title_matches_mtgo_client_titles() -> None:
    assert title_matches_mtgo("MAGIC: THE GATHERING ONLINE")
    assert title_matches_mtgo("Magic The Gathering Online - Match #123")
    assert title_matches_mtgo("MTGO")


def test_title_rejects_unrelated_windows() -> None:
    assert not title_matches_mtgo("MTG Opening Hand Analyzer")
    assert not title_matches_mtgo("Chrome - Streamlit")


def test_window_info_dimensions_are_non_negative() -> None:
    window = WindowInfo(handle=1, title="MTGO", left=40, top=20, right=10, bottom=5)
    assert window.width == 0
    assert window.height == 0
