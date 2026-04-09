from __future__ import annotations

import pandas as pd
import streamlit as st

from web.support import init_page, load_autobet_bundle, metric_strip, selected_date_sidebar


init_page("Automated Betting Engine", "Execution-ready slips routed from the market-maker and filtered by the risk engine.")
selected_date = selected_date_sidebar()
autobet = load_autobet_bundle(selected_date)

metric_strip(
    [
        ("Generated Slips", str(autobet["total_slips"]), "Auto-bet candidates"),
        ("Total Exposure", f'${autobet["total_exposure"]:.2f}', "Portfolio exposure"),
    ]
)

st.dataframe(pd.DataFrame(autobet["slips"]), use_container_width=True)
