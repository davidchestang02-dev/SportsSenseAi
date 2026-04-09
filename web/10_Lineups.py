from __future__ import annotations

import pandas as pd
import streamlit as st

from web.support import card, init_page, load_lineups, selected_date_sidebar


init_page("Lineup Engine", "Projected and confirmed batting orders with quick injury visibility and lineup lock context.")
selected_date = selected_date_sidebar()
payload = load_lineups(selected_date)
lineups = pd.DataFrame(payload["lineups"])
injuries = pd.DataFrame(payload["injuries"])

if lineups.empty:
    st.info("No lineups available yet.")
else:
    for team, frame in lineups.sort_values(["team", "batting_order"]).groupby("team"):
        card(
            team,
            [
                f'<span class="pill">Game {frame.iloc[0]["game_id"]}</span><span class="pill">{frame.iloc[0]["status"]}</span>',
                *[f'{int(row["batting_order"])}. {row["player_name"]}' for _, row in frame.iterrows()],
            ],
        )

st.subheader("Injury Feed")
if injuries.empty:
    st.success("No flagged injuries in the current slate feed.")
else:
    st.dataframe(injuries, use_container_width=True)
