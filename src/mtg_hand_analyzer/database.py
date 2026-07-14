from __future__ import annotations

import sqlite3
from pathlib import Path


class AppDatabase:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._init()

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.path)

    def _init(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS saved_decks (
                    name TEXT PRIMARY KEY,
                    decklist TEXT NOT NULL,
                    categories_json TEXT DEFAULT '{}',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
                """
            )

    def save_deck(self, name: str, decklist: str, categories_json: str = "{}") -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO saved_decks(name, decklist, categories_json, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (name, decklist, categories_json),
            )

    def list_decks(self) -> list[str]:
        with self._connect() as conn:
            rows = conn.execute("SELECT name FROM saved_decks ORDER BY name").fetchall()
        return [row[0] for row in rows]

    def load_deck(self, name: str) -> str | None:
        with self._connect() as conn:
            row = conn.execute("SELECT decklist FROM saved_decks WHERE name = ?", (name,)).fetchone()
        return row[0] if row else None

    def delete_deck(self, name: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM saved_decks WHERE name = ?", (name,))
