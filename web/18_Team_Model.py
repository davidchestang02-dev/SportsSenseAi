from __future__ import annotations

import pandas as pd
import streamlit as st

from web.support import init_page, load_simulation_bundle, selected_date_sidebar


init_page("Team Projection Engine", "Offensive environment, lineup quality, and bullpen context rolled up to team-level scoring expectations.")
selected_date = selected_date_sidebar()
teams = pd.DataFrame(load_simulation_bundle(selected_date)["teams"])
st.dataframe(teams, use_container_width=True)
