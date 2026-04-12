import { queryFirst } from "./db";
import type { Env } from "./types";

export type SourceMode = "db_only" | "db_or_mock" | "mock_only" | "external" | "external_plus_db" | "external_plus_mock";

export type VerificationStatus = "verified" | "partial" | "blocked";

export interface RouteAuditEntry {
  path: string;
  worker: string;
  source_mode: SourceMode;
  verification_status: VerificationStatus;
  tables: string[];
  notes: string;
}

export const ROUTE_AUDIT: RouteAuditEntry[] = [
  {
    path: "/health",
    worker: "router",
    source_mode: "db_or_mock",
    verification_status: "partial",
    tables: ["mlb_calibration"],
    notes: "Latest calibration row comes from D1 when available, otherwise mock calibration seed."
  },
  {
    path: "/project/mlb",
    worker: "mlb-schedule",
    source_mode: "external_plus_db",
    verification_status: "verified",
    tables: ["mlb_odds", "mlb_odds_history"],
    notes: "Scoreboard slate and odds are fetched live from ESPN, normalized into SportsSenseAi game objects, and used to seed odds snapshots in D1."
  },
  {
    path: "/schedule/mlb",
    worker: "mlb-schedule",
    source_mode: "external_plus_db",
    verification_status: "verified",
    tables: ["mlb_odds", "mlb_odds_history", "mlb_game_odds_books", "mlb_game_odds_books_history"],
    notes: "Alias of /project/mlb with the same ESPN scoreboard-based ingestion, D1 write-back behavior, and unified game-odds book snapshots."
  },
  {
    path: "/pregame/mlb",
    worker: "mlb-pregame",
    source_mode: "external_plus_db",
    verification_status: "partial",
    tables: ["mlb_pregame_games", "mlb_pregame_teams", "mlb_pregame_venues"],
    notes: "Persisted MLB pregame slate built from the ESPN scoreboard and re-read from D1."
  },
  {
    path: "/games/mlb/:gameId",
    worker: "mlb-schedule",
    source_mode: "external_plus_db",
    verification_status: "verified",
    tables: ["mlb_odds", "mlb_odds_history", "mlb_game_odds_books", "mlb_game_odds_books_history"],
    notes: "Game detail is fetched from the ESPN scoreboard feed, normalized into the SportsSenseAi game schema, and can persist single-book plus unified game-odds snapshots to D1."
  },
  {
    path: "/games/mlb/:gameId/odds",
    worker: "mlb-schedule",
    source_mode: "external_plus_db",
    verification_status: "verified",
    tables: ["mlb_odds", "mlb_odds_history", "mlb_game_odds_books", "mlb_game_odds_books_history"],
    notes: "Game odds are fetched from ESPN scoreboard competition odds, normalized into the SportsSenseAi odds schema, and enriched with unified book snapshots when available."
  },
  {
    path: "/games/mlb/:gameId/streams",
    worker: "mlb-schedule",
    source_mode: "external_plus_db",
    verification_status: "verified",
    tables: ["mlb_odds", "mlb_odds_history"],
    notes: "Game stream metadata is fetched from ESPN scoreboard watch and broadcast fields while the game route can also seed odds snapshots in D1."
  },
  {
    path: "/games/mlb/:gameId/odds/history",
    worker: "mlb-schedule",
    source_mode: "external_plus_db",
    verification_status: "verified",
    tables: ["mlb_odds", "mlb_odds_history"],
    notes: "Odds history is served from persisted D1 odds snapshots and refreshed from the ESPN scoreboard when the current game window is available."
  },
  {
    path: "/games/mlb/:gameId/odds/movement",
    worker: "mlb-schedule",
    source_mode: "external_plus_db",
    verification_status: "verified",
    tables: ["mlb_odds", "mlb_odds_history"],
    notes: "Line movement is computed from persisted D1 odds snapshots and refreshed from the ESPN scoreboard when the current game window is available."
  },
  {
    path: "/games/mlb/:gameId/preview",
    worker: "mlb-pregame",
    source_mode: "external_plus_db",
    verification_status: "partial",
    tables: ["mlb_pregame_games", "mlb_statcast_previews", "mlb_game_context", "mlb_weather"],
    notes: "Joined preview surface combining persisted pregame slate, Statcast preview, game context, and weather."
  },
  {
    path: "/weather/mlb",
    worker: "mlb-pregame",
    source_mode: "external_plus_db",
    verification_status: "partial",
    tables: ["mlb_pregame_games", "mlb_weather", "mlb_game_context", "mlb_statcast_previews"],
    notes: "Weather research page built from persisted pregame slate, weather, context, and preview presence."
  },
  {
    path: "/pitchers/mlb",
    worker: "mlb-pitchers",
    source_mode: "external_plus_db",
    verification_status: "partial",
    tables: ["mlb_pitcher_stats", "mlb_pitcher_splits"],
    notes: "Pitcher leaderboard served from D1 and refreshed from ESPN stats page, site roster metadata, and core stats when requested."
  },
  {
    path: "/pitchers/mlb/:playerId",
    worker: "mlb-pitchers",
    source_mode: "db_only",
    verification_status: "partial",
    tables: ["mlb_pitcher_stats", "mlb_pitcher_splits"],
    notes: "Full normalized pitcher profile served from D1."
  },
  {
    path: "/pitchers/mlb/:playerId/splits",
    worker: "mlb-pitchers",
    source_mode: "db_only",
    verification_status: "partial",
    tables: ["mlb_pitcher_splits"],
    notes: "Pitcher split ledger served from D1."
  },
  {
    path: "/sim/mlb",
    worker: "mlb-sim",
    source_mode: "db_or_mock",
    verification_status: "partial",
    tables: ["mlb_projections", "mlb_game_context"],
    notes: "Player projections and game environment should both come from D1 before mock fallback."
  },
  {
    path: "/market/mlb",
    worker: "mlb-market-maker",
    source_mode: "db_or_mock",
    verification_status: "partial",
    tables: ["mlb_market_views"],
    notes: "Market board is D1-backed when views exist and otherwise uses mock market output."
  },
  {
    path: "/risk/mlb",
    worker: "mlb-risk-engine",
    source_mode: "db_only",
    verification_status: "partial",
    tables: ["mlb_market_views", "mlb_risk_runs"],
    notes: "GET/POST now generate D1-backed portfolio recommendations from mlb_market_views and persist audit rows to mlb_risk_runs."
  },
  {
    path: "/autobet/mlb",
    worker: "mlb-autobet",
    source_mode: "db_only",
    verification_status: "partial",
    tables: ["mlb_market_views", "mlb_autobet_runs"],
    notes: "Autobet slips now derive from D1-backed market views and persist execution summaries to mlb_autobet_runs."
  },
  {
    path: "/lineups/mlb",
    worker: "mlb-lineups",
    source_mode: "db_or_mock",
    verification_status: "partial",
    tables: ["mlb_lineups", "mlb_injuries"],
    notes: "Lineups and injuries use D1 when available and fallback to seeded lineup data otherwise."
  },
  {
    path: "/game/mlb/:gameId",
    worker: "mlb-game-context",
    source_mode: "db_or_mock",
    verification_status: "partial",
    tables: ["mlb_projections"],
    notes: "Game detail resolves player projection rows from D1 or uses mock slate rows."
  },
  {
    path: "/player/mlb/:playerId",
    worker: "mlb-game-context",
    source_mode: "db_or_mock",
    verification_status: "partial",
    tables: ["mlb_projections"],
    notes: "Player detail resolves latest projection row from D1 or uses mock slate row."
  },
  {
    path: "/live/mlb",
    worker: "mlb-game-context",
    source_mode: "external_plus_db",
    verification_status: "partial",
    tables: ["mlb_live", "mlb_gamecast_state", "mlb_gamecast_plays", "mlb_game_odds_books"],
    notes: "Live game state uses the latest D1 row by default, and `refresh=1` rehydrates mlb_live from ESPN while pairing it with a persisted normalized Gamecast object."
  },
  {
    path: "/games/mlb/:gameId/gamecast",
    worker: "mlb-game-context",
    source_mode: "external_plus_db",
    verification_status: "partial",
    tables: ["mlb_gamecast_state", "mlb_gamecast_plays", "mlb_game_odds_books", "mlb_live"],
    notes: "Normalized Gamecast object built from ESPN summary, plays, boxscore, and persisted book odds."
  },
  {
    path: "/game-context/mlb",
    worker: "mlb-game-context",
    source_mode: "db_or_mock",
    verification_status: "partial",
    tables: ["mlb_game_context"],
    notes: "Game context is D1-backed when available and otherwise seeded from mock context."
  },
  {
    path: "/admin/mlb/health-data",
    worker: "mlb-game-context",
    source_mode: "db_or_mock",
    verification_status: "partial",
    tables: ["mlb_calibration"],
    notes: "Calibration inspection uses D1 first and mock calibration curves otherwise."
  },
  {
    path: "/admin/mlb/data-health",
    worker: "router",
    source_mode: "db_only",
    verification_status: "verified",
    tables: ["mlb_projections", "mlb_market_views", "mlb_lineups", "mlb_injuries", "mlb_live", "mlb_game_context", "mlb_calibration"],
    notes: "Internal verification route exposing row counts, route audit, and mock-risk summary."
  },
  {
    path: "/admin/mlb/live-sync",
    worker: "router",
    source_mode: "external_plus_db",
    verification_status: "verified",
    tables: ["mlb_odds", "mlb_odds_history", "mlb_live"],
    notes:
      "Internal live-ops route that discovers live games from ESPN, persists odds history, and writes summary snapshots into mlb_live. Verified manually against live game 401814875."
  },
  {
    path: "/research/mlb/slate",
    worker: "mlb-research",
    source_mode: "external",
    verification_status: "verified",
    tables: [],
    notes: "Official MLB Stats API plus ESPN branding data, no mock fallback."
  },
  {
    path: "/research/mlb/team/:teamId",
    worker: "mlb-research",
    source_mode: "external",
    verification_status: "verified",
    tables: [],
    notes: "Official MLB Stats API plus ESPN team-brand metadata, no mock fallback."
  },
  {
    path: "/research/mlb/player/:playerId",
    worker: "mlb-research",
    source_mode: "external",
    verification_status: "verified",
    tables: [],
    notes: "Official MLB Stats API plus ESPN team-brand metadata, no mock fallback."
  },
  {
    path: "/mlb/qa",
    worker: "router",
    source_mode: "external_plus_mock",
    verification_status: "partial",
    tables: [],
    notes: "AI calls the live model path when configured and otherwise answers from a safe mock-slate fallback."
  }
];

export const DATA_HEALTH_TABLES = [
  "mlb_projections",
  "mlb_market_views",
  "mlb_lineups",
  "mlb_injuries",
  "mlb_live",
  "mlb_game_context",
  "mlb_calibration",
  "mlb_odds",
  "mlb_odds_history",
  "mlb_pregame_games",
  "mlb_pregame_teams",
  "mlb_pregame_venues",
  "mlb_pitcher_stats",
  "mlb_pitcher_splits",
  "mlb_statcast_previews",
  "mlb_game_odds_books",
  "mlb_game_odds_books_history",
  "mlb_gamecast_state",
  "mlb_gamecast_plays",
  "mlb_weather",
  "mlb_umpires",
  "mlb_parks",
  "mlb_bullpen"
] as const;

async function countTableRows(env: Env, table: string): Promise<number | null> {
  const row = await queryFirst<{ count: number }>(env, `SELECT COUNT(*) as count FROM ${table}`);
  return row ? Number(row.count || 0) : null;
}

export async function getDataHealthSnapshot(env: Env) {
  const tables = await Promise.all(
    DATA_HEALTH_TABLES.map(async (table) => ({
      table,
      rows: await countTableRows(env, table)
    }))
  );

  return {
    db_bound: Boolean(env.DB),
    tables,
    routes: ROUTE_AUDIT,
    summary: {
      verified_routes: ROUTE_AUDIT.filter((route) => route.verification_status === "verified").length,
      partial_routes: ROUTE_AUDIT.filter((route) => route.verification_status === "partial").length,
      blocked_routes: ROUTE_AUDIT.filter((route) => route.verification_status === "blocked").length,
      mock_only_routes: ROUTE_AUDIT.filter((route) => route.source_mode === "mock_only").map((route) => route.path)
    }
  };
}
