from backend.modeling.common import sample_projection_rows
from backend.modeling.mlb_player_model import derive_batter_rates, project_batter_profile, project_pitcher_profile


def test_batter_rates_sum_within_bounds():
    seed = sample_projection_rows()[0].__dict__
    rates = derive_batter_rates(seed)
    total = sum(rates.values())
    assert 0.99 <= total <= 1.01


def test_batter_projection_has_expected_fields():
    seed = sample_projection_rows()[1].__dict__
    projection = project_batter_profile(seed)
    assert projection["P_hits_1p"] > 0
    assert projection["P_tb_2p"] > 0
    assert projection["compositeScore"] >= projection["simpleScore"]
    assert projection["tier"] in {"Smash", "Strong", "Playable", "Neutral", "Avoid"}


def test_pitcher_projection_has_reasonable_range():
    seed = next(row.__dict__ for row in sample_projection_rows() if row.type == "pitcher")
    projection = project_pitcher_profile(seed)
    assert 2 <= projection["k_proj"] <= 12
    assert 1 <= projection["er_proj"] <= 6
