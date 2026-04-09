from __future__ import annotations

import pandas as pd
import streamlit as st

from web.support import init_page, load_game_contexts, selected_date_sidebar


init_page("Umpire Model", "Zone profile and run-environment context layered into every SportsSenseAi projection.")
selected_date = selected_date_sidebar()
contexts = pd.DataFrame(load_game_contexts(selected_date))

if contexts.empty:
    st.info("Umpire context is not available.")
else:
    view = contexts[["away_team", "home_team", "umpire_name", "umpire_k_boost", "run_environment"]].copy()
    view["matchup"] = view["away_team"] + " @ " + view["home_team"]
    st.dataframe(view[["matchup", "umpire_name", "umpire_k_boost", "run_environment"]], use_container_width=True)
    st.caption("Higher `umpire_k_boost` values support strikeout upside. Higher `run_environment` values support offensive lift.")
