from __future__ import annotations

import pandas as pd
import streamlit as st

from web.support import init_page


init_page("Operator Logs", "Compact audit stream for recent interventions and system-side actions.")
logs = pd.DataFrame(
    [
        {"timestamp": "2026-04-08T18:05:00Z", "actor": "ops@sportssenseai.local", "action": "lineup_override", "detail": "Confirmed Yankees batting order."},
        {"timestamp": "2026-04-08T18:17:00Z", "actor": "ops@sportssenseai.local", "action": "risk_cap_update", "detail": "Maintained 2% single-bet cap."},
        {"timestamp": "2026-04-08T18:31:00Z", "actor": "system", "action": "simulation_refresh", "detail": "Refreshed slate bundle after live weather update."},
    ]
)
st.dataframe(logs, use_container_width=True)
