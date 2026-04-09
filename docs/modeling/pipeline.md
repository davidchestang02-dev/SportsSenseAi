# Modeling Pipeline

The MLB modeling layer is intentionally modular:

- `mlb_player_model.py`: batter and pitcher projections.
- `mlb_simulation.py`: lightweight simulation and blending utilities.
- `mlb_team_model.py`: team rollups.
- `mlb_game_model.py`: matchup totals and home-win framing.
- `mlb_slate_model.py`: slate ranking and summary.
- `mlb_market_maker.py`: sportsbook-style pricing transforms.
- `mlb_risk_engine.py`: Kelly-aware stake sizing.
- `bet_engine.py`: slip generation.

Support modules provide weather, park, bullpen, lineup, umpire, and live-state adjustments.
