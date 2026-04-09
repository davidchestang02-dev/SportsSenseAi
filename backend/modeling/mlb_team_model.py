from __future__ import annotations

from collections import defaultdict
from typing import Iterable, Mapping

from .common import mean, round_to


def project_team_totals(players: Iterable[Mapping[str, float | int | str]]) -> list[dict[str, float | str | int]]:
    grouped: dict[tuple[str, str], list[Mapping[str, float | int | str]]] = defaultdict(list)
    for row in players:
        grouped[(str(row["game_id"]), str(row["team"]))].append(row)

    outputs: list[dict[str, float | str | int]] = []
    for (game_id, team), rows in grouped.items():
        batters = [row for row in rows if row.get("type") == "batter"]
        outputs.append(
            {
                "game_id": game_id,
                "team": team,
                "team_id": rows[0].get("team_id", 0),
                "expected_hits": round_to(sum(float(row.get("P_hits_1p", 0)) for row in batters), 3),
                "expected_total_bases": round_to(sum(float(row.get("P_tb_2p", 0)) * 1.65 for row in batters), 3),
                "expected_runs": round_to(sum(float(row.get("P_runs_1p", 0)) for row in batters), 3),
                "average_confidence": round_to(mean(float(row.get("compositeScore", 0)) for row in batters), 2),
            }
        )
    return outputs
