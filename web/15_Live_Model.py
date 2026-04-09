from __future__ import annotations

import pandas as pd
import streamlit as st

from web.support import init_page, load_live_rows, selected_date_sidebar


init_page("Live Modeling", "In-game state translated into rolling win probability and pace-aware game context.")
selected_date = selected_date_sidebar()
live_rows = pd.DataFrame(load_live_rows(selected_date))

if live_rows.empty:
    st.info("No live games are active right now.")
else:
    st.dataframe(
        live_rows[["matchup", "inning", "outs", "projected_total", "home_win_probability", "last_update"]],
        use_container_width=True,
    )
