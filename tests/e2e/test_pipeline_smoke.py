from backend.modeling.bet_engine import build_auto_bet_slips
from backend.modeling.common import sample_projection_rows
from backend.modeling.mlb_game_model import project_games
from backend.modeling.mlb_market_maker import make_market
from backend.modeling.mlb_player_model import project_batter_profile, project_pitcher_profile
from backend.modeling.mlb_slate_model import build_slate_summary
from backend.modeling.mlb_team_model import project_team_totals


def test_full_projection_pipeline_smoke():
    projected_rows = []
    for seed in sample_projection_rows():
        if seed.type == "batter":
            projected_rows.append({**seed.__dict__, **project_batter_profile(seed.__dict__)})
        else:
            projected_rows.append({**seed.__dict__, **project_pitcher_profile(seed.__dict__)})

    teams = project_team_totals(projected_rows)
    games = project_games(projected_rows)
    slate = build_slate_summary(projected_rows)

    market_inputs = []
    for row in projected_rows:
        if row["type"] != "batter":
            continue
        market = make_market(float(row["P_hrh_2p"]), popularity=0.45, exposure_ratio=0.12)
        market_inputs.append(
            {
                "player_name": row["player_name"],
                "prop_type": "H+R+RBI 2+",
                "best_book": "DraftKings",
                "fair_probability": market["fair_probability"],
                "posted_american": market["posted_american"],
                "confidence": row["compositeScore"],
            }
        )

    slips = build_auto_bet_slips(market_inputs[:3], bankroll=1000)

    assert teams
    assert games
    assert slate["top_batters"]
    assert slips
