from __future__ import annotations

import pandas as pd
import streamlit as st

from web.support import init_page, load_game_contexts, selected_date_sidebar


init_page("Park Factor Engine", "Venue context for HR carry, doubles environment, and scoring expectancy.")
selected_date = selected_date_sidebar()
contexts = pd.DataFrame(load_game_contexts(selected_date))

if contexts.empty:
    st.info("Park factors are not available.")
else:
    contexts["matchup"] = contexts["away_team"] + " @ " + contexts["home_team"]
    st.dataframe(contexts[["matchup", "park_name", "park_factor", "run_environment"]], use_container_width=True)
