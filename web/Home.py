from __future__ import annotations

from pathlib import Path

import pandas as pd
import streamlit as st

from web.support import init_page, load_market_rows, load_projection_rows, load_simulation_bundle, metric_strip, selected_date_sidebar


def _home() -> None:
    init_page(
        "SportsSenseAi Control Center",
        "Full-slate MLB intelligence with projections, simulation, pricing, risk, and auto-bet workflows in one launch-ready dashboard.",
    )
    selected_date = selected_date_sidebar()
    players = pd.DataFrame(load_projection_rows(selected_date))
    markets = pd.DataFrame(load_market_rows(selected_date))
    simulation = load_simulation_bundle(selected_date)

    metric_strip(
        [
            ("Slate Date", selected_date, "Current MLB board"),
            ("Tracked Players", str(len(players)), "Batters and pitchers in projection set"),
            ("Live Edges", str(len(markets)), "Market-maker opportunities"),
            ("Avg Confidence", f'{simulation["slate"]["average_confidence"]:.1f}', "Composite slate confidence"),
        ]
    )

    top_batters = players[players["type"] == "batter"].sort_values("compositeScore", ascending=False).head(5)
    top_pitchers = players[players["type"] == "pitcher"].sort_values("compositeScore", ascending=False).head(4)

    left, right = st.columns((1.2, 1))
    with left:
        st.subheader("Top Batter Board")
        st.dataframe(top_batters[["player_name", "team", "P_hrh_2p", "P_hits_1p", "compositeScore", "tier"]], use_container_width=True)
    with right:
        st.subheader("Top Pitcher Board")
        st.dataframe(top_pitchers[["player_name", "team", "k_proj", "er_proj", "compositeScore", "tier"]], use_container_width=True)

    st.subheader("Navigation")
    st.write("Use the sidebar page navigator to move through lineups, weather, simulation, market-maker, risk engine, auto-bet, and admin views.")


pages = [
    st.Page(_home, title="Home", icon=":material/home:"),
    st.Page(Path(__file__).with_name("10_Lineups.py"), title="Lineups", icon=":material/list_alt:"),
    st.Page(Path(__file__).with_name("11_Umpires.py"), title="Umpires", icon=":material/sports_baseball:"),
    st.Page(Path(__file__).with_name("12_Weather.py"), title="Weather", icon=":material/cloud:"),
    st.Page(Path(__file__).with_name("13_Park_Factors.py"), title="Park Factors", icon=":material/stadium:"),
    st.Page(Path(__file__).with_name("14_Bullpen.py"), title="Bullpen", icon=":material/bolt:"),
    st.Page(Path(__file__).with_name("15_Live_Model.py"), title="Live Model", icon=":material/timeline:"),
    st.Page(Path(__file__).with_name("16_Simulation.py"), title="Simulation", icon=":material/psychology:"),
    st.Page(Path(__file__).with_name("17_Player_Model.py"), title="Player Model", icon=":material/person_search:"),
    st.Page(Path(__file__).with_name("18_Team_Model.py"), title="Team Model", icon=":material/groups:"),
    st.Page(Path(__file__).with_name("19_Game_Model.py"), title="Game Model", icon=":material/sports_score:"),
    st.Page(Path(__file__).with_name("20_Slate_Model.py"), title="Slate Model", icon=":material/grid_view:"),
    st.Page(Path(__file__).with_name("21_Market_Maker.py"), title="Market Maker", icon=":material/trending_up:"),
    st.Page(Path(__file__).with_name("22_Risk_Engine.py"), title="Risk Engine", icon=":material/shield:"),
    st.Page(Path(__file__).with_name("23_Auto_Bet.py"), title="Auto Bet", icon=":material/auto_mode:"),
    st.Page(Path(__file__).with_name("24_Admin_Console.py"), title="Admin Console", icon=":material/tune:"),
]

navigation = st.navigation(pages, position="sidebar")
navigation.run()
