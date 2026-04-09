from __future__ import annotations

import os
from typing import Any

import pandas as pd
import requests
import streamlit as st

from backend.modeling.bet_engine import build_auto_bet_slips
from backend.modeling.common import sample_projection_rows, today_iso
from backend.modeling.mlb_bullpen import bullpen_adjustments
from backend.modeling.mlb_game_model import project_games
from backend.modeling.mlb_lineups import confirm_lineup
from backend.modeling.mlb_live_model import live_win_probability
from backend.modeling.mlb_market_maker import make_market
from backend.modeling.mlb_park_factors import park_adjustments
from backend.modeling.mlb_player_model import project_batter_profile, project_pitcher_profile
from backend.modeling.mlb_risk_engine import size_bets, summarize_exposure
from backend.modeling.mlb_slate_model import build_slate_summary
from backend.modeling.mlb_team_model import project_team_totals
from backend.modeling.mlb_umpires import umpire_adjustments
from backend.modeling.mlb_weather import weather_adjustments

API_BASE = os.getenv("SSA_API_BASE", "https://sportssenseai-api.david-chestang02.workers.dev")

TEAM_IDS = {
    "New York Yankees": 10,
    "Boston Red Sox": 2,
    "Los Angeles Dodgers": 19,
    "San Diego Padres": 25,
}

GAME_META = {
    "401700001": {
        "away": "New York Yankees",
        "home": "Boston Red Sox",
        "park_name": "Fenway Park",
        "park_factor": 104,
        "weather_desc": "72F, 10 mph out to left",
        "temp": 72,
        "wind": 10,
        "wind_out": True,
        "humidity": 54,
        "umpire": "Tripp Gibson",
        "bullpen_fatigue": 0.36,
    },
    "401700002": {
        "away": "Los Angeles Dodgers",
        "home": "San Diego Padres",
        "park_name": "Petco Park",
        "park_factor": 97,
        "weather_desc": "67F, 7 mph in from center",
        "temp": 67,
        "wind": 7,
        "wind_out": False,
        "humidity": 61,
        "umpire": "Alan Porter",
        "bullpen_fatigue": 0.29,
    },
}


def init_page(title: str, subtitle: str) -> None:
    try:
        st.set_page_config(page_title=f"{title} | SportsSenseAi", layout="wide")
    except st.errors.StreamlitAPIException:
        pass
    apply_theme()
    st.markdown(
        f"""
        <div class="hero">
          <div class="eyebrow">SportsSenseAi MLB</div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )


def apply_theme() -> None:
    st.markdown(
        """
        <style>
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=IBM+Plex+Mono:wght@400;600&display=swap');
        :root {
          --ssa-ink: #eff7fb;
          --ssa-muted: #9ab7c8;
          --ssa-card: rgba(10, 25, 36, 0.78);
          --ssa-border: rgba(103, 214, 193, 0.18);
          --ssa-accent: #67d6c1;
          --ssa-sun: #f7b955;
          --ssa-alert: #ff7a59;
        }
        [data-testid="stAppViewContainer"] {
          background:
            radial-gradient(circle at top left, rgba(103,214,193,0.16), transparent 32%),
            radial-gradient(circle at top right, rgba(247,185,85,0.14), transparent 28%),
            linear-gradient(180deg, #05101a 0%, #081824 55%, #0c1d2a 100%);
          color: var(--ssa-ink);
        }
        [data-testid="stSidebar"] {
          background: rgba(4, 12, 18, 0.92);
          border-right: 1px solid rgba(103, 214, 193, 0.12);
        }
        html, body, [class*="css"]  {
          font-family: "Space Grotesk", system-ui, sans-serif;
        }
        .hero {
          background: linear-gradient(135deg, rgba(9,26,37,0.85), rgba(12,37,45,0.82));
          border: 1px solid var(--ssa-border);
          border-radius: 24px;
          padding: 1.3rem 1.4rem;
          box-shadow: 0 22px 60px rgba(0,0,0,0.25);
          margin-bottom: 1rem;
        }
        .hero h1 {
          margin: 0.15rem 0 0;
          font-size: 2.2rem;
          line-height: 1.1;
        }
        .hero p {
          color: var(--ssa-muted);
          margin: 0.45rem 0 0;
          max-width: 60rem;
        }
        .eyebrow {
          color: var(--ssa-accent);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          font-family: "IBM Plex Mono", monospace;
          font-size: 0.78rem;
        }
        .glass-card {
          background: var(--ssa-card);
          border: 1px solid var(--ssa-border);
          border-radius: 20px;
          padding: 1rem 1.1rem;
          margin-bottom: 1rem;
          backdrop-filter: blur(18px);
        }
        .metric-caption {
          color: var(--ssa-muted);
          font-size: 0.84rem;
          font-family: "IBM Plex Mono", monospace;
        }
        .metric-value {
          font-size: 1.55rem;
          font-weight: 700;
        }
        .pill {
          display: inline-block;
          border-radius: 999px;
          padding: 0.18rem 0.65rem;
          margin-right: 0.35rem;
          background: rgba(103, 214, 193, 0.14);
          border: 1px solid rgba(103, 214, 193, 0.25);
          color: var(--ssa-ink);
          font-family: "IBM Plex Mono", monospace;
          font-size: 0.75rem;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def metric_strip(metrics: list[tuple[str, str, str]]) -> None:
    columns = st.columns(len(metrics))
    for column, (label, value, helper) in zip(columns, metrics):
        column.markdown(
            f"""
            <div class="glass-card">
              <div class="metric-caption">{label}</div>
              <div class="metric-value">{value}</div>
              <div class="metric-caption">{helper}</div>
            </div>
            """,
            unsafe_allow_html=True,
        )


def card(title: str, lines: list[str]) -> None:
    body = "".join(f"<div>{line}</div>" for line in lines)
    st.markdown(f'<div class="glass-card"><h3>{title}</h3>{body}</div>', unsafe_allow_html=True)


def _remote_json(path: str, *, date: str | None = None, method: str = "GET", payload: dict[str, Any] | None = None) -> Any:
    url = f"{API_BASE}{path}"
    if date:
        joiner = "&" if "?" in url else "?"
        url = f"{url}{joiner}date={date}"
    response = requests.request(method, url, json=payload, timeout=1.8)
    response.raise_for_status()
    return response.json()


def local_projection_rows(selected_date: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for seed in sample_projection_rows():
        game_meta = GAME_META[seed.game_id]
        opponent = game_meta["home"] if seed.team == game_meta["away"] else game_meta["away"]
        projection = (
            project_batter_profile(seed.__dict__)
            if seed.type == "batter"
            else project_pitcher_profile(seed.__dict__)
        )
        rows.append(
            {
                "date": selected_date,
                "game_id": seed.game_id,
                "player_id": seed.player_id,
                "player_name": seed.player_name,
                "type": seed.type,
                "team": seed.team,
                "team_id": TEAM_IDS[seed.team],
                "opp_team": opponent,
                "opp_team_id": TEAM_IDS[opponent],
                "batting_order": seed.batting_order,
                "weather_desc": game_meta["weather_desc"],
                "temp": game_meta["temp"],
                "wind": game_meta["wind"],
                "park_factor": game_meta["park_factor"],
                "park_name": game_meta["park_name"],
                "umpire_name": game_meta["umpire"],
                "lineup_status": confirm_lineup(seed.batting_order),
                **projection,
            }
        )
    return rows


def load_projection_rows(selected_date: str) -> list[dict[str, Any]]:
    try:
        return _remote_json("/project/mlb/hrh", date=selected_date)
    except Exception:
        return local_projection_rows(selected_date)


def load_lineups(selected_date: str) -> dict[str, Any]:
    try:
        return _remote_json("/lineups/mlb", date=selected_date)
    except Exception:
        rows = local_projection_rows(selected_date)
        lineups = [
            {
                "team": row["team"],
                "team_id": row["team_id"],
                "player_name": row["player_name"],
                "player_id": row["player_id"],
                "batting_order": row["batting_order"],
                "game_id": row["game_id"],
                "status": row["lineup_status"],
            }
            for row in rows
            if row["type"] == "batter"
        ]
        injuries = [
            {
                "player_name": "Triston Casas",
                "team": "Boston Red Sox",
                "status": "Questionable",
                "description": "Managed workload after recent soreness.",
            }
        ]
        return {"date": selected_date, "lineups": lineups, "injuries": injuries}


def load_game_contexts(selected_date: str) -> list[dict[str, Any]]:
    try:
        return _remote_json("/game-context/mlb", date=selected_date)
    except Exception:
        contexts = []
        for game_id, meta in GAME_META.items():
            weather = weather_adjustments(meta["temp"], meta["wind"], meta["wind_out"], meta["humidity"])
            park = park_adjustments(meta["park_factor"])
            umpire = umpire_adjustments(1.0)
            bullpen = bullpen_adjustments(meta["bullpen_fatigue"])
            contexts.append(
                {
                    "game_id": game_id,
                    "away_team": meta["away"],
                    "home_team": meta["home"],
                    "weather_desc": meta["weather_desc"],
                    "temp": meta["temp"],
                    "wind": meta["wind"],
                    "park_name": meta["park_name"],
                    "park_factor": meta["park_factor"],
                    "umpire_name": meta["umpire"],
                    "run_environment": round(weather["run_boost"] * park["run_boost"] * bullpen["run_boost"], 3),
                    "umpire_k_boost": umpire["k_boost"],
                    "bullpen_run_boost": bullpen["run_boost"],
                }
            )
        return contexts


def load_simulation_bundle(selected_date: str) -> dict[str, Any]:
    try:
        return _remote_json("/sim/mlb", date=selected_date)
    except Exception:
        rows = local_projection_rows(selected_date)
        teams = project_team_totals(rows)
        games = project_games(rows)
        return {"date": selected_date, "players": rows, "teams": teams, "games": games, "slate": build_slate_summary(rows)}


def load_market_rows(selected_date: str) -> list[dict[str, Any]]:
    try:
        return _remote_json("/market/mlb", date=selected_date)
    except Exception:
        markets: list[dict[str, Any]] = []
        for row in local_projection_rows(selected_date):
            if row["type"] != "batter":
                continue
            for prop_type, probability in [
                ("Hits 1+", row["P_hits_1p"]),
                ("TB 2+", row["P_tb_2p"]),
                ("H+R+RBI 2+", row["P_hrh_2p"]),
            ]:
                market = make_market(float(probability), popularity=0.55, slate_env=0.08, exposure_ratio=0.12)
                markets.append(
                    {
                        "game_id": row["game_id"],
                        "player_id": row["player_id"],
                        "player_name": row["player_name"],
                        "team": row["team"],
                        "prop_type": prop_type,
                        "fair_probability": market["fair_probability"],
                        "fair_american": market["fair_american"],
                        "posted_american": market["posted_american"],
                        "best_book": "DraftKings",
                        "edge": round(float(probability) - ((100 / (market["posted_american"] + 100)) if market["posted_american"] > 0 else abs(market["posted_american"]) / (abs(market["posted_american"]) + 100)), 4),
                        "confidence": row["compositeScore"],
                    }
                )
        return sorted(markets, key=lambda item: item["edge"], reverse=True)


def load_risk_bundle(selected_date: str) -> dict[str, Any]:
    try:
        return _remote_json("/risk/mlb", date=selected_date)
    except Exception:
        recommendations = size_bets(load_market_rows(selected_date)[:8], bankroll=1000)
        return {
            "date": selected_date,
            "recommendations": recommendations,
            "summary": summarize_exposure(recommendations),
        }


def load_autobet_bundle(selected_date: str) -> dict[str, Any]:
    try:
        return _remote_json("/autobet/mlb/run", date=selected_date)
    except Exception:
        slips = build_auto_bet_slips(load_market_rows(selected_date)[:5], bankroll=1000)
        return {
            "date": selected_date,
            "total_slips": len(slips),
            "total_exposure": round(sum(float(item["stake"]) for item in slips), 2),
            "slips": slips,
        }


def load_admin_health(selected_date: str) -> list[dict[str, Any]]:
    try:
        return _remote_json("/admin/mlb/health-data", date=selected_date)
    except Exception:
        return [
            {"date": selected_date, "prop_type": "hrh_2p", "bucket": 0.3, "proj_avg": 0.30, "actual_avg": 0.29, "count": 48},
            {"date": selected_date, "prop_type": "hrh_2p", "bucket": 0.5, "proj_avg": 0.50, "actual_avg": 0.52, "count": 44},
            {"date": selected_date, "prop_type": "hits_1p", "bucket": 0.6, "proj_avg": 0.60, "actual_avg": 0.61, "count": 51},
            {"date": selected_date, "prop_type": "hits_1p", "bucket": 0.7, "proj_avg": 0.70, "actual_avg": 0.68, "count": 49},
        ]


def load_live_rows(selected_date: str) -> list[dict[str, Any]]:
    simulations = load_simulation_bundle(selected_date)
    rows = []
    for game in simulations["games"]:
        rows.append(
            {
                **game,
                "inning": 5,
                "outs": 1,
                "last_update": f"{selected_date}T19:35:00Z",
                "home_win_probability": live_win_probability(1, 5, float(game["home_win_probability"])),
            }
        )
    return rows


def selected_date_sidebar(label: str = "Slate Date") -> str:
    return st.sidebar.date_input(label, value=pd.Timestamp(today_iso())).isoformat()
