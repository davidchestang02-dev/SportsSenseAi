from __future__ import annotations

import os

import streamlit as st

from web.support import init_page


init_page("Settings", "Environment pointers and operator-facing runtime defaults.")

st.text_input(
    "SSA_API_BASE",
    value=os.getenv("SSA_API_BASE", "https://sportssenseai-api.david-chestang02.workers.dev"),
)
st.text_input("OpenAI Model", value=os.getenv("OPENAI_MODEL", "gpt-4.1"))
st.number_input(
    "Default Bankroll",
    min_value=100,
    max_value=100000,
    value=int(os.getenv("SSA_DEFAULT_BANKROLL", "1000")),
    step=100,
)
st.button("Save Settings")
