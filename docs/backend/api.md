# Backend API

Primary endpoints:

- `GET /health`
- `GET /project/mlb/hrh?date=YYYY-MM-DD`
- `GET /lineups/mlb?date=YYYY-MM-DD`
- `GET /game-context/mlb?date=YYYY-MM-DD`
- `GET /game/mlb/{game_id}`
- `GET /player/mlb/{player_id}`
- `GET /live/mlb?game_id={game_id}`
- `GET /sim/mlb?date=YYYY-MM-DD`
- `GET /market/mlb?date=YYYY-MM-DD`
- `GET /risk/mlb?date=YYYY-MM-DD`
- `POST /risk/mlb`
- `GET|POST /autobet/mlb/run?date=YYYY-MM-DD`
- `POST /auth/signup`
- `POST /auth/login`
- `GET /auth/me`
- `GET /billing/status`
- `POST /billing/create-checkout-session`
- `POST /mlb/qa`

The worker falls back to in-repo mock data if D1 is unavailable or empty, which keeps the app launchable while infrastructure is being wired.

Billing launch mode:

- Set `SSA_BILLING_BYPASS=true` to keep billing routes live while Stripe is deferred.
- `GET /billing/status` returns a `billing_bypassed` status instead of a credential error.
- `POST /billing/create-checkout-session` returns a safe no-op payload with `bypassed: true` and `checkout_url: null`.
