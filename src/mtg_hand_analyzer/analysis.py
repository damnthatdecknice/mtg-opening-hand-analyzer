from __future__ import annotations

from collections import Counter

from mtg_hand_analyzer.card_draw import (
    draw_sources,
    estimated_probability_with_extra_looks,
    expected_extra_looks_by_turn,
)
from mtg_hand_analyzer.categories import DEFAULT_CATEGORIES, names_in_category, objective_categories
from mtg_hand_analyzer.deck_parser import validate_hand_counts
from mtg_hand_analyzer.land_inference import enrich_card_data
from mtg_hand_analyzer.mana import castability_monte_carlo
from mtg_hand_analyzer.models import CardData, PlayDraw, ProbabilityDetail
from mtg_hand_analyzer.probability import (
    draws_by_beginning_of_turn,
    land_drop_probability,
    probability_detail,
    remove_hand_from_deck,
)


def analyze_hand(
    main_counts: dict[str, int],
    hand: list[str],
    cards: dict[str, CardData],
    play_draw: PlayDraw,
    trials: int = 20_000,
    seed: int = 20260714,
    custom_categories: dict[str, set[str]] | None = None,
) -> dict:
    errors = validate_hand_counts(main_counts, hand)
    if errors:
        raise ValueError("; ".join(errors))
    cards = {name: enrich_card_data(name, cards.get(name)) for name in main_counts}
    library = remove_hand_from_deck(main_counts, hand)
    hand_counts = Counter(hand)
    lands_in_hand = sum(qty for name, qty in hand_counts.items() if cards.get(name) and cards[name].is_land)
    land_names = {name for name, card in cards.items() if card.is_land}
    lands_remaining = sum(qty for name, qty in library.items() if name in land_names)
    library_size = sum(library.values())

    land_probs: dict[str, ProbabilityDetail] = {}
    for turn in range(2, 6):
        draws = draws_by_beginning_of_turn(turn, play_draw)
        land_probs[f"Next land by turn {turn}"] = probability_detail(
            f"Next land by turn {turn}", library, land_names, draws, 1
        )
    drop_probs = {
        f"Hit land {target} by turn {target}": land_drop_probability(
            lands_in_hand,
            library_size,
            lands_remaining,
            draws_by_beginning_of_turn(target, play_draw),
            target,
        )
        for target in [2, 3, 4]
    }

    category_probs: dict[str, list[ProbabilityDetail]] = {}
    for category in DEFAULT_CATEGORIES:
        names = names_in_category(cards, category, custom_categories)
        category_probs[category] = [
            probability_detail(
                f"{category} by turn {turn}",
                library,
                names,
                draws_by_beginning_of_turn(turn, play_draw),
                1,
            )
            for turn in range(2, 6)
        ]

    castability = castability_monte_carlo(hand, library, cards, play_draw, trials=trials, seed=seed)
    hand_draw_sources = draw_sources(cards, set(hand))
    library_draw_sources = draw_sources(cards, set(library))
    card_draw_impact = {}
    for turn in range(2, 6):
        natural_draws = draws_by_beginning_of_turn(turn, play_draw)
        extra_looks = expected_extra_looks_by_turn(hand_draw_sources, castability, turn)
        card_draw_impact[turn] = {
            "natural_draws": natural_draws,
            "expected_extra_draws": extra_looks,
            "expected_extra_looks": extra_looks,
            "next_land_natural": probability_detail(
                f"Next land by turn {turn}", library, land_names, natural_draws, 1
            ).probability,
            "next_land_with_hand_draw": estimated_probability_with_extra_looks(
                library_size,
                lands_remaining,
                natural_draws,
                extra_looks,
                1,
            ),
        }
    colors_represented = sorted({color for name in hand for color in cards.get(name, CardData(name=name, normalized_name=name)).colors})
    nonlands = [cards[name] for name in hand if name in cards and not cards[name].is_land]
    avg_mv = sum(card.mana_value for card in nonlands) / len(nonlands) if nonlands else 0.0
    early_plays = {
        turn: sum(1 for estimate in castability if estimate.by_turn.get(turn, 0) >= 0.5)
        for turn in [1, 2, 3]
    }

    return {
        "library": library,
        "library_size": library_size,
        "removed_cards": dict(hand_counts),
        "lands_in_hand": lands_in_hand,
        "nonlands_in_hand": 7 - lands_in_hand,
        "lands_remaining": lands_remaining,
        "colors_represented": colors_represented,
        "average_mana_value": avg_mv,
        "land_probabilities": land_probs,
        "land_drop_probabilities": drop_probs,
        "category_probabilities": category_probs,
        "castability": castability,
        "hand_draw_sources": hand_draw_sources,
        "library_draw_sources": library_draw_sources,
        "card_draw_impact": card_draw_impact,
        "early_plays": early_plays,
        "card_categories": {name: sorted(objective_categories(card)) for name, card in cards.items()},
    }
