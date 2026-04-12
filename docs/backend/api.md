# Backend API

Primary endpoints:

- `GET /health`
- `GET /project/mlb/hrh?date=YYYY-MM-DD`
- `GET /schedule/mlb?date=YYYY-MM-DD`
- `GET /pregame/mlb?date=YYYY-MM-DD`
- `GET /weather/mlb?date=YYYY-MM-DD`
- `GET /games/mlb/{game_id}?date=YYYY-MM-DD`
- `GET /games/mlb/{game_id}/preview?date=YYYY-MM-DD`
- `GET /games/mlb/{game_id}/odds?date=YYYY-MM-DD`
- `GET /games/mlb/{game_id}/odds/history?date=YYYY-MM-DD&limit=24`
- `GET /games/mlb/{game_id}/odds/movement?date=YYYY-MM-DD`
- `GET /games/mlb/{game_id}/gamecast?date=YYYY-MM-DD&refresh=1`
- `GET /games/mlb/{game_id}/streams?date=YYYY-MM-DD`
- `GET /pitchers/mlb?season=YYYY&sort=era`
- `GET /pitchers/mlb/{player_id}?season=YYYY`
- `GET /pitchers/mlb/{player_id}/splits?season=YYYY`
- `GET /lineups/mlb?date=YYYY-MM-DD`
- `GET /game-context/mlb?date=YYYY-MM-DD`
- `GET /game/mlb/{game_id}`
- `GET /player/mlb/{player_id}`
- `GET /live/mlb?game_id={game_id}&refresh=1`
- `GET|POST /admin/mlb/pregame-sync?date=YYYY-MM-DD`
- `GET|POST /admin/mlb/statcast-sync?date=YYYY-MM-DD`
- `GET|POST /admin/mlb/pitchers/sync?season=YYYY`
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

MLB foundation layers now exposed through the backend:

- Pregame slate persistence via `mlb_pregame_games`, `mlb_pregame_teams`, and `mlb_pregame_venues`
- Pitcher season and split persistence via `mlb_pitcher_stats` and `mlb_pitcher_splits`
- Statcast matchup preview persistence via `mlb_statcast_previews`
- Multi-book odds persistence via `mlb_game_odds_books` and `mlb_game_odds_books_history`
- Rich Gamecast persistence via `mlb_gamecast_state` and `mlb_gamecast_plays`

Game-odds behavior:

- Current `/schedule/mlb` and `/games/mlb/{game_id}/odds` responses remain compatible with the existing app.
- Under the hood, each game now also carries a normalized `books` ledger sourced from ESPN odds plus best-effort RotoWire enrichment.
- Odds history and movement continue to work off the persisted compatibility tables while the multi-book store is filled in parallel.

Live-ops cadence:

- Production now has an active `*/1 * * * *` Cloudflare cron for the live-sync code path.
- Staging intentionally has no cron attached so it does not consume account schedule capacity.
- The internal `GET /admin/mlb/live-sync` route remains available for manual verification and forced refreshes.
- Minute-level cron work is gated to baseball ops windows instead of running expensive scoreboard syncs all day.
- Pregame board setup runs at `11:00 ET`, then a prelock validation pass runs `60` minutes before first pitch.
- In-progress games sync on the minute, and recently completed tracked games get a `2` minute closeout window so users see finals quickly.
- A final overnight archive sweep runs at `03:00 ET` for machine-learning and historical workflows.
- The app mirrors that profile when open: active game schedule and live views refresh every `60` seconds, scheduled slates refresh hourly until prelock, and recent finals refresh every `2` minutes.
- ESPN-style sub-minute play-by-play remains a future dedicated live-feed worker rather than part of the current cron path.

Most modeling routes still fall back to in-repo mock data if D1 is unavailable or empty, which keeps the app launchable while infrastructure is being wired. The ESPN scoreboard routes are external and do not use the in-repo mock slate.

Billing launch mode:

- Set `SSA_BILLING_BYPASS=true` to keep billing routes live while Stripe is deferred.
- `GET /billing/status` returns a `billing_bypassed` status instead of a credential error.
- `POST /billing/create-checkout-session` returns a safe no-op payload with `bypassed: true` and `checkout_url: null`.
