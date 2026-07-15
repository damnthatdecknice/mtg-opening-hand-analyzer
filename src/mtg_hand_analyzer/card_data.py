from __future__ import annotations

import json
from pathlib import Path
from typing import Protocol

import requests

from mtg_hand_analyzer.deck_parser import normalize_card_name
from mtg_hand_analyzer.mana import mana_value_from_cost
from mtg_hand_analyzer.models import CardData, CardFace


class CardDataProvider(Protocol):
    def get_card(self, name: str) -> CardData | None: ...


def card_from_scryfall(payload: dict) -> CardData:
    faces = [
        CardFace(
            name=face.get("name", ""),
            mana_cost=face.get("mana_cost", ""),
            type_line=face.get("type_line", ""),
            oracle_text=face.get("oracle_text", ""),
        )
        for face in payload.get("card_faces", [])
    ]
    image_uris = payload.get("image_uris") or {}
    if not image_uris and faces and payload.get("card_faces"):
        image_uris = payload["card_faces"][0].get("image_uris", {})
    type_line = payload.get("type_line") or (faces[0].type_line if faces else "")
    mana_cost = payload.get("mana_cost") or (faces[0].mana_cost if faces else "")
    mana_value = checked_mana_value(payload, mana_cost, faces, type_line)
    return CardData(
        name=payload.get("name", ""),
        normalized_name=normalize_card_name(payload.get("name", "")),
        mana_cost=mana_cost,
        mana_value=mana_value,
        type_line=type_line,
        oracle_text=payload.get("oracle_text", ""),
        colors=list(payload.get("colors", [])),
        color_identity=list(payload.get("color_identity", [])),
        produced_mana=list(payload.get("produced_mana", [])),
        faces=faces,
        image_uris=dict(image_uris),
        set_code=payload.get("set", ""),
        collector_number=payload.get("collector_number", ""),
        is_land="Land" in type_line,
        is_multiface=bool(faces),
        source="Scryfall",
    )


def checked_mana_value(payload: dict, mana_cost: str, faces: list[CardFace], type_line: str) -> float:
    scryfall_value = float(payload.get("cmc", 0) or 0)
    local_value = mana_value_from_cost(mana_cost)
    if local_value:
        return local_value
    for face in faces:
        if "Land" not in face.type_line and face.mana_cost:
            face_value = mana_value_from_cost(face.mana_cost)
            if face_value:
                return face_value
    if "Land" in type_line:
        return 0.0
    return scryfall_value


class FixtureCardDataProvider:
    def __init__(self, fixture_path: Path) -> None:
        self.fixture_path = fixture_path
        self._cards: dict[str, CardData] | None = None

    def _load(self) -> dict[str, CardData]:
        if self._cards is None:
            payload = json.loads(self.fixture_path.read_text(encoding="utf-8"))
            cards = [CardData.model_validate(item) for item in payload["cards"]]
            self._cards = {card.normalized_name: card for card in cards}
        return self._cards

    def get_card(self, name: str) -> CardData | None:
        return self._load().get(normalize_card_name(name))


class ScryfallProvider:
    def __init__(self, timeout: float = 15.0) -> None:
        self.timeout = timeout
        self.headers = {
            "User-Agent": "MTGOpeningHandAnalyzer/0.1 local-desktop-app",
            "Accept": "application/json",
        }

    def get_card(self, name: str) -> CardData | None:
        response = requests.get(
            "https://api.scryfall.com/cards/named",
            params={"exact": name},
            timeout=self.timeout,
            headers=self.headers,
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return card_from_scryfall(response.json())
