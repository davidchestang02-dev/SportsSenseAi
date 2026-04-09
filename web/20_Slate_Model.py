from __future__ import annotations

import pandas as pd
import streamlit as st

from web.support import init_page, load_simulation_bundle, metric_strip, selected_date_sidebar


init_page("Slate Engine", "Cross-game ranking, top-play surfacing, and slate-level quality control for the full MLB board.")
selected_date = selected_date_sidebar()
bundle = load_simulation_bundle(selected_date)
slate = bundle["slate"]

metric_strip(
    [
        ("Avg Confidence", f'{slate["average_confidence"]:.1f}', "Slate-wide composite"),
        ("Top Batters", str(len(slate["top_batters"])), "Highest scoring hitters"),
        ("Top Pitchers", str(len(slate["top_pitchers"])), "Highest scoring arms"),
    ]
)

st.subheader("Top Batters")
st.dataframe(pd.DataFrame(slate["top_batters"]), use_container_width=True)

st.subheader("Top Pitchers")
st.dataframe(pd.DataFrame(slate["top_pitchers"]), use_container_width=True)
