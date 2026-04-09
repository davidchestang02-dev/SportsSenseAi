from __future__ import annotations

import pandas as pd
import streamlit as st

from web.support import init_page, load_autobet_bundle, selected_date_sidebar


init_page("AutoBet Control", "Review, pause, or release SportsSenseAi generated slips into the execution queue.")
selected_date = selected_date_sidebar("AutoBet Date")
bundle = load_autobet_bundle(selected_date)

st.dataframe(pd.DataFrame(bundle["slips"]), use_container_width=True)
st.toggle("Pause automatic execution", value=False)
st.button("Approve Slip Queue")
