from backend.modeling.mlb_risk_engine import kelly_fraction, size_bets, summarize_exposure


def test_kelly_fraction_is_non_negative():
    fraction = kelly_fraction(0.58, 1.9)
    assert fraction >= 0


def test_size_bets_respects_fraction_cap():
    bets = [
        {
            "player_name": "Aaron Judge",
            "prop_type": "H+R+RBI 2+",
            "fair_probability": 0.58,
            "posted_american": -110,
            "confidence": 82,
        }
    ]
    sized = size_bets(bets, bankroll=1000, max_fraction=0.02)
    assert sized[0]["stake"] <= 20


def test_exposure_summary_has_total_stake():
    summary = summarize_exposure([{"stake": 18.0, "edge": 0.03}, {"stake": 12.0, "edge": 0.02}])
    assert summary["total_stake"] == 30.0
