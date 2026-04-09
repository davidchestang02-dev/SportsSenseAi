from __future__ import annotations

from .common import clamp


def park_adjustments(park_factor: float, handedness: str = "R") -> dict[str, float]:
    neutral_delta = (park_factor - 100) / 100
    handedness_bonus = 0.01 if handedness.upper() == "L" else 0.0
    hr_boost = clamp(1 + neutral_delta * 0.7 + handedness_bonus, 0.9, 1.14)
    double_boost = clamp(1 + neutral_delta * 0.35, 0.94, 1.1)
    run_boost = clamp(1 + neutral_delta * 0.5, 0.93, 1.12)
    return {
        "hr_boost": round(hr_boost, 4),
        "double_boost": round(double_boost, 4),
        "run_boost": round(run_boost, 4),
    }
