from __future__ import annotations

from dataclasses import dataclass

from mtg_hand_analyzer.models import CardData


@dataclass(frozen=True)
class RampSource:
    card_name: str
    ramp_type: str
    timing: str
    text: str


@dataclass(frozen=True)
class LandEquivalentSource:
    card_name: str
    equivalent_type: str
    timing: str
    text: str


def ramp_source(card: CardData) -> RampSource | None:
    text = " ".join([card.oracle_text, *(face.oracle_text for face in card.faces)]).casefold()
    type_line = " ".join([card.type_line, *(face.type_line for face in card.faces)])
    if card.is_land:
        return None
    if "treasure token" in text or "treasure tokens" in text:
        return RampSource(card.name, "Treasure", "temporary mana", card.oracle_text)
    if "search your library" in text and "land" in text and "battlefield" in text:
        return RampSource(card.name, "Land ramp", "extra land source", card.oracle_text)
    if "add one mana" in text or "add mana" in text or "add {" in text:
        if any(kind in type_line for kind in ["Creature", "Artifact", "Enchantment"]):
            return RampSource(card.name, "Mana permanent", "repeatable mana", card.oracle_text)
        return RampSource(card.name, "Mana burst", "temporary mana", card.oracle_text)
    if "costs {1} less" in text or "costs {2} less" in text or "costs one less" in text:
        return RampSource(card.name, "Cost reduction", "virtual mana", card.oracle_text)
    return None


def land_equivalent_source(card: CardData) -> LandEquivalentSource | None:
    if card.is_land:
        return None
    land_faces = [face for face in card.faces if "Land" in face.type_line]
    if land_faces:
        face_names = ", ".join(face.name for face in land_faces if face.name) or "land face"
        return LandEquivalentSource(
            card.name,
            "MDFC land face",
            "uses land drop",
            f"Can be played as {face_names}.",
        )

    source = ramp_source(card)
    if not source:
        return None
    if source.ramp_type == "Mana permanent" and card.mana_value <= 1:
        return LandEquivalentSource(
            card.name,
            "Castable mana source",
            "usually after spending 1 mana",
            card.oracle_text,
        )
    if source.ramp_type == "Treasure" and card.mana_value <= 1:
        return LandEquivalentSource(
            card.name,
            "Temporary mana source",
            "one-shot mana after casting",
            card.oracle_text,
        )
    return None


def ramp_sources(cards: dict[str, CardData], names: list[str] | set[str]) -> list[RampSource]:
    sources: list[RampSource] = []
    for name in sorted(set(names)):
        card = cards.get(name)
        if not card:
            continue
        source = ramp_source(card)
        if source:
            sources.append(source)
    return sources


def land_equivalent_sources(cards: dict[str, CardData], names: list[str] | set[str]) -> list[LandEquivalentSource]:
    sources: list[LandEquivalentSource] = []
    for name in sorted(set(names)):
        card = cards.get(name)
        if not card:
            continue
        source = land_equivalent_source(card)
        if source:
            sources.append(source)
    return sources
