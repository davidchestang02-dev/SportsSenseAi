from __future__ import annotations

from typing import Mapping

from .common import clamp, score_from_components
from .mlb_bullpen import bullpen_adjustments
from .mlb_lineups import lineup_position_bonus
from .mlb_park_factors import park_adjustments
from .mlb_umpires import umpire_adjustments
from .mlb_weather import weather_adjustments


def derive_batter_rates(row: Mapping[str, float]) -> dict[str, float]:
    avg = float(row.get("avg", row.get("AVG", 0.255)))
    iso = float(row.get("iso", row.get("ISO", 0.165)))
    hr_rate = float(row.get("hr_rate", row.get("HR_rate", 0.045)))
    bb_rate = float(row.get("bb_rate", row.get("BB_rate", 0.085)))
    k_rate = float(row.get("k_rate", row.get("K_rate", 0.22)))

    triple_rate = 0.02 * avg
    remaining_iso = max(0.0, iso - (3 * hr_rate) - (2 * triple_rate))
    double_rate = max(0.0, remaining_iso)
    single_rate = max(0.0, avg - double_rate - triple_rate - hr_rate)

    hit_total = single_rate + double_rate + triple_rate + hr_rate
    if hit_total > 0:
      single_rate /= hit_total
      double_rate /= hit_total
      triple_rate /= hit_total
      hr_rate /= hit_total

    p_single = single_rate * avg
    p_double = double_rate * avg
    p_triple = triple_rate * avg
    p_hr = hr_rate * avg
    p_bb = bb_rate
    p_k = k_rate
    p_out = max(0.0, 1 - (p_single + p_double + p_triple + p_hr + p_bb + p_k))

    return {
        "p_single": round(p_single, 4),
        "p_double": round(p_double, 4),
        "p_triple": round(p_triple, 4),
        "p_hr": round(p_hr, 4),
        "p_bb": round(p_bb, 4),
        "p_k": round(p_k, 4),
        "p_out": round(p_out, 4),
    }


def project_batter_profile(row: Mapping[str, float | int | str]) -> dict[str, float | str]:
    rates = derive_batter_rates(row)
    weather = weather_adjustments(
        float(row.get("temp", 72)),
        float(row.get("wind_speed", 10)),
        bool(row.get("wind_out", True)),
        float(row.get("humidity", 55)),
    )
    park = park_adjustments(float(row.get("park_factor", 100)), str(row.get("bats", "R")))
    umpire = umpire_adjustments(float(row.get("umpire_zone", 1.0)))
    bullpen = bullpen_adjustments(float(row.get("bullpen_fatigue", 0.35)))
    lineup_bonus = lineup_position_bonus(int(row.get("batting_order", 6) or 6))

    hit_multiplier = weather["tb_boost"] * park["double_boost"]
    hr_multiplier = weather["hr_boost"] * park["hr_boost"] * umpire["hr_boost"]
    run_multiplier = weather["run_boost"] * park["run_boost"] * bullpen["run_boost"]

    hits_1p = clamp((rates["p_single"] + rates["p_double"] + rates["p_triple"] + rates["p_hr"]) * 4.2 * hit_multiplier, 0.2, 0.92)
    tb_2p = clamp((rates["p_single"] + 2 * rates["p_double"] + 3 * rates["p_triple"] + 4 * rates["p_hr"]) * 1.85 * hit_multiplier, 0.15, 0.82)
    runs_1p = clamp(hits_1p * 0.48 * run_multiplier, 0.08, 0.75)
    rbis_1p = clamp((hits_1p * 0.44 + rates["p_hr"] * 0.8) * run_multiplier, 0.08, 0.78)
    hrh_2p = clamp(hits_1p * 0.55 + runs_1p * 0.4 + rbis_1p * 0.45 + rates["p_hr"] * 0.7, 0.12, 0.9)

    simple_score = hrh_2p * 50 + hits_1p * 30 + tb_2p * 20
    context_boost = (weather["run_boost"] - 1) * 50 + (park["run_boost"] - 1) * 40 + lineup_bonus
    simple_score, advanced_score, composite_score, label = score_from_components(simple_score, context_boost)

    return {
        **rates,
        "P_hits_1p": round(hits_1p, 4),
        "P_tb_2p": round(tb_2p, 4),
        "P_runs_1p": round(runs_1p, 4),
        "P_rbis_1p": round(rbis_1p, 4),
        "P_hrh_2p": round(hrh_2p, 4),
        "simpleScore": simple_score,
        "advancedScore": advanced_score,
        "compositeScore": composite_score,
        "tier": label,
    }


def project_pitcher_profile(row: Mapping[str, float | int | str]) -> dict[str, float | str]:
    k_rate = float(row.get("k_rate", 0.25))
    er_rate = float(row.get("er_rate", 0.45))
    innings = float(row.get("innings", 5.5))
    weather = weather_adjustments(
        float(row.get("temp", 72)),
        float(row.get("wind_speed", 10)),
        bool(row.get("wind_out", True)),
        float(row.get("humidity", 55)),
    )
    park = park_adjustments(float(row.get("park_factor", 100)))
    umpire = umpire_adjustments(float(row.get("umpire_zone", 1.0)))

    k_proj = clamp(innings * k_rate * 3 * umpire["k_boost"], 2.5, 11.5)
    er_proj = clamp(innings * er_rate * weather["run_boost"] * park["run_boost"], 1.2, 5.8)
    simple_score = k_proj * 10 - er_proj * 5
    context_boost = (umpire["k_boost"] - 1) * 80 - (weather["run_boost"] - 1) * 40 - (park["run_boost"] - 1) * 35
    simple_score, advanced_score, composite_score, label = score_from_components(simple_score, context_boost)

    return {
        "k_proj": round(k_proj, 4),
        "er_proj": round(er_proj, 4),
        "simpleScore": simple_score,
        "advancedScore": advanced_score,
        "compositeScore": composite_score,
        "tier": label,
    }
