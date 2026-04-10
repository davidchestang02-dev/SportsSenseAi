import { queryAll, queryFirst } from "../../shared/db";
import { getMockCalibration, getMockGameContexts, getMockLive, getMockSlate } from "../../shared/mockData";
import { jsonWithSourceMeta } from "../../shared/sourceMeta";
import type { CalibrationRow, Env, GameContextRow, LiveSnapshot, ProjectionRow } from "../../shared/types";
import { methodNotAllowed, parseDate, withError } from "../../shared/utils";

type AnyRecord = Record<string, any>;

type LiveEventRow = {
  timestamp: string;
  inning: number;
  inning_half: string;
  outs: number;
  balls: number;
  strikes: number;
  home_score: number;
  away_score: number;
  pitch_type: string | null;
  pitch_speed: number | null;
  call: string | null;
  is_in_play: number | null;
};

type LiveSyncSnapshot = {
  timestamp: string;
  game_id: string;
  inning: number;
  inning_half: string;
  outs: number;
  balls: number;
  strikes: number;
  home_score: number;
  away_score: number;
  pitcher_id: number | null;
  batter_id: number | null;
  pitch_type: string | null;
  pitch_speed: number | null;
  call: string | null;
  is_in_play: number | null;
  status: string | null;
  detail: string | null;
  last_play_id: string | null;
  last_play_text: string | null;
};

const ESPN_SUMMARY_URL = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=";

export const MLB_LIVE_SYNC_PROFILE = {
  platform: {
    scheduler: "Cloudflare Cron Triggers",
    minimum_interval_seconds: 60,
    note: "Cron runs on one-minute granularity. Sub-minute live-betting refresh stays at the app and API layer."
  },
  implemented_now: {
    manual_route: "/admin/mlb/live-sync",
    app: {
      live_schedule_refresh_ms: 60000,
      live_snapshot_refresh_ms: 60000,
      recent_final_refresh_ms: 120000,
      pregame_daily_sync_at_et: "11:00",
      pregame_prelock_sync_minutes_before_start: 60,
      final_archive_sync_at_et: "03:00"
    }
  },
  configured_cron_target: {
    expression: "*/1 * * * *",
    status: "active_in_production",
    note:
      "Production cron is attached on one-minute granularity, but the expensive scoreboard sync only runs during baseball ops windows. Staging intentionally runs without a cron."
  },
  server_phase_rules: {
    live: {
      sync_every_minutes: 1,
      scope: "Persist scoreboard odds and refresh mlb_live summary snapshots for in-progress games."
    },
    pregame_daily: {
      sync_at_et: "11:00",
      scope: "Daily pregame scoreboard refresh for the upcoming board."
    },
    pregame_prelock: {
      sync_at_relative_minutes: 60,
      scope: "One-hour-to-first-pitch validation pass for scheduled matchups."
    },
    recent_final: {
      sync_window_minutes: 2,
      scope: "Immediate postgame capture for matchups that were actively tracked live."
    },
    final_archive: {
      sync_at_et: "03:00",
      scope: "Overnight final-state sweep for machine-learning and archival workflows."
    }
  },
  target_profile: {
    play_by_play_ms: 5000,
    summary_ms: 10000,
    odds_ms: 30000,
    boxscore_ms: 60000
  }
} as const;

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim().replace(/[+,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

async function fetchSummary(gameId: string): Promise<AnyRecord> {
  const response = await fetch(`${ESPN_SUMMARY_URL}${gameId}`, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`ESPN summary request failed: ${response.status} for game ${gameId}`);
  }

  return (await response.json()) as AnyRecord;
}

function getCompetition(summary: AnyRecord): AnyRecord {
  return summary?.header?.competitions?.[0] || summary?.competitions?.[0] || {};
}

function getLatestPlay(summary: AnyRecord): AnyRecord {
  if (Array.isArray(summary?.plays) && summary.plays.length > 0) {
    return summary.plays[summary.plays.length - 1] || {};
  }

  return summary?.situation?.lastPlay || {};
}

function getParticipantId(play: AnyRecord, type: string): number | null {
  const participant = Array.isArray(play?.participants)
    ? play.participants.find((entry: AnyRecord) => entry?.type === type)
    : null;
  return numberOrNull(participant?.athlete?.id);
}

function getInningHalf(summary: AnyRecord, play: AnyRecord): string {
  const fromPlay = stringOrNull(play?.period?.type);
  if (fromPlay) {
    return fromPlay;
  }

  const detail = stringOrNull(getCompetition(summary)?.status?.type?.detail || summary?.status?.type?.detail);
  if (!detail) {
    return "Unknown";
  }

  const lower = detail.toLowerCase();
  if (lower.startsWith("top")) return "Top";
  if (lower.startsWith("bottom")) return "Bottom";
  if (lower.startsWith("mid")) return "Mid";
  if (lower.startsWith("end")) return "End";
  return detail.split(" ")[0] || "Unknown";
}

function getScore(summary: AnyRecord, homeAway: "home" | "away"): number {
  const competition = getCompetition(summary);
  const competitor = Array.isArray(competition?.competitors)
    ? competition.competitors.find((entry: AnyRecord) => entry?.homeAway === homeAway)
    : null;
  return numberOrNull(competitor?.score) ?? 0;
}

function normalizeLiveSnapshot(gameId: string, summary: AnyRecord): LiveSyncSnapshot {
  const competition = getCompetition(summary);
  const play = getLatestPlay(summary);
  const situation = summary?.situation || {};

  return {
    timestamp: stringOrNull(play?.wallclock) || stringOrNull(summary?.meta?.lastUpdatedAt) || new Date().toISOString(),
    game_id: gameId,
    inning: numberOrNull(play?.period?.number ?? competition?.status?.period ?? summary?.status?.period) ?? 0,
    inning_half: getInningHalf(summary, play),
    outs: numberOrNull(situation?.outs ?? play?.outs) ?? 0,
    balls: numberOrNull(situation?.balls ?? play?.resultCount?.balls ?? play?.pitchCount?.balls) ?? 0,
    strikes: numberOrNull(situation?.strikes ?? play?.resultCount?.strikes ?? play?.pitchCount?.strikes) ?? 0,
    home_score: getScore(summary, "home"),
    away_score: getScore(summary, "away"),
    pitcher_id: numberOrNull(situation?.pitcher?.playerId) ?? getParticipantId(play, "pitcher"),
    batter_id: numberOrNull(situation?.batter?.playerId) ?? getParticipantId(play, "batter"),
    pitch_type: stringOrNull(play?.pitchType?.abbreviation || play?.pitchType?.text),
    pitch_speed: numberOrNull(play?.pitchVelocity),
    call: stringOrNull(play?.type?.text || play?.text),
    is_in_play:
      typeof play?.isInPlay === "boolean"
        ? play.isInPlay
          ? 1
          : 0
        : typeof play?.summaryType === "string"
          ? play.summaryType === "P"
            ? 0
            : 1
          : null,
    status: stringOrNull(competition?.status?.type?.state || summary?.status?.type?.state),
    detail: stringOrNull(competition?.status?.type?.detail || summary?.status?.type?.detail),
    last_play_id: stringOrNull(play?.id),
    last_play_text: stringOrNull(play?.text)
  };
}

async function insertLiveSnapshot(env: Env, snapshot: LiveSyncSnapshot): Promise<boolean> {
  if (!env.DB) {
    return false;
  }

  const result = await env.DB.prepare(
    `INSERT INTO mlb_live (
      timestamp, game_id, inning, inning_half, outs, balls, strikes, home_score, away_score,
      pitcher_id, batter_id, pitch_type, pitch_speed, call, is_in_play, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      snapshot.timestamp,
      snapshot.game_id,
      snapshot.inning,
      snapshot.inning_half,
      snapshot.outs,
      snapshot.balls,
      snapshot.strikes,
      snapshot.home_score,
      snapshot.away_score,
      snapshot.pitcher_id,
      snapshot.batter_id,
      snapshot.pitch_type,
      snapshot.pitch_speed,
      snapshot.call,
      snapshot.is_in_play,
      snapshot.timestamp
    )
    .run();

  return Boolean(result.success);
}

export async function syncMlbLiveGames(env: Env, gameIds: string[]) {
  const uniqueGameIds = [...new Set(gameIds.filter(Boolean))];
  const games = await Promise.all(
    uniqueGameIds.map(async (gameId) => {
      try {
        const summary = await fetchSummary(gameId);
        const snapshot = normalizeLiveSnapshot(gameId, summary);
        const inserted = await insertLiveSnapshot(env, snapshot);

        return {
          game_id: gameId,
          synced: true,
          inserted,
          snapshot
        };
      } catch (error) {
        return {
          game_id: gameId,
          synced: false,
          inserted: false,
          error: error instanceof Error ? error.message : "Unknown sync error"
        };
      }
    })
  );

  return {
    synced_at: new Date().toISOString(),
    inserted: games.filter((game) => game.inserted).length,
    games
  };
}

export async function handleGameContextRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed(env);
  }

  try {
    const url = new URL(request.url);
    const path = url.pathname;
    const date = parseDate(url.searchParams.get("date"));

    if (path.startsWith("/game/mlb/")) {
      const gameId = path.split("/").pop() || "";
      const rows =
        (await queryAll<ProjectionRow>(
          env,
          "SELECT * FROM mlb_projections WHERE game_id = ? ORDER BY type, compositeScore DESC",
          [gameId]
        )) || [];
      const source = rows.length > 0 ? "db" : "mock";
      return jsonWithSourceMeta(
        request,
        rows.length > 0 ? rows : getMockSlate(date).filter((row) => row.game_id === gameId),
        {
          route: "/game/mlb/:gameId",
          source,
          tables: ["mlb_projections"],
          notes: source === "db" ? "Game projection rows resolved from D1." : "Returned seeded game rows."
        },
        200,
        env
      );
    }

    if (path.startsWith("/player/mlb/")) {
      const playerId = Number(path.split("/").pop());
      const row =
        (await queryFirst<ProjectionRow>(
          env,
          "SELECT * FROM mlb_projections WHERE player_id = ? ORDER BY date DESC LIMIT 1",
          [playerId]
        )) || null;
      const source = row ? "db" : "mock";
      return jsonWithSourceMeta(
        request,
        row || getMockSlate(date).find((item) => item.player_id === playerId) || null,
        {
          route: "/player/mlb/:playerId",
          source,
          tables: ["mlb_projections"],
          notes: source === "db" ? "Latest player projection resolved from D1." : "Returned seeded player row."
        },
        200,
        env
      );
    }

    if (path.startsWith("/live/mlb")) {
      const gameId = url.searchParams.get("game_id") || "401700001";
      const refresh = url.searchParams.get("refresh") === "1";
      const sync = refresh ? await syncMlbLiveGames(env, [gameId]) : null;
      const snapshot =
        (await queryFirst<LiveSnapshot>(
          env,
          "SELECT game_id, inning, inning_half, home_score, away_score, 0.5 as win_probability_home, created_at as last_update, outs, balls, strikes FROM mlb_live WHERE game_id = ? ORDER BY created_at DESC LIMIT 1",
          [gameId]
        )) || null;
      const recentEvents =
        (await queryAll<LiveEventRow>(
          env,
          "SELECT timestamp, inning, inning_half, outs, balls, strikes, home_score, away_score, pitch_type, pitch_speed, call, is_in_play FROM mlb_live WHERE game_id = ? ORDER BY created_at DESC LIMIT 12",
          [gameId]
        )) || [];
      const pitchTypeMix = Object.values(
        recentEvents.reduce<Record<string, { pitch_type: string; count: number; avg_speed: number; total_speed: number }>>(
          (accumulator, event) => {
            const key = event.pitch_type || "Unknown";
            const current = accumulator[key] || { pitch_type: key, count: 0, avg_speed: 0, total_speed: 0 };
            current.count += 1;
            current.total_speed += Number(event.pitch_speed || 0);
            current.avg_speed = current.total_speed / current.count;
            accumulator[key] = current;
            return accumulator;
          },
          {}
        )
      ).map((item) => ({
        pitch_type: item.pitch_type,
        count: item.count,
        avg_speed: Number(item.avg_speed.toFixed(1))
      }));
      const source = snapshot || recentEvents.length > 0 ? (refresh ? "external_plus_db" : "db") : "mock";
      return jsonWithSourceMeta(
        request,
        {
          game_id: gameId,
          snapshot: snapshot || getMockLive(gameId),
          recent_events: recentEvents,
          pitch_type_mix: pitchTypeMix,
          polling: MLB_LIVE_SYNC_PROFILE,
          sync: sync ? sync.games[0] || null : null
        },
        {
          route: "/live/mlb",
          source,
          tables: ["mlb_live"],
          notes:
            source === "external_plus_db"
              ? "Live snapshot was refreshed from ESPN summary, persisted into D1, and then re-read from mlb_live."
              : source === "db"
                ? "Live snapshot and recent pitch events resolved from D1."
                : "Returned seeded live snapshot because no D1 live events were available.",
          breakdown: {
            recent_events: recentEvents.length,
            pitch_types: pitchTypeMix.length,
            refreshed_from_espn: refresh
          }
        },
        200,
        env
      );
    }

    if (path.startsWith("/admin/mlb/health-data")) {
      const rows =
        (await queryAll<CalibrationRow>(
          env,
          "SELECT date, prop_type, bucket, proj_avg, actual_avg, count FROM mlb_calibration ORDER BY date DESC, prop_type, bucket LIMIT 100"
        )) || [];
      const source = rows.length > 0 ? "db" : "mock";
      return jsonWithSourceMeta(
        request,
        rows.length > 0 ? rows : getMockCalibration(date),
        {
          route: "/admin/mlb/health-data",
          source,
          tables: ["mlb_calibration"],
          notes: source === "db" ? "Calibration rows resolved from D1." : "Returned seeded calibration curve."
        },
        200,
        env
      );
    }

    const rows =
      (await queryAll<GameContextRow>(
        env,
        "SELECT date, game_id, away_team, away_team_id, home_team, home_team_id, weather_desc, temp, wind, park_name, park_factor, umpire_name, run_environment, bullpen_edge, confidence FROM mlb_game_context WHERE date = ? ORDER BY confidence DESC",
        [date]
      )) || [];

    const source = rows.length > 0 ? "db" : "mock";
    return jsonWithSourceMeta(
      request,
      rows.length > 0 ? rows : getMockGameContexts(date),
      {
        route: "/game-context/mlb",
        source,
        tables: ["mlb_game_context"],
        notes: source === "db" ? "Game context rows resolved from D1." : "Returned seeded game context."
      },
      200,
      env
    );
  } catch (error) {
    return withError(error, env);
  }
}
