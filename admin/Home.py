from __future__ import annotations

from pathlib import Path

import pandas as pd
import streamlit as st

from web.support import init_page, load_admin_health, load_autobet_bundle, load_risk_bundle, metric_strip, selected_date_sidebar


def _home() -> None:
    init_page(
        "SportsSenseAi Admin HQ",
        "Launch-day controls for overrides, calibration, data inspection, simulation, and automated betting supervision.",
    )
    selected_date = selected_date_sidebar("Operations Date")
    health = pd.DataFrame(load_admin_health(selected_date))
    risk = load_risk_bundle(selected_date)
    autobet = load_autobet_bundle(selected_date)

    metric_strip(
        [
            ("Health Rows", str(len(health)), "Calibration checkpoints"),
            ("Risk Recos", str(len(risk["recommendations"])), "Recommended bets"),
            ("AutoBet Slips", str(autobet["total_slips"]), "Queued execution slips"),
        ]
    )

    st.subheader("Latest Calibration")
    st.dataframe(health, use_container_width=True)


pages = [
    st.Page(_home, title="Home", icon=":material/dashboard:"),
    st.Page(Path(__file__).with_name("Overrides.py"), title="Overrides", icon=":material/tune:"),
    st.Page(Path(__file__).with_name("Model_Tuning.py"), title="Model Tuning", icon=":material/adjust:"),
    st.Page(Path(__file__).with_name("Data_Inspector.py"), title="Data Inspector", icon=":material/search:"),
    st.Page(Path(__file__).with_name("Logs.py"), title="Logs", icon=":material/receipt_long:"),
    st.Page(Path(__file__).with_name("Simulation_Control.py"), title="Simulation Control", icon=":material/psychology:"),
    st.Page(Path(__file__).with_name("AutoBet_Control.py"), title="AutoBet Control", icon=":material/auto_mode:"),
    st.Page(Path(__file__).with_name("Settings.py"), title="Settings", icon=":material/settings:"),
]

st.navigation(pages, position="sidebar").run()
