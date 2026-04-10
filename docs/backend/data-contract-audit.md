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
| `/project/mlb` | `mlb-schedule` | `external_plus_db` | `mlb_odds`, `mlb_odds_history` | Verified |
| `/schedule/mlb` | `mlb-schedule` | `external_plus_db` | `mlb_odds`, `mlb_odds_history` | Verified |
| `/games/mlb/:gameId` | `mlb-schedule` | `external_plus_db` | `mlb_odds`, `mlb_odds_history` | Verified |
| `/games/mlb/:gameId/odds` | `mlb-schedule` | `external_plus_db` | `mlb_odds`, `mlb_odds_history` | Verified |
| `/games/mlb/:gameId/odds/history` | `mlb-schedule` | `external_plus_db` | `mlb_odds`, `mlb_odds_history` | Verified |
| `/games/mlb/:gameId/odds/movement` | `mlb-schedule` | `external_plus_db` | `mlb_odds`, `mlb_odds_history` | Verified |
| `/games/mlb/:gameId/streams` | `mlb-schedule` | `external_plus_db` | `mlb_odds`, `mlb_odds_history` | Verified |
| `/sim/mlb` | `mlb-sim` | `db_or_mock` | `mlb_projections`, `mlb_game_context` | Partial |
| `/market/mlb` | `mlb-market-maker` | `db_or_mock` | `mlb_market_views` | Partial |
| `/risk/mlb` | `mlb-risk-engine` | `db_only` | `mlb_market_views`, `mlb_risk_runs` | Partial |
| `/autobet/mlb` | `mlb-autobet` | `db_only` | `mlb_market_views`, `mlb_autobet_runs` | Partial |
| `/lineups/mlb` | `mlb-lineups` | `db_or_mock` | `mlb_lineups`, `mlb_injuries` | Partial |
| `/game/mlb/:gameId` | `mlb-game-context` | `db_or_mock` | `mlb_projections` | Partial |
| `/player/mlb/:playerId` | `mlb-game-context` | `db_or_mock` | `mlb_projections` | Partial |
| `/live/mlb` | `mlb-game-context` | `db_or_mock` | `mlb_live` | Partial |
| `/game-context/mlb` | `mlb-game-context` | `db_or_mock` | `mlb_game_context` | Partial |
| `/admin/mlb/health-data` | `mlb-game-context` | `db_or_mock` | `mlb_calibration` | Partial |
| `/admin/mlb/data-health` | `router` | `db_only` | multiple | Verified |
| `/admin/mlb/live-sync` | `router` | `external_plus_db` | `mlb_odds`, `mlb_odds_history`, `mlb_live` | Verified |
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

## Next Pipeline Targets

1. Populate `mlb_projections` reliably from the Python modeling outputs.
2. Populate `mlb_market_views` from real odds aggregation and market maker output.
3. Populate `mlb_lineups`, `mlb_injuries`, and `mlb_game_context` before lock each day.
4. Populate `mlb_live` with pitch-level or event-level updates instead of single-snapshot fallback.
5. Populate `mlb_market_views` so `risk` and `autobet` return real D1-backed recommendations instead of `db_empty`.

## Live Ops Notes

- Production now has an active `*/1 * * * *` Cloudflare cron for the live-sync code path.
- Staging intentionally runs without a cron so production keeps the account schedule slot.
- `GET /admin/mlb/live-sync` remains the manual verification and force-refresh route, and it was verified against the live Rockies-Padres game `401814875` on April 9, 2026.
- Current app cadence for live betting surfaces is 15 seconds for `/live/mlb?refresh=1` and 30 seconds for `/schedule/mlb`.
- ESPN-style 5-second play-by-play polling remains a target profile for a future dedicated live feed worker.

## Verification Checklist

- `/admin/mlb/data-health` reports non-zero rows for the critical tables.
- `ssa_debug_source=1` shows `source: "db"` for public model routes.
- Public UI metrics read from real route outputs without any fallback-only dependency.
- Customer UI contains no infrastructure wording.
