from __future__ import annotations

import pandas as pd
import streamlit as st

from web.support import init_page, load_market_rows, selected_date_sidebar


init_page("Market Maker", "Sportsbook-style pricing, shade-aware probability transforms, and live edge surfacing.")
selected_date = selected_date_sidebar()
markets = pd.DataFrame(load_market_rows(selected_date))

if markets.empty:
    st.info("No market opportunities are available.")
else:
    st.dataframe(
        markets[["player_name", "team", "prop_type", "fair_probability", "posted_american", "best_book", "edge", "confidence"]],
        use_container_width=True,
    )
