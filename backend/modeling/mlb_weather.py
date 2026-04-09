from __future__ import annotations

from .common import clamp


def air_density_factor(temp_f: float, humidity: float) -> float:
    temp_penalty = (temp_f - 70) * 0.003
    humidity_bonus = (humidity - 50) * 0.001
    return round(clamp(1 - temp_penalty + humidity_bonus, 0.9, 1.08), 4)


def weather_adjustments(temp_f: float, wind_speed: float, wind_out: bool, humidity: float = 50) -> dict[str, float]:
    temp_component = (temp_f - 70) * 0.004
    wind_component = min(wind_speed, 20) * 0.004
    wind_sign = 1 if wind_out else -1
    hr_boost = clamp(1 + temp_component + wind_sign * wind_component, 0.86, 1.16)
    tb_boost = clamp(1 + temp_component * 0.7 + wind_sign * wind_component * 0.5, 0.9, 1.12)
    run_boost = clamp((hr_boost + tb_boost) / 2 + (50 - humidity) * 0.0008, 0.9, 1.12)
    return {
        "air_density": air_density_factor(temp_f, humidity),
        "hr_boost": round(hr_boost, 4),
        "tb_boost": round(tb_boost, 4),
        "run_boost": round(run_boost, 4),
    }
