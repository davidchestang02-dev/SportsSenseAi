from __future__ import annotations

import pandas as pd
import streamlit as st

from web.support import init_page, load_simulation_bundle, selected_date_sidebar


init_page("Simulation Control", "Run-state visibility for the deterministic and simulation layers before and during lock.")
selected_date = selected_date_sidebar("Simulation Date")
bundle = load_simulation_bundle(selected_date)

st.subheader("Game Outputs")
st.dataframe(pd.DataFrame(bundle["games"]), use_container_width=True)
st.button("Re-run Simulation Bundle")
