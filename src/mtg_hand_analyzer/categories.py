from __future__ import annotations

from mtg_hand_analyzer.models import CardData

DEFAULT_CATEGORIES = [
    "Land",
    "Creature",
    "Noncreature spell",
    "Permanent",
    "Instant",
    "Sorcery",
    "Artifact",
    "Enchantment",
    "Planeswalker",
]


def objective_categories(card: CardData) -> set[str]:
    categories: set[str] = set()
    type_line = card.type_line
    if card.is_land or "Land" in type_line:
        categories.add("Land")
    if "Creature" in type_line:
        categories.add("Creature")
    if "Instant" in type_line:
        categories.add("Instant")
    if "Sorcery" in type_line:
        categories.add("Sorcery")
    if "Artifact" in type_line:
        categories.add("Artifact")
    if "Enchantment" in type_line:
        categories.add("Enchantment")
    if "Planeswalker" in type_line:
        categories.add("Planeswalker")
    if any(kind in type_line for kind in ["Creature", "Artifact", "Enchantment", "Planeswalker", "Battle"]):
        categories.add("Permanent")
    if not categories.intersection({"Land", "Creature"}) and not card.is_land:
        categories.add("Noncreature spell")
    return categories


def names_in_category(cards: dict[str, CardData], category: str, custom: dict[str, set[str]] | None = None) -> set[str]:
    custom = custom or {}
    names: set[str] = set()
    for name, card in cards.items():
        if category in objective_categories(card) or category in custom.get(name, set()):
            names.add(name)
    return names
