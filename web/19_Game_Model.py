from __future__ import annotations

import pandas as pd
import plotly.express as px
import streamlit as st

from web.support import init_page, load_simulation_bundle, selected_date_sidebar


init_page("Game Projection Engine", "Game totals, matchup confidence, and win-probability framing for each contest on the slate.")
selected_date = selected_date_sidebar()
games = pd.DataFrame(load_simulation_bundle(selected_date)["games"])

st.dataframe(games, use_container_width=True)
if not games.empty:
    figure = px.bar(games, x="matchup", y="projected_total", color="confidence", title="Projected Game Totals")
    st.plotly_chart(figure, use_container_width=True)
