from __future__ import annotations

import pandas as pd
import streamlit as st

from web.support import init_page, load_risk_bundle, metric_strip, selected_date_sidebar


init_page("Risk Engine", "Kelly-aware bet sizing with exposure caps designed for sustainable slate construction.")
selected_date = selected_date_sidebar()
risk = load_risk_bundle(selected_date)
summary = risk["summary"]

metric_strip(
    [
        ("Total Stake", f'${summary["total_stake"]:.2f}', "Recommended slate exposure"),
        ("Average Edge", f'{summary["avg_edge"]:.3f}', "Mean model over market"),
        ("Max Bet", f'${summary["max_single_bet"]:.2f}', "Largest single allocation"),
    ]
)

st.dataframe(pd.DataFrame(risk["recommendations"]), use_container_width=True)
