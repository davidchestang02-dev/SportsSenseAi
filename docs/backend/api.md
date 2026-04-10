# Backend API

Primary endpoints:

- `GET /health`
- `GET /project/mlb/hrh?date=YYYY-MM-DD`
- `GET /schedule/mlb?date=YYYY-MM-DD`
- `GET /games/mlb/{game_id}?date=YYYY-MM-DD`
- `GET /games/mlb/{game_id}/odds?date=YYYY-MM-DD`
- `GET /games/mlb/{game_id}/odds/history?date=YYYY-MM-DD&limit=24`
- `GET /games/mlb/{game_id}/odds/movement?date=YYYY-MM-DD`
- `GET /games/mlb/{game_id}/streams?date=YYYY-MM-DD`
- `GET /lineups/mlb?date=YYYY-MM-DD`
- `GET /game-context/mlb?date=YYYY-MM-DD`
- `GET /game/mlb/{game_id}`
- `GET /player/mlb/{player_id}`
- `GET /live/mlb?game_id={game_id}&refresh=1`
- `GET /admin/mlb/live-sync?date=YYYY-MM-DD&game_id={game_id}`
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

The MLB schedule routes now source slate, game detail, odds, and stream metadata from ESPN scoreboard data instead of relying on D1 projection rows or mock fallback.

Live-ops cadence:

- Cloudflare cron runs `*/1 * * * *` in staging and production to discover live MLB games, persist odds snapshots, and write summary snapshots into `mlb_live`.
- The app uses faster request-time polling for active games: schedule every 30 seconds and live summary snapshots every 15 seconds.
- ESPN-style sub-minute play-by-play targets remain the next step and are documented separately from the currently implemented cadence.

Most modeling routes still fall back to in-repo mock data if D1 is unavailable or empty, which keeps the app launchable while infrastructure is being wired. The ESPN scoreboard routes are external and do not use the in-repo mock slate.

Billing launch mode:

- Set `SSA_BILLING_BYPASS=true` to keep billing routes live while Stripe is deferred.
- `GET /billing/status` returns a `billing_bypassed` status instead of a credential error.
- `POST /billing/create-checkout-session` returns a safe no-op payload with `bypassed: true` and `checkout_url: null`.
