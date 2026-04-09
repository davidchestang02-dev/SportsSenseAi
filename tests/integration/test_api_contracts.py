from pathlib import Path


REQUIRED_TABLES = [
    "mlb_projections",
    "mlb_calibration",
    "mlb_lineups",
    "mlb_weather",
    "mlb_market_views",
    "mlb_risk_runs",
    "mlb_autobet_runs",
]


def test_schema_contains_required_tables():
    schema = Path("backend/schema/d1_schema.sql").read_text(encoding="utf-8")
    for table in REQUIRED_TABLES:
        assert table in schema


def test_router_exists():
    assert Path("backend/workers/router/src/index.ts").exists()
