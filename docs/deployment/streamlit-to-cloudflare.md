# Streamlit to Cloudflare Migration Plan

## Goal

Move the public SportsSenseAi experience from the legacy Streamlit dashboard in `web/` to a Cloudflare-native frontend in `frontend/`, while keeping the proven Workers backend, D1, R2, and AI Gateway in place.

## New Public Surface

- `frontend/` becomes the production customer-facing UI on Cloudflare Pages.
- `frontend/functions/api/[[path]].js` proxies browser traffic to the backend Worker, either through a direct `SSA_API_BASE` origin or a Cloudflare service binding.
- `frontend/wrangler.toml` becomes the source of truth for Pages bindings and preview/production API targets.
- `frontend/public/_routes.json` keeps Pages Functions invocations limited to `/api/*` so static asset delivery stays cheap and fast.
- `frontend/public/_headers` adds baseline browser security and caching policy for the public site.

## Pages vs Python

- Cloudflare Pages Functions must stay in JavaScript or TypeScript, which is why `frontend/functions/` uses `[[path]].js`.
- If SportsSenseAi needs Python edge logic later, use the separate `frontend-python-worker/` Worker scaffold.
- Cloudflare does not use a `pages.json` routing file for this setup. The correct routing file is `frontend/public/_routes.json`.

## Legacy Surfaces

- `web/` remains the reference Streamlit app during migration.
- `admin/` remains the operator console for internal workflows until a separate admin web product is designed.
- `frontend-python-worker/` is an optional Worker scaffold for future Python-native edge logic. It is not required for Pages.

## View Mapping

1. `web/Home.py` -> `frontend/src/App.jsx` hero, slate outlook, market board, risk engine, and AI copilot.
2. `web/16_Simulation.py` -> `/api/sim/mlb` consumption in the new slate outlook section.
3. `web/21_Market_Maker.py` -> `/api/market/mlb` table in the new market board.
4. `web/22_Risk_Engine.py` -> `/api/risk/mlb` bankroll recommendation panel.
5. `web/24_Admin_Console.py` -> stays in `admin/` for launch one, not public Pages.

## Deployment Steps

1. From `frontend/`, run `npm install`.
2. Build with `npm run build`.
3. Optionally preview the built app with `npm run pages:dev`.
4. Create a Cloudflare Pages project named `sportssenseai-web` pointed at the `frontend/` directory.
5. Deploy with `npm run pages:deploy`.
6. Add a custom domain after the first successful production deploy.

## Cutover Checklist

- Confirm `/api/health`, `/api/sim/mlb`, `/api/market/mlb`, `/api/risk/mlb`, and `/api/mlb/qa` all respond through Pages Functions.
- Verify the public site loads from Pages without exposing the backend Worker origin in client code.
- Keep the Streamlit `web/` app available only as an internal fallback until the Pages app reaches full parity.
