from __future__ import annotations

from typing import Iterable, Mapping

from .common import round_to
from .mlb_risk_engine import size_bets


def choose_best_book(books: Iterable[Mapping[str, float | str]]) -> dict[str, float | str]:
    return max(books, key=lambda book: float(book["odds"]))


def generate_slip(player_name: str, market: str, book: str, odds: float, stake: float, edge: float) -> dict[str, float | str]:
    return {
        "player_name": player_name,
        "market": market,
        "book": book,
        "odds": odds,
        "stake": round_to(stake, 2),
        "edge": round_to(edge, 4),
    }


def build_auto_bet_slips(edges: Iterable[Mapping[str, float | int | str]], bankroll: float) -> list[dict[str, float | str]]:
    sized = size_bets(edges, bankroll)
    slips = []
    for row in sized:
        slips.append(
            generate_slip(
                str(row.get("player_name")),
                str(row.get("prop_type")),
                str(row.get("best_book", "Best")),
                float(row.get("posted_american", 0)),
                float(row.get("stake", 0)),
                float(row.get("edge", 0)),
            )
        )
    return slips
