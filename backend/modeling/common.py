from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path
import math
import os
from typing import Iterable, Mapping, Sequence


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def round_to(value: float, digits: int = 4) -> float:
    return round(float(value), digits)


def tier(score: float) -> str:
    if score >= 90:
        return "Smash"
    if score >= 80:
        return "Strong"
    if score >= 65:
        return "Playable"
    if score >= 50:
        return "Neutral"
    return "Avoid"


def today_iso() -> str:
    return date.today().isoformat()


def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def sqlite_path() -> Path:
    override = os.getenv("SSA_DB_PATH")
    if override:
        return Path(override)
    return repo_root() / "backend" / ".wrangler" / "state" / "v3" / "d1" / "miniflare-D1DatabaseObject" / "DB.sqlite"


def mean(values: Iterable[float]) -> float:
    items = list(values)
    return sum(items) / len(items) if items else 0.0


def american_to_probability(american_odds: float) -> float:
    if american_odds < 0:
        return round_to(abs(american_odds) / (abs(american_odds) + 100), 4)
    return round_to(100 / (american_odds + 100), 4)


def probability_to_american(probability: float) -> int:
    probability = clamp(probability, 0.01, 0.99)
    if probability >= 0.5:
        return int(round((-100 * probability) / (1 - probability)))
    return int(round((100 * (1 - probability)) / probability))


def decimal_odds(american_odds: float) -> float:
    if american_odds < 0:
        return round_to(1 + 100 / abs(american_odds), 4)
    return round_to(1 + american_odds / 100, 4)


def logistic(value: float) -> float:
    return 1 / (1 + math.exp(-value))


@dataclass(frozen=True)
class ProjectionSeed:
    player_name: str
    player_id: int
    type: str
    team: str
    game_id: str
    avg: float = 0.280
    iso: float = 0.180
    hr_rate: float = 0.050
    bb_rate: float = 0.090
    k_rate: float = 0.220
    er_rate: float = 0.440
    innings: float = 5.7
    batting_order: int | None = None
    temp: float = 72
    wind_speed: float = 10
    wind_out: bool = True
    humidity: float = 55
    park_factor: float = 102
    umpire_zone: float = 1.0
    bullpen_fatigue: float = 0.35


def sample_projection_rows() -> list[ProjectionSeed]:
    return [
        ProjectionSeed("Juan Soto", 1001, "batter", "New York Yankees", "401700001", avg=0.301, iso=0.245, hr_rate=0.072, bb_rate=0.150, k_rate=0.170, batting_order=2),
        ProjectionSeed("Aaron Judge", 1002, "batter", "New York Yankees", "401700001", avg=0.295, iso=0.330, hr_rate=0.085, bb_rate=0.140, k_rate=0.250, batting_order=3),
        ProjectionSeed("Jazz Chisholm Jr.", 1003, "batter", "New York Yankees", "401700001", avg=0.271, iso=0.214, hr_rate=0.052, bb_rate=0.088, k_rate=0.232, batting_order=5),
        ProjectionSeed("Jarren Duran", 2001, "batter", "Boston Red Sox", "401700001", avg=0.284, iso=0.195, hr_rate=0.041, bb_rate=0.082, k_rate=0.215, batting_order=1),
        ProjectionSeed("Rafael Devers", 2002, "batter", "Boston Red Sox", "401700001", avg=0.287, iso=0.240, hr_rate=0.060, bb_rate=0.110, k_rate=0.210, batting_order=3),
        ProjectionSeed("Triston Casas", 2003, "batter", "Boston Red Sox", "401700001", avg=0.263, iso=0.233, hr_rate=0.056, bb_rate=0.126, k_rate=0.278, batting_order=4),
        ProjectionSeed("Gerrit Cole", 1004, "pitcher", "New York Yankees", "401700001", er_rate=0.42, k_rate=0.31, innings=6.0, temp=72, wind_speed=10, wind_out=True, park_factor=104),
        ProjectionSeed("Brayan Bello", 2004, "pitcher", "Boston Red Sox", "401700001", er_rate=0.48, k_rate=0.235, innings=5.4, temp=72, wind_speed=10, wind_out=True, park_factor=104),
        ProjectionSeed("Mookie Betts", 3001, "batter", "Los Angeles Dodgers", "401700002", avg=0.286, iso=0.220, hr_rate=0.055, bb_rate=0.111, k_rate=0.164, batting_order=1, temp=67, wind_speed=7, wind_out=False, park_factor=97),
        ProjectionSeed("Shohei Ohtani", 3002, "batter", "Los Angeles Dodgers", "401700002", avg=0.296, iso=0.298, hr_rate=0.078, bb_rate=0.113, k_rate=0.220, batting_order=2, temp=67, wind_speed=7, wind_out=False, park_factor=97),
        ProjectionSeed("Freddie Freeman", 3003, "batter", "Los Angeles Dodgers", "401700002", avg=0.304, iso=0.198, hr_rate=0.041, bb_rate=0.116, k_rate=0.173, batting_order=3, temp=67, wind_speed=7, wind_out=False, park_factor=97),
        ProjectionSeed("Tyler Glasnow", 3004, "pitcher", "Los Angeles Dodgers", "401700002", er_rate=0.39, k_rate=0.33, innings=5.8, temp=67, wind_speed=7, wind_out=False, park_factor=97),
        ProjectionSeed("Fernando Tatis Jr.", 4001, "batter", "San Diego Padres", "401700002", avg=0.281, iso=0.230, hr_rate=0.058, bb_rate=0.094, k_rate=0.213, batting_order=1, temp=67, wind_speed=7, wind_out=False, park_factor=97),
        ProjectionSeed("Manny Machado", 4002, "batter", "San Diego Padres", "401700002", avg=0.276, iso=0.201, hr_rate=0.044, bb_rate=0.091, k_rate=0.188, batting_order=3, temp=67, wind_speed=7, wind_out=False, park_factor=97),
        ProjectionSeed("Jackson Merrill", 4003, "batter", "San Diego Padres", "401700002", avg=0.288, iso=0.184, hr_rate=0.032, bb_rate=0.072, k_rate=0.197, batting_order=5, temp=67, wind_speed=7, wind_out=False, park_factor=97),
        ProjectionSeed("Yu Darvish", 4004, "pitcher", "San Diego Padres", "401700002", er_rate=0.43, k_rate=0.278, innings=5.7, temp=67, wind_speed=7, wind_out=False, park_factor=97),
    ]


def as_dicts(rows: Sequence[ProjectionSeed]) -> list[dict[str, float | int | str | None]]:
    return [seed.__dict__.copy() for seed in rows]


def score_from_components(simple_score: float, context_boost: float) -> tuple[float, float, float, str]:
    advanced_score = simple_score + context_boost
    composite_score = 0.45 * simple_score + 0.55 * advanced_score
    return (
        round_to(simple_score, 2),
        round_to(advanced_score, 2),
        round_to(composite_score, 2),
        tier(composite_score),
    )
