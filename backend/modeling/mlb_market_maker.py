from __future__ import annotations

from .common import clamp, probability_to_american, round_to


def fair_odds(probability: float) -> int:
    return probability_to_american(probability)


def shade_probability(
    probability: float,
    popularity: float = 0.5,
    slate_env: float = 0.0,
    steam: float = 0.0,
    rlm: float = 0.0,
    exposure_ratio: float = 0.0,
    sharp_flag: bool = False,
) -> float:
    adjustment = popularity * 0.015 + slate_env * 0.01 + steam * 0.012 + rlm * 0.01 + exposure_ratio * 0.02
    if sharp_flag:
        adjustment += 0.008
    return round_to(clamp(probability + adjustment, 0.02, 0.98), 4)


def make_market(
    probability: float,
    popularity: float = 0.5,
    slate_env: float = 0.0,
    steam: float = 0.0,
    rlm: float = 0.0,
    exposure_ratio: float = 0.0,
    sharp_flag: bool = False,
) -> dict[str, float | int]:
    shaded_probability = shade_probability(probability, popularity, slate_env, steam, rlm, exposure_ratio, sharp_flag)
    fair = fair_odds(probability)
    posted = fair_odds(shaded_probability)
    return {
        "fair_probability": round_to(probability, 4),
        "posted_probability": shaded_probability,
        "fair_american": fair,
        "posted_american": posted,
        "edge_to_book": round_to(shaded_probability - probability, 4),
    }
