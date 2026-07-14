from __future__ import annotations

from enum import StrEnum
from pathlib import Path

from pydantic import BaseModel, Field, field_validator


COLORS = ("W", "U", "B", "R", "G")


class Zone(StrEnum):
    MAIN = "main"
    SIDEBOARD = "sideboard"


class PlayDraw(StrEnum):
    PLAY = "play"
    DRAW = "draw"


class DeckLine(BaseModel):
    quantity: int = Field(gt=0)
    name: str
    zone: Zone = Zone.MAIN

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned = " ".join(value.strip().split())
        if not cleaned:
            raise ValueError("Card name is required")
        return cleaned


class ParseIssue(BaseModel):
    line_number: int
    line: str
    message: str


class ParsedDeck(BaseModel):
    main: list[DeckLine] = Field(default_factory=list)
    sideboard: list[DeckLine] = Field(default_factory=list)
    issues: list[ParseIssue] = Field(default_factory=list)

    @property
    def main_total(self) -> int:
        return sum(line.quantity for line in self.main)

    @property
    def sideboard_total(self) -> int:
        return sum(line.quantity for line in self.sideboard)

    def main_counts(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for line in self.main:
            counts[line.name] = counts.get(line.name, 0) + line.quantity
        return counts

    def sideboard_counts(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for line in self.sideboard:
            counts[line.name] = counts.get(line.name, 0) + line.quantity
        return counts


class CardFace(BaseModel):
    name: str
    mana_cost: str = ""
    type_line: str = ""
    oracle_text: str = ""


class CardData(BaseModel):
    name: str
    normalized_name: str
    mana_cost: str = ""
    mana_value: float = 0
    type_line: str = ""
    oracle_text: str = ""
    colors: list[str] = Field(default_factory=list)
    color_identity: list[str] = Field(default_factory=list)
    produced_mana: list[str] = Field(default_factory=list)
    faces: list[CardFace] = Field(default_factory=list)
    image_uris: dict[str, str] = Field(default_factory=dict)
    set_code: str = ""
    collector_number: str = ""
    is_land: bool = False
    is_multiface: bool = False
    source: str = "fixture"


class ManaSourceOverride(BaseModel):
    card_name: str
    colors_produced: list[str] = Field(default_factory=list)
    enters_tapped: bool = False
    conditional: bool = False
    is_land: bool = True
    exclude_from_castability: bool = False
    note: str = ""


class CategoryAssignment(BaseModel):
    card_name: str
    categories: set[str] = Field(default_factory=set)


class CropBox(BaseModel):
    x: int
    y: int
    width: int
    height: int
    confidence: float = 0.0


class RecognitionCandidate(BaseModel):
    card_name: str
    score: float
    confidence_label: str
    signals: dict[str, float] = Field(default_factory=dict)
    image_path: Path | None = None


class RecognitionResult(BaseModel):
    crop_index: int
    crop_box: CropBox
    candidates: list[RecognitionCandidate] = Field(default_factory=list)
    crop_path: Path | None = None


class ConfirmedHand(BaseModel):
    cards: list[str] = Field(min_length=7, max_length=7)
    unreadable_positions: list[int] = Field(default_factory=list)


class ProbabilityDetail(BaseModel):
    label: str
    probability: float
    method: str = "exact"
    library_size: int
    qualifying_cards: int
    draws: int
    explanation: str


class CastabilityEstimate(BaseModel):
    card_name: str
    by_turn: dict[int, float]
    trials: int
    seed: int
    warnings: list[str] = Field(default_factory=list)
