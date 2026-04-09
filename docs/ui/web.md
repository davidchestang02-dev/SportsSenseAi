# Web UI

Run the main web app with:

```powershell
streamlit run web/Home.py
```

Key pages:

- Lineups
- Weather
- Park Factors
- Bullpen
- Live Model
- Simulation
- Player Model
- Team Model
- Game Model
- Slate Model
- Market Maker
- Risk Engine
- Auto Bet
- Admin Console

The UI uses a teal/amber glass theme and can run fully on local fallback data if the backend is unavailable.

`web/Dockerfile` is included for container-based deployment because Streamlit is not a direct Cloudflare Pages runtime target.
