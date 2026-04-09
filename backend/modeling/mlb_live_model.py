from __future__ import annotations

from .common import clamp, logistic


def live_win_probability(score_diff: int, inning: int, pregame_probability: float = 0.5) -> float:
    inning_weight = clamp(inning / 9, 0.1, 1.2)
    score_component = score_diff * 0.55 * inning_weight
    base_component = (pregame_probability - 0.5) * 1.5
    return round(clamp(logistic(score_component + base_component), 0.01, 0.99), 4)
