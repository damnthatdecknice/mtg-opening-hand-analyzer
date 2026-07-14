# Methodology

Probabilities use exact hypergeometric calculations when the question is a draw-from-library problem. The confirmed opening hand is removed from the submitted main deck first; all library size, land, card, and category counts come from that remaining library.

On the play, the player does not draw on turn one, so beginning-of-turn draw counts are turn minus one. On the draw, the player draws on turn one, so beginning-of-turn draw counts equal the turn number.

Mana and castability use a simple source model. Lands produce the colors provided by card data or user overrides. Tapped and conditional sources are approximated and flagged. Complex mechanics such as treasures, mana creatures, convoke, delve, cost reduction, alternate costs, and detailed modal card behavior are not modeled.

Castability by turn uses a seeded Monte Carlo simulation when exact sequencing would be impractical. The land-play heuristic uses up to one land drop per turn from lands seen in the opening hand plus draws, and treats available sources as a set of colors. Results are estimates with trial count and seed displayed.
