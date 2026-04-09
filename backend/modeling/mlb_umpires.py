from __future__ import annotations

from .common import clamp


def umpire_adjustments(zone_size: float = 1.0, consistency: float = 1.0) -> dict[str, float]:
    zone_delta = zone_size - 1.0
    consistency_delta = consistency - 1.0
    k_boost = clamp(1.0 + zone_delta * 0.12 + consistency_delta * 0.05, 0.9, 1.1)
    bb_boost = clamp(1.0 - zone_delta * 0.10, 0.9, 1.1)
    hr_boost = clamp(1.0 - zone_delta * 0.05, 0.92, 1.08)
    run_boost = clamp(1.0 + (bb_boost + hr_boost - 2) * 0.5, 0.92, 1.08)
    return {
        "k_boost": round(k_boost, 4),
        "bb_boost": round(bb_boost, 4),
        "hr_boost": round(hr_boost, 4),
        "run_boost": round(run_boost, 4),
    }
