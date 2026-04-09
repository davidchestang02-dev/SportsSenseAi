from __future__ import annotations

from typing import Iterable, Mapping

from .common import mean, round_to
from .mlb_game_model import project_games


def build_slate_summary(players: Iterable[Mapping[str, float | int | str]]) -> dict[str, object]:
    rows = list(players)
    top_batters = sorted(
        [row for row in rows if row.get("type") == "batter"],
        key=lambda row: float(row.get("compositeScore", 0)),
        reverse=True,
    )[:5]
    top_pitchers = sorted(
        [row for row in rows if row.get("type") == "pitcher"],
        key=lambda row: float(row.get("compositeScore", 0)),
        reverse=True,
    )[:4]
    return {
        "top_batters": top_batters,
        "top_pitchers": top_pitchers,
        "games": project_games(rows),
        "average_confidence": round_to(mean(float(row.get("compositeScore", 0)) for row in rows), 2),
    }
