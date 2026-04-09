from backend.modeling.bet_engine import build_auto_bet_slips


def test_autobet_never_exceeds_simple_bankroll_cap():
    edges = [
        {
            "player_name": "Aaron Judge",
            "prop_type": "H+R+RBI 2+",
            "best_book": "DraftKings",
            "fair_probability": 0.58,
            "posted_american": -110,
            "confidence": 85,
        },
        {
            "player_name": "Shohei Ohtani",
            "prop_type": "TB 2+",
            "best_book": "BetMGM",
            "fair_probability": 0.55,
            "posted_american": +125,
            "confidence": 82,
        },
    ]
    slips = build_auto_bet_slips(edges, bankroll=1000)
    assert sum(float(slip["stake"]) for slip in slips) <= 40
