from __future__ import annotations

from .common import clamp


def lineup_position_bonus(order: int | None) -> float:
    if order is None:
        return 0.0
    mapping = {1: 10.0, 2: 8.0, 3: 6.0, 4: 4.0, 5: 2.0}
    return mapping.get(order, 0.0)


def lineup_multiplier(order: int | None) -> float:
    return 1.0 + lineup_position_bonus(order) / 100.0


def predict_batting_order(player_quality: list[tuple[int, float]]) -> dict[int, int]:
    ranked = sorted(player_quality, key=lambda item: item[1], reverse=True)
    return {player_id: index + 1 for index, (player_id, _) in enumerate(ranked)}


def confirm_lineup(order: int | None, injury_status: str = "Healthy") -> str:
    if injury_status.lower() != "healthy":
        return "Needs review"
    return "Confirmed" if order else "Projected"
