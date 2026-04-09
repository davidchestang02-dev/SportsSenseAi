from __future__ import annotations

from collections import defaultdict
from typing import Iterable, Mapping

from .common import round_to
from .mlb_live_model import live_win_probability
from .mlb_team_model import project_team_totals


def project_games(players: Iterable[Mapping[str, float | int | str]]) -> list[dict[str, float | str]]:
    team_rows = project_team_totals(players)
    grouped: dict[str, list[dict[str, float | str | int]]] = defaultdict(list)
    for row in team_rows:
        grouped[str(row["game_id"])].append(row)

    outputs: list[dict[str, float | str]] = []
    for game_id, rows in grouped.items():
        total_runs = sum(float(row["expected_runs"]) for row in rows)
        away, home = rows[0], rows[-1]
        score_diff = float(home["expected_runs"]) - float(away["expected_runs"])
        outputs.append(
            {
                "game_id": game_id,
                "matchup": f'{away["team"]} @ {home["team"]}',
                "projected_total": round_to(total_runs, 3),
                "home_win_probability": live_win_probability(int(round(score_diff)), 1, 0.5),
                "confidence": round_to((float(away["average_confidence"]) + float(home["average_confidence"])) / 2, 2),
            }
        )
    return outputs
