from __future__ import annotations

import sqlite3
from pathlib import Path

from mtg_hand_analyzer.card_data import CardDataProvider
from mtg_hand_analyzer.deck_parser import normalize_card_name
from mtg_hand_analyzer.models import CardData


class CardCache:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init()

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    def _init(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS cards (
                    normalized_name TEXT PRIMARY KEY,
                    exact_name TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

    def get(self, name: str) -> CardData | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT payload FROM cards WHERE normalized_name = ?",
                (normalize_card_name(name),),
            ).fetchone()
        return CardData.model_validate_json(row[0]) if row else None

    def put(self, card: CardData) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO cards(normalized_name, exact_name, payload, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (card.normalized_name, card.name, card.model_dump_json()),
            )

    def resolve(
        self,
        name: str,
        provider: CardDataProvider | None = None,
        force_refresh: bool = False,
    ) -> CardData | None:
        cached = self.get(name)
        if cached and not force_refresh:
            return cached
        if provider is None:
            return None
        try:
            card = provider.get_card(name)
        except Exception:
            return cached
        if card:
            self.put(card)
            return card
        if cached:
            return cached
        return card
