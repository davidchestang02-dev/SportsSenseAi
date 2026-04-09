from __future__ import annotations

from .common import clamp, mean


def bullpen_fatigue(relievers: list[dict[str, float]]) -> float:
    if not relievers:
        return 0.3
    fatigue_scores = [clamp((row.get("pitches_last3", 30) / 75) + (1 - row.get("rest_days", 1) / 3), 0, 1) for row in relievers]
    return round(mean(fatigue_scores), 4)


def bullpen_adjustments(fatigue: float, leverage: float = 1.0) -> dict[str, float]:
    fatigue = clamp(fatigue, 0, 1)
    leverage = clamp(leverage, 0.5, 1.5)
    run_boost = clamp(1 + fatigue * 0.18 * leverage, 0.95, 1.18)
    k_penalty = clamp(1 - fatigue * 0.1, 0.88, 1.0)
    return {
        "fatigue": round(fatigue, 4),
        "run_boost": round(run_boost, 4),
        "k_penalty": round(k_penalty, 4),
    }
