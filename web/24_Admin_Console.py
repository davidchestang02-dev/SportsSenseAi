from __future__ import annotations

import pandas as pd
import plotly.express as px
import streamlit as st

from web.support import init_page, load_admin_health, selected_date_sidebar


init_page("Admin Console", "Calibration health, system readiness, and launch-day oversight for SportsSenseAi operations.")
selected_date = selected_date_sidebar()
health = pd.DataFrame(load_admin_health(selected_date))

st.dataframe(health, use_container_width=True)
if not health.empty:
    figure = px.line(health, x="bucket", y="actual_avg", color="prop_type", markers=True, title="Calibration Health")
    st.plotly_chart(figure, use_container_width=True)
