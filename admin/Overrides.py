from __future__ import annotations

import streamlit as st

from web.support import init_page, selected_date_sidebar


init_page("Overrides", "Manual controls for game-level confidence, lineup locks, and temporary operator interventions.")
selected_date = selected_date_sidebar("Operations Date")

st.write(f"Operating date: `{selected_date}`")
st.text_input("Game ID")
st.slider("Confidence Override", 0, 100, 72)
st.text_area("Operator Note", placeholder="Document why the override exists and who approved it.")
st.button("Queue Override")
