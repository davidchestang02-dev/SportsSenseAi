from __future__ import annotations

import streamlit as st

from web.support import init_page


init_page("Model Tuning", "Adjust weighting assumptions for lineup, weather, park, and risk sensitivities.")

col1, col2 = st.columns(2)
with col1:
    st.slider("Simulation Weight", 0.0, 1.0, 0.55)
    st.slider("Weather Weight", 0.0, 1.0, 0.25)
with col2:
    st.slider("Park Weight", 0.0, 1.0, 0.20)
    st.slider("Risk Cap", 0.0, 0.10, 0.02)

st.button("Save Tuning Profile")
