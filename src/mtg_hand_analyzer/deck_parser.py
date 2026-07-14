from __future__ import annotations

import re
from collections import Counter

from mtg_hand_analyzer.models import DeckLine, ParseIssue, ParsedDeck, Zone

HEADING_RE = re.compile(r"^\s*(deck|main\s*deck|sideboard)\s*$", re.IGNORECASE)
LINE_RE = re.compile(r"^\s*(?P<qty>\d+)\s+(?P<name>.+?)\s*$")
BASIC_LANDS = {"Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"}


def normalize_card_name(name: str) -> str:
    return " ".join(name.casefold().replace("’", "'").split())


def parse_decklist(text: str) -> ParsedDeck:
    zone = Zone.MAIN
    main: list[DeckLine] = []
    sideboard: list[DeckLine] = []
    issues: list[ParseIssue] = []

    for index, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue
        heading = HEADING_RE.match(line)
        if heading:
            zone = Zone.SIDEBOARD if "side" in heading.group(1).casefold() else Zone.MAIN
            continue
        match = LINE_RE.match(line)
        if not match:
            issues.append(ParseIssue(line_number=index, line=raw_line, message="Expected '<quantity> <card name>'."))
            continue
        quantity = int(match.group("qty"))
        name = " ".join(match.group("name").strip().split())
        if quantity <= 0:
            issues.append(ParseIssue(line_number=index, line=raw_line, message="Quantity must be positive."))
            continue
        deck_line = DeckLine(quantity=quantity, name=name, zone=zone)
        if zone == Zone.MAIN:
            main.append(deck_line)
        else:
            sideboard.append(deck_line)

    return ParsedDeck(main=main, sideboard=sideboard, issues=issues)


def display_counts(lines: list[DeckLine]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for line in lines:
        counts[line.name] += line.quantity
    return counts


def validate_hand_counts(main_counts: dict[str, int], hand: list[str]) -> list[str]:
    hand_counts = Counter(hand)
    errors: list[str] = []
    for card_name, qty in hand_counts.items():
        available = main_counts.get(card_name, 0)
        if qty > available:
            errors.append(f"{card_name}: hand has {qty}, deck contains {available}.")
    if len(hand) != 7:
        errors.append("A confirmed opening hand must contain exactly seven cards.")
    return errors


def structural_warnings(deck: ParsedDeck) -> list[str]:
    warnings: list[str] = []
    for name, qty in display_counts(deck.main).items():
        if qty > 4 and name not in BASIC_LANDS:
            warnings.append(f"{name} has {qty} main-deck copies. This is allowed here but may be illegal.")
    return warnings
