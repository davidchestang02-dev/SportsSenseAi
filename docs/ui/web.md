# Web UI

The production customer-facing web experience now lives in `frontend/` as a Cloudflare Pages app.

Run the public Pages frontend locally with:

```powershell
cd frontend
npm install
npm run dev
```

Build it for Pages with:

```powershell
cd frontend
npm run build
```

Public sections in the new app:

- Hero slate summary
- Slate Outlook
- Market Board
- Risk Engine
- AI Copilot
- Platform Status

Cloudflare-specific pieces:

- `frontend/functions/api/[[path]].js` proxies `/api/*` traffic to the Workers backend.
- `frontend/public/_routes.json` ensures only `/api/*` requests invoke Pages Functions.
- `frontend/wrangler.toml` is the Pages config for service bindings and preview routing.

Legacy Streamlit fallback:

```powershell
streamlit run web/Home.py
```

Legacy Streamlit pages:

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

The Streamlit app remains useful for internal reference while the Cloudflare frontend reaches parity.
