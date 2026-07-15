from __future__ import annotations

import ctypes
import sys
import time
from collections.abc import Iterable
from dataclasses import dataclass
from pathlib import Path

from PIL import ImageGrab


@dataclass(frozen=True)
class WindowInfo:
    handle: int
    title: str
    left: int
    top: int
    right: int
    bottom: int

    @property
    def width(self) -> int:
        return max(0, self.right - self.left)

    @property
    def height(self) -> int:
        return max(0, self.bottom - self.top)


MTGO_TITLE_HINTS = (
    "magic: the gathering online",
    "magic the gathering online",
    "mtgo",
)


def is_supported_platform() -> bool:
    return sys.platform.startswith("win")


def title_matches_mtgo(title: str, hints: Iterable[str] = MTGO_TITLE_HINTS) -> bool:
    normalized = " ".join(title.casefold().split())
    return any(hint in normalized for hint in hints)


def list_visible_windows() -> list[WindowInfo]:
    if not is_supported_platform():
        return []

    user32 = ctypes.windll.user32
    user32.SetProcessDPIAware()
    windows: list[WindowInfo] = []

    class RECT(ctypes.Structure):
        _fields_ = [
            ("left", ctypes.c_long),
            ("top", ctypes.c_long),
            ("right", ctypes.c_long),
            ("bottom", ctypes.c_long),
        ]

    enum_proc_type = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)

    def enum_proc(hwnd: int, _lparam: int) -> bool:
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length <= 0:
            return True
        buffer = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buffer, length + 1)
        rect = RECT()
        if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
            return True
        info = WindowInfo(
            handle=int(hwnd),
            title=buffer.value,
            left=int(rect.left),
            top=int(rect.top),
            right=int(rect.right),
            bottom=int(rect.bottom),
        )
        if info.width >= 400 and info.height >= 300:
            windows.append(info)
        return True

    user32.EnumWindows(enum_proc_type(enum_proc), 0)
    return windows


def find_mtgo_window() -> WindowInfo | None:
    matches = [window for window in list_visible_windows() if title_matches_mtgo(window.title)]
    if not matches:
        return None
    return max(matches, key=lambda window: window.width * window.height)


def capture_window_to_file(window: WindowInfo, output_path: Path) -> Path:
    if not is_supported_platform():
        raise RuntimeError("MTGO window capture is only available on Windows.")

    user32 = ctypes.windll.user32
    user32.ShowWindow(window.handle, 9)
    user32.SetForegroundWindow(window.handle)
    time.sleep(0.25)

    image = ImageGrab.grab(bbox=(window.left, window.top, window.right, window.bottom), all_screens=True)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.save(output_path, "PNG")
    return output_path
