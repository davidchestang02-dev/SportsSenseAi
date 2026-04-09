from __future__ import annotations

import pandas as pd
import plotly.express as px
import streamlit as st

from web.support import init_page, load_game_contexts, selected_date_sidebar


init_page("Bullpen Model", "Late-inning fatigue and relief quality incorporated into run-environment adjustments.")
selected_date = selected_date_sidebar()
contexts = pd.DataFrame(load_game_contexts(selected_date))

if contexts.empty:
    st.info("Bullpen outlook is not available.")
else:
    contexts["matchup"] = contexts["away_team"] + " @ " + contexts["home_team"]
    st.dataframe(contexts[["matchup", "bullpen_run_boost", "run_environment"]], use_container_width=True)
    figure = px.scatter(contexts, x="bullpen_run_boost", y="run_environment", hover_name="matchup", size="run_environment")
    st.plotly_chart(figure, use_container_width=True)
