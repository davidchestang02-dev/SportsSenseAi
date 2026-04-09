from __future__ import annotations

import pandas as pd
import streamlit as st

from web.support import init_page, load_simulation_bundle, selected_date_sidebar


init_page("Simulation Engine", "Blended player, team, and game outputs ready for pricing, risk, and execution layers.")
selected_date = selected_date_sidebar()
simulation = load_simulation_bundle(selected_date)

st.subheader("Team Outputs")
st.dataframe(pd.DataFrame(simulation["teams"]), use_container_width=True)

st.subheader("Game Outputs")
st.dataframe(pd.DataFrame(simulation["games"]), use_container_width=True)
