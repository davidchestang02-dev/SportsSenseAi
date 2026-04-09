# SportsSenseAi

SportsSenseAi is a full MLB analytics and betting-intelligence app scaffold built from the project notes in `c:\SportsSenseAi\SportsSenseAi.md`, with the legacy branding updated throughout to `SportsSenseAi` / `SSA`.

The repo now includes:

- Cloudflare Workers backend routes for projections, lineups, game context, simulation, market making, risk, auto-bet, auth, billing status, and AI Q&A.
- Cloudflare Pages public frontend in `frontend/` with Pages Functions that proxy the Workers backend.
- Python modeling modules for player, team, game, slate, pricing, and bankroll logic.
- Streamlit web and admin apps retained as legacy/internal operator surfaces during migration.
- Expo mobile app scaffold wired to the same backend contracts.
- D1 schema, tests, workflows, and launch docs.

## Repo Shape

```text
backend/
  workers/
  modeling/
  schema/
frontend/
frontend-python-worker/
web/
admin/
mobile/
tests/
docs/
.github/workflows/
```

## Local Run

Backend:

```powershell
cd backend
npm install
npx wrangler dev --local
```

Public Cloudflare Pages app:

```powershell
cd frontend
npm install
npm run dev
```

Legacy Streamlit dashboard:

```powershell
pip install -r web/requirements.txt
streamlit run web/Home.py
```

Admin console:

```powershell
pip install -r admin/requirements.txt
streamlit run admin/Home.py
```

Mobile:

```powershell
cd mobile
npm install
npx expo start
```

Tests:

```powershell
pip install -r backend/modeling/requirements.txt
python -m pytest tests
```

## Launch Checklist

1. Create and bind Cloudflare D1, KV, and R2 resources in [`backend/wrangler.toml`](backend/wrangler.toml).
2. Set secrets from [`backend/.dev.vars.example`](backend/.dev.vars.example), especially `SSA_CF_AIG_TOKEN` or `CF_AIG_TOKEN` for the Cloudflare AI Gateway-backed `/mlb/qa` route.
3. Apply the D1 schema in [`backend/schema/d1_schema.sql`](backend/schema/d1_schema.sql).
4. Create a Cloudflare Pages project for `frontend/`, then deploy it with `npm run build` and `npm run pages:deploy`.
5. Set `SSA_API_BASE` / `EXPO_PUBLIC_SSA_API_BASE` for deployed frontend and mobile clients.
6. Add GitHub secrets required by the workflows in [`.github/workflows`](.github/workflows), especially `SSA_CF_API_TOKEN` for Cloudflare deploy automation.
7. Deploy Workers with `npx wrangler deploy --env staging` and `npx wrangler deploy --env production`, then deploy mobile and any optional admin surface.

Notes:

- `backend/scripts/sync-wrangler-secrets.ps1` bulk-pushes the repo's true secrets from `backend/.dev.vars` to default, staging, and production.
- `backend/migrations/0001_init.sql` supports `wrangler d1 migrations apply`.
- `frontend/public/_routes.json` is the Cloudflare Pages routing file for this repo. Cloudflare does not use a `pages.json` routing file here.
- `frontend-python-worker/` is an optional Python Worker scaffold for future edge logic; Pages Functions themselves stay in JavaScript/TypeScript.
- Billing is launch-safe by default with `SSA_BILLING_BYPASS=true`; flip it to `false` and add Stripe secrets when you are ready to activate payments.

## Core Docs

- [Architecture](docs/architecture/overview.md)
- [Backend API](docs/backend/api.md)
- [Modeling Pipeline](docs/modeling/pipeline.md)
- [Web UI](docs/ui/web.md)
- [Mobile App](docs/mobile/app.md)
- [Admin Console](docs/admin/console.md)
- [Deployment](docs/deployment/launch.md)
- [Streamlit to Cloudflare Migration](docs/deployment/streamlit-to-cloudflare.md)
- [Testing](docs/testing/strategy.md)
