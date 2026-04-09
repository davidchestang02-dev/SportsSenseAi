from backend.modeling.mlb_market_maker import fair_odds, make_market, shade_probability


def test_fair_odds_handles_favorite():
    assert fair_odds(0.60) < 0


def test_shading_increases_probability_when_exposure_rises():
    base = shade_probability(0.52, popularity=0.1, exposure_ratio=0.0)
    shaded = shade_probability(0.52, popularity=0.6, exposure_ratio=0.5)
    assert shaded > base


def test_make_market_returns_posted_line():
    market = make_market(0.57, popularity=0.4, exposure_ratio=0.2)
    assert "posted_american" in market
    assert market["posted_probability"] >= market["fair_probability"]
