from backend.modeling.common import sample_projection_rows
from backend.modeling.mlb_player_model import project_batter_profile


def test_superstar_batter_stays_above_playable_band():
    seed = sample_projection_rows()[1].__dict__
    projection = project_batter_profile(seed)
    assert projection["compositeScore"] >= 65


def test_bottom_of_order_penalty_applies():
    high_row = sample_projection_rows()[0].__dict__.copy()
    low_row = sample_projection_rows()[0].__dict__.copy()
    high_row["batting_order"] = 1
    low_row["batting_order"] = 6
    assert project_batter_profile(high_row)["compositeScore"] > project_batter_profile(low_row)["compositeScore"]
