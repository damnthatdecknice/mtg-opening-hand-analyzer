from __future__ import annotations

import socket
import sys
import threading
import webbrowser
from pathlib import Path

from streamlit.web import bootstrap


def bundled_path(name: str) -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base / name


def find_free_port(start: int = 8501, attempts: int = 25) -> int:
    for port in range(start, start + attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind(("127.0.0.1", port))
            except OSError:
                continue
            return port
    raise RuntimeError("Could not find an available local port for the analyzer.")


def main() -> None:
    app_path = bundled_path("app.py")
    port = find_free_port()
    url = f"http://localhost:{port}"
    threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    bootstrap.run(
        str(app_path),
        False,
        [],
        {
            "server.headless": True,
            "server.port": port,
            "browser.gatherUsageStats": False,
            "global.developmentMode": False,
        },
    )


if __name__ == "__main__":
    main()
