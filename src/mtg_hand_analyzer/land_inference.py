from __future__ import annotations

from mtg_hand_analyzer.deck_parser import normalize_card_name
from mtg_hand_analyzer.models import CardData

BASIC_LAND_MANA = {
    "plains": ["W"],
    "island": ["U"],
    "swamp": ["B"],
    "mountain": ["R"],
    "forest": ["G"],
    "wastes": ["C"],
}

KNOWN_LAND_MANA = {
    "steam vents": ["U", "R"],
    "spirebluff canal": ["U", "R"],
    "stormcarved coast": ["U", "R"],
    "riverpyre verge": ["U", "R"],
    "scalding tarn": ["U", "R"],
    "shivan reef": ["U", "R", "C"],
    "sulfur falls": ["U", "R"],
    "training center": ["U", "R"],
    "fiery islet": ["U", "R"],
    "temple of epiphany": ["U", "R"],
    "frostboil snarl": ["U", "R"],
    "volcanic island": ["U", "R"],
    "inspiring vantage": ["R", "W"],
    "battlefield forge": ["R", "W", "C"],
    "llanowar wastes": ["B", "G", "C"],
    "blooming marsh": ["B", "G"],
}


def infer_land_card(name: str) -> CardData | None:
    normalized = normalize_card_name(name)
    produced = BASIC_LAND_MANA.get(normalized) or KNOWN_LAND_MANA.get(normalized)
    if not produced:
        return None
    type_line = f"Basic Land - {name}" if normalized in BASIC_LAND_MANA else "Land"
    return CardData(
        name=name,
        normalized_name=normalized,
        mana_cost="",
        mana_value=0,
        type_line=type_line,
        oracle_text=f"Tap: Add {' or '.join(produced)}.",
        colors=[],
        color_identity=[color for color in produced if color != "C"],
        produced_mana=produced,
        is_land=True,
        source="built-in land inference",
    )


def enrich_card_data(name: str, card: CardData | None) -> CardData:
    inferred = infer_land_card(name)
    if card is None:
        return inferred or CardData(name=name, normalized_name=normalize_card_name(name), source="unresolved")
    if inferred and (not card.is_land or not card.produced_mana):
        data = card.model_copy(deep=True)
        data.is_land = True
        if not data.type_line:
            data.type_line = inferred.type_line
        if not data.produced_mana:
            data.produced_mana = inferred.produced_mana
        if not data.color_identity:
            data.color_identity = inferred.color_identity
        return data
    if "Land" in card.type_line and not card.is_land:
        data = card.model_copy(deep=True)
        data.is_land = True
        return data
    return card
