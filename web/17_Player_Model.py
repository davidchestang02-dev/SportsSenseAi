from __future__ import annotations

import pandas as pd
import streamlit as st

from web.support import init_page, load_projection_rows, selected_date_sidebar


init_page("Player Projection Engine", "Deterministic player model blended with context-aware scoring for every MLB prop candidate.")
selected_date = selected_date_sidebar()
players = pd.DataFrame(load_projection_rows(selected_date))

batters = players[players["type"] == "batter"].sort_values("compositeScore", ascending=False)
pitchers = players[players["type"] == "pitcher"].sort_values("compositeScore", ascending=False)

tab1, tab2 = st.tabs(["Batters", "Pitchers"])
with tab1:
    st.dataframe(batters[["player_name", "team", "P_hrh_2p", "P_hits_1p", "P_tb_2p", "compositeScore", "tier"]], use_container_width=True)
with tab2:
    st.dataframe(pitchers[["player_name", "team", "k_proj", "er_proj", "compositeScore", "tier"]], use_container_width=True)
