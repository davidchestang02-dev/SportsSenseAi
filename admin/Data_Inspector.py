from __future__ import annotations

import pandas as pd
import streamlit as st

from web.support import init_page, load_projection_rows, selected_date_sidebar


init_page("Data Inspector", "Inspect the raw player-level dataset that feeds every downstream SportsSenseAi engine.")
selected_date = selected_date_sidebar("Inspection Date")
rows = pd.DataFrame(load_projection_rows(selected_date))
st.dataframe(rows, use_container_width=True)
