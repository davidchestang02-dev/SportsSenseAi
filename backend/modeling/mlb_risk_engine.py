from __future__ import annotations

from typing import Iterable, Mapping

from .common import american_to_probability, clamp, decimal_odds, round_to


def kelly_fraction(probability: float, decimal_price: float) -> float:
    b = decimal_price - 1
    if b <= 0:
        return 0.0
    q = 1 - probability
    return max(0.0, (b * probability - q) / b)


def size_bets(bets: Iterable[Mapping[str, float | int | str]], bankroll: float, max_fraction: float = 0.02) -> list[dict[str, float | str | int]]:
    sized: list[dict[str, float | str | int]] = []
    for bet in bets:
        fair_probability = float(bet["fair_probability"])
        posted_american = float(bet["posted_american"])
        market_probability = american_to_probability(posted_american)
        edge = fair_probability - market_probability
        price = decimal_odds(posted_american)
        raw_kelly = kelly_fraction(fair_probability, price)
        recommended_fraction = clamp(raw_kelly * float(bet.get("confidence", 70)) / 100, 0, max_fraction)
        sized.append(
            {
                **bet,
                "edge": round_to(edge, 4),
                "decimal_odds": price,
                "kelly_fraction": round_to(recommended_fraction, 4),
                "stake": round_to(bankroll * recommended_fraction, 2),
            }
        )
    return sized


def summarize_exposure(sized_bets: Iterable[Mapping[str, float | int | str]]) -> dict[str, float]:
    rows = list(sized_bets)
    return {
        "total_stake": round_to(sum(float(row.get("stake", 0)) for row in rows), 2),
        "avg_edge": round_to(sum(float(row.get("edge", 0)) for row in rows) / len(rows), 4) if rows else 0.0,
        "max_single_bet": round_to(max((float(row.get("stake", 0)) for row in rows), default=0.0), 2),
    }
