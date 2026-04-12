# SportsSenseAi Data Contract Audit

This audit is the current route-to-source map for the public MLB product. It is meant to answer two questions clearly:

1. Which routes are truly backed by D1 or live external feeds?
2. Which routes still degrade to seeded mock logic and therefore need pipeline work next?

## Verification Rules

- Production verification route: `/admin/mlb/data-health`
- Per-route source metadata: append `?ssa_debug_source=1`
- Customer-facing routes do not expose source metadata unless debug mode is explicitly requested.

## Route Map

| Route | Worker | Source Mode | Tables | Current State |
| --- | --- | --- | --- | --- |
| `/health` | `router` | `db_or_mock` | `mlb_calibration` | Partial |
| `/project/mlb` | `mlb-schedule` | `external_plus_db` | `mlb_odds`, `mlb_odds_history`, `mlb_game_odds_books`, `mlb_game_odds_books_history` | Verified |
| `/schedule/mlb` | `mlb-schedule` | `external_plus_db` | `mlb_odds`, `mlb_odds_history`, `mlb_game_odds_books`, `mlb_game_odds_books_history` | Verified |
| `/pregame/mlb` | `mlb-pregame` | `external_plus_db` | `mlb_pregame_games`, `mlb_pregame_teams`, `mlb_pregame_venues` | Verified |
| `/weather/mlb` | `mlb-pregame` | `db_only` | `mlb_pregame_games`, `mlb_weather`, `mlb_game_context`, `mlb_statcast_previews` | Verified |
| `/pitchers/mlb` | `mlb-pitchers` | `db_only` | `mlb_pitcher_stats`, `mlb_pitcher_splits` | Verified |
| `/pitchers/mlb/:playerId` | `mlb-pitchers` | `db_only` | `mlb_pitcher_stats`, `mlb_pitcher_splits` | Verified |
| `/pitchers/mlb/:playerId/splits` | `mlb-pitchers` | `db_only` | `mlb_pitcher_stats`, `mlb_pitcher_splits` | Verified |
| `/games/mlb/:gameId` | `mlb-schedule` | `external_plus_db` | `mlb_odds`, `mlb_odds_history`, `mlb_game_odds_books`, `mlb_game_odds_books_history` | Verified |
| `/games/mlb/:gameId/preview` | `mlb-pregame` | `db_only` | `mlb_pregame_games`, `mlb_statcast_previews`, `mlb_game_context`, `mlb_weather` | Verified |
| `/games/mlb/:gameId/odds` | `mlb-schedule` | `external_plus_db` | `mlb_odds`, `mlb_odds_history`, `mlb_game_odds_books`, `mlb_game_odds_books_history` | Verified |
| `/games/mlb/:gameId/odds/history` | `mlb-schedule` | `external_plus_db` | `mlb_odds`, `mlb_odds_history`, `mlb_game_odds_books`, `mlb_game_odds_books_history` | Verified |
| `/games/mlb/:gameId/odds/movement` | `mlb-schedule` | `external_plus_db` | `mlb_odds`, `mlb_odds_history`, `mlb_game_odds_books`, `mlb_game_odds_books_history` | Verified |
| `/games/mlb/:gameId/gamecast` | `mlb-game-context` | `external_plus_db` | `mlb_gamecast_state`, `mlb_gamecast_plays`, `mlb_game_odds_books`, `mlb_live` | Verified |
| `/games/mlb/:gameId/streams` | `mlb-schedule` | `external_plus_db` | `mlb_odds`, `mlb_odds_history`, `mlb_game_odds_books`, `mlb_game_odds_books_history` | Verified |
| `/sim/mlb` | `mlb-sim` | `db_or_mock` | `mlb_projections`, `mlb_game_context` | Partial |
| `/market/mlb` | `mlb-market-maker` | `db_or_mock` | `mlb_market_views` | Partial |
| `/risk/mlb` | `mlb-risk-engine` | `db_only` | `mlb_market_views`, `mlb_risk_runs` | Partial |
| `/autobet/mlb` | `mlb-autobet` | `db_only` | `mlb_market_views`, `mlb_autobet_runs` | Partial |
| `/lineups/mlb` | `mlb-lineups` | `db_or_mock` | `mlb_lineups`, `mlb_injuries` | Partial |
| `/game/mlb/:gameId` | `mlb-game-context` | `db_or_mock` | `mlb_projections` | Partial |
| `/player/mlb/:playerId` | `mlb-game-context` | `db_or_mock` | `mlb_projections` | Partial |
| `/live/mlb` | `mlb-game-context` | `db_or_mock` | `mlb_live`, `mlb_gamecast_state`, `mlb_game_odds_books` | Partial |
| `/game-context/mlb` | `mlb-game-context` | `db_or_mock` | `mlb_game_context` | Partial |
| `/admin/mlb/health-data` | `mlb-game-context` | `db_or_mock` | `mlb_calibration` | Partial |
| `/admin/mlb/data-health` | `router` | `db_only` | multiple | Verified |
| `/admin/mlb/pregame-sync` | `mlb-pregame` | `external_plus_db` | `mlb_pregame_games`, `mlb_pregame_teams`, `mlb_pregame_venues` | Verified |
| `/admin/mlb/statcast-sync` | `mlb-pregame` | `external_plus_db` | `mlb_statcast_previews`, `mlb_pregame_games` | Verified |
| `/admin/mlb/pitchers/sync` | `mlb-pitchers` | `external_plus_db` | `mlb_pitcher_stats`, `mlb_pitcher_splits` | Verified |
| `/admin/mlb/live-sync` | `router` | `external_plus_db` | `mlb_odds`, `mlb_odds_history`, `mlb_live`, `mlb_gamecast_state`, `mlb_gamecast_plays`, `mlb_game_odds_books` | Verified |
| `/research/mlb/slate` | `mlb-research` | `external` | none | Verified |
| `/research/mlb/team/:teamId` | `mlb-research` | `external` | none | Verified |
| `/research/mlb/player/:playerId` | `mlb-research` | `external` | none | Verified |
| `/mlb/qa` | `router` | `external_plus_mock` | none | Partial |

## Highest-Risk Gaps

### Partial today

- `/sim/mlb`
- `/market/mlb`
- `/risk/mlb`
- `/autobet/mlb`
- `/lineups/mlb`
- `/game/mlb/:gameId`
- `/player/mlb/:playerId`
- `/live/mlb`
- `/game-context/mlb`
- `/admin/mlb/health-data`

These routes use D1 when rows exist, but they still fall back to mock output when the pipeline does not populate the required tables.

### Newly wired and verified

- `/pregame/mlb`
- `/weather/mlb`
- `/pitchers/mlb`
- `/pitchers/mlb/:playerId`
- `/pitchers/mlb/:playerId/splits`
- `/games/mlb/:gameId/preview`
- `/games/mlb/:gameId/gamecast`
- `/admin/mlb/pregame-sync`
- `/admin/mlb/statcast-sync`
- `/admin/mlb/pitchers/sync`

## Next Pipeline Targets

1. Populate `mlb_projections` reliably from the Python modeling outputs.
2. Populate `mlb_market_views` from real odds aggregation and market maker output.
3. Populate `mlb_lineups`, `mlb_injuries`, and `mlb_game_context` before lock each day.
4. Deepen `mlb_live` from summary snapshots into consistently pitch-level reads across all active games.
5. Populate `mlb_market_views` so `risk` and `autobet` return real D1-backed recommendations instead of `db_empty`.

## Live Ops Notes

- Production now has an active `*/1 * * * *` Cloudflare cron for the live-sync code path.
- Staging intentionally runs without a cron so production keeps the account schedule slot.
- `GET /admin/mlb/live-sync` remains the manual verification and force-refresh route, and it was verified against the live Rockies-Padres game `401814875` on April 9, 2026.
- Expensive scoreboard sync work only runs during baseball ops windows instead of every minute all day.
- Daily pregame board setup runs at `11:00 ET`, with a second validation pass `60` minutes before first pitch.
- Live games sync every minute, recently tracked finals stay hot for `2` minutes after completion, and the overnight ML archive sweep runs at `03:00 ET`.
- The app reflects that cadence while open with `60` second live refreshes, hourly scheduled-board refreshes until prelock, and `2` minute recent-final refreshes.
- Pregame slate persistence, pitcher ingestion, Statcast previews, unified odds-book persistence, and normalized Gamecast state now have D1-backed foundations in place.
- ESPN-style 5-second play-by-play polling remains a target profile for a future dedicated live feed worker.

## Verification Checklist

- `/admin/mlb/data-health` reports non-zero rows for the critical tables.
- `ssa_debug_source=1` shows `source: "db"` for public model routes.
- Public UI metrics read from real route outputs without any fallback-only dependency.
- Customer UI contains no infrastructure wording.
