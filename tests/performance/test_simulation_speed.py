from time import perf_counter

from backend.modeling.common import sample_projection_rows
from backend.modeling.mlb_player_model import project_batter_profile
from backend.modeling.mlb_simulation import simulate_batter


def test_batter_simulation_runs_quickly():
    seed = sample_projection_rows()[0].__dict__
    profile = project_batter_profile(seed)
    start = perf_counter()
    simulate_batter(profile, n_sims=1500, seed=12)
    duration = perf_counter() - start
    assert duration < 1.5
