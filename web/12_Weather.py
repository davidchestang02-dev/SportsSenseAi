from __future__ import annotations

import pandas as pd
import plotly.express as px
import streamlit as st

from web.support import init_page, load_game_contexts, selected_date_sidebar


init_page("Weather Engine", "Temperature, wind, and atmosphere translated into offense-friendly or suppression-friendly game environments.")
selected_date = selected_date_sidebar()
contexts = pd.DataFrame(load_game_contexts(selected_date))

if contexts.empty:
    st.info("Weather feed is not available.")
else:
    contexts["matchup"] = contexts["away_team"] + " @ " + contexts["home_team"]
    st.dataframe(contexts[["matchup", "weather_desc", "temp", "wind", "run_environment"]], use_container_width=True)
    figure = px.bar(contexts, x="matchup", y="run_environment", color="temp", title="Run Environment by Game")
    st.plotly_chart(figure, use_container_width=True)
