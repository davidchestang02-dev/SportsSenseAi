import { queryAll, queryFirst } from "../../shared/db";
import { getMockCalibration, getMockGameContexts, getMockLive, getMockSlate } from "../../shared/mockData";
import { jsonWithSourceMeta } from "../../shared/sourceMeta";
import type {
  CalibrationRow,
  Env,
  GameContextRow,
  LiveSnapshot,
  NormalizedGameTeam,
  NormalizedGamecast,
  NormalizedGamecastPlay,
  ProjectionRow,
  UnifiedGameOddsBook
} from "../../shared/types";
import { methodNotAllowed, parseDate, withError } from "../../shared/utils";
import { syncMlbScoreboardOdds } from "../../mlb-schedule/src/index";

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
const ESPN_BOXSCORE_URL = "https://cdn.espn.com/core/mlb/boxscore?xhr=1&gameId=";
const ESPN_CORE_PLAYS_URL = "https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/events";

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

function mapStatusState(value: string | null): "PRE" | "IN_PROGRESS" | "FINAL" {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "in") return "IN_PROGRESS";
  if (normalized === "post") return "FINAL";
  return "PRE";
}

function normalizeGamecastTeam(competitor: AnyRecord): NormalizedGameTeam {
  return {
    id: String(competitor?.id || ""),
    name: String(competitor?.displayName || competitor?.team?.displayName || competitor?.name || ""),
    abbreviation: String(competitor?.abbreviation || competitor?.team?.abbreviation || ""),
    record: stringOrNull(competitor?.record || competitor?.records?.[0]?.summary),
    score: numberOrNull(competitor?.score),
    logo: stringOrNull(competitor?.logo),
    logoDark: stringOrNull(competitor?.logoDark),
    color: stringOrNull(competitor?.color),
    alternateColor: stringOrNull(competitor?.alternateColor)
  };
}

async function fetchBoxscore(gameId: string): Promise<AnyRecord> {
  const response = await fetch(`${ESPN_BOXSCORE_URL}${gameId}`);
  if (!response.ok) {
    throw new Error(`ESPN boxscore request failed: ${response.status} for game ${gameId}`);
  }
  return (await response.json()) as AnyRecord;
}

async function fetchCorePlays(gameId: string, competitionId: string): Promise<AnyRecord> {
  const response = await fetch(`${ESPN_CORE_PLAYS_URL}/${gameId}/competitions/${competitionId}/plays`);
  if (!response.ok) {
    return { items: [] };
  }
  return (await response.json()) as AnyRecord;
}

async function loadUnifiedBooks(env: Env, gameId: string, date: string): Promise<UnifiedGameOddsBook[]> {
  const rows =
    (await queryAll<{
      book: string;
      source: string;
      home_team_abbr: string | null;
      away_team_abbr: string | null;
      moneyline_home: number | null;
      moneyline_away: number | null;
      spread_line: number | null;
      spread_home_odds: number | null;
      spread_away_odds: number | null;
      total_line: number | null;
      total_over_odds: number | null;
      total_under_odds: number | null;
      payload_json: string;
      updated_at: string | null;
    }>(
      env,
      "SELECT * FROM mlb_game_odds_books WHERE game_id = ? AND date = ? ORDER BY book",
      [gameId, date]
    )) || [];

  return rows.map((row) => ({
    book: row.book,
    source: row.source,
    updatedAt: row.updated_at,
    teams: {
      home: row.home_team_abbr,
      away: row.away_team_abbr
    },
    moneyline: {
      home: row.moneyline_home,
      away: row.moneyline_away
    },
    spread: {
      line: row.spread_line,
      homeOdds: row.spread_home_odds,
      awayOdds: row.spread_away_odds
    },
    total: {
      line: row.total_line,
      overOdds: row.total_over_odds,
      underOdds: row.total_under_odds
    },
    payload: row.payload_json ? (JSON.parse(row.payload_json) as Record<string, unknown>) : undefined
  }));
}

function mapScoreByInning(summary: AnyRecord): { away: Array<number | null>; home: Array<number | null> } {
  const linescore = summary?.boxscore?.teams || summary?.linescore?.teams || [];
  const away = Array.isArray(linescore?.[0]?.linescores) ? linescore[0].linescores : Array.isArray(summary?.linescore?.innings) ? summary.linescore.innings.map((inning: AnyRecord) => inning?.away?.runs) : [];
  const home = Array.isArray(linescore?.[1]?.linescores) ? linescore[1].linescores : Array.isArray(summary?.linescore?.innings) ? summary.linescore.innings.map((inning: AnyRecord) => inning?.home?.runs) : [];
  return {
    away: away.map((entry: AnyRecord) => numberOrNull(entry?.value ?? entry)),
    home: home.map((entry: AnyRecord) => numberOrNull(entry?.value ?? entry))
  };
}

function mapCorePlays(corePlays: AnyRecord): NormalizedGamecastPlay[] {
  const items = Array.isArray(corePlays?.items) ? corePlays.items : Array.isArray(corePlays?.plays) ? corePlays.plays : [];
  return items.slice(-25).map((play: AnyRecord, index: number) => {
    const participants = Array.isArray(play?.participants) ? play.participants : [];
    const batter = participants.find((entry: AnyRecord) => entry?.type === "batter");
    const pitcher = participants.find((entry: AnyRecord) => entry?.type === "pitcher");
    const runners = participants.filter((entry: AnyRecord) => entry?.type === "runner");
    return {
      id: String(play?.id || `play-${index}`),
      sequence: numberOrNull(play?.sequenceNumber) ?? index + 1,
      inning: numberOrNull(play?.period),
      half: stringOrNull(play?.periodType || play?.halfInning),
      outsBefore: numberOrNull(play?.start?.outs),
      outsAfter: numberOrNull(play?.end?.outs),
      ballsBefore: numberOrNull(play?.start?.balls),
      strikesBefore: numberOrNull(play?.start?.strikes),
      result: {
        type: stringOrNull(play?.type?.text || play?.type),
        description: stringOrNull(play?.text),
        rbi: numberOrNull(play?.rbi),
        runsScored: numberOrNull(play?.scoreValue)
      },
      runners: runners.map((runner: AnyRecord) => ({
        playerId: stringOrNull(runner?.athlete?.id),
        name: stringOrNull(runner?.athlete?.fullName),
        startBase: stringOrNull(runner?.startPosition),
        endBase: stringOrNull(runner?.endPosition),
        scored: Boolean(runner?.scoringPlay)
      })),
      winProbability: {
        home: numberOrNull(play?.probability?.homeWinPercentage),
        away: numberOrNull(play?.probability?.awayWinPercentage)
      },
      timestamp: stringOrNull(play?.wallclock || play?.clock?.displayValue),
      batter: batter
        ? { id: stringOrNull(batter?.athlete?.id), name: stringOrNull(batter?.athlete?.fullName) }
        : null,
      pitcher: pitcher
        ? { id: stringOrNull(pitcher?.athlete?.id), name: stringOrNull(pitcher?.athlete?.fullName) }
        : null
    };
  });
}

async function persistGamecast(env: Env, gamecast: NormalizedGamecast, date: string): Promise<void> {
  if (!env.DB) {
    return;
  }

  await env.DB.prepare(
    `INSERT OR REPLACE INTO mlb_gamecast_state (
      game_id, date, status_state, status_detail, period, half, outs, balls, strikes,
      home_score, away_score, payload_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      gamecast.gameId,
      date,
      gamecast.status.state,
      gamecast.status.detail,
      gamecast.status.progress.inning,
      gamecast.status.progress.half,
      gamecast.status.progress.outs,
      gamecast.status.progress.balls,
      gamecast.status.progress.strikes,
      gamecast.teams.home.score,
      gamecast.teams.away.score,
      JSON.stringify(gamecast),
      gamecast.meta.lastUpdated || new Date().toISOString()
    )
    .run();

  await env.DB.prepare("DELETE FROM mlb_gamecast_plays WHERE game_id = ?").bind(gamecast.gameId).run();
  for (const play of gamecast.plays) {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO mlb_gamecast_plays (
        game_id, play_id, sequence, inning, half, description, timestamp, payload_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        gamecast.gameId,
        play.id,
        play.sequence,
        play.inning,
        play.half,
        play.result.description,
        play.timestamp,
        JSON.stringify(play)
      )
      .run();
  }
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

async function buildGamecast(env: Env, gameId: string, date: string, refresh: boolean): Promise<NormalizedGamecast> {
  if (refresh) {
    await syncMlbScoreboardOdds(env, date, { gameIds: [gameId] });
  }

  const summary = await fetchSummary(gameId);
  const competition = getCompetition(summary);
  const competitionId = String(competition?.id || gameId);
  const [boxscore, corePlays, books] = await Promise.all([
    fetchBoxscore(gameId).catch(() => ({})),
    fetchCorePlays(gameId, competitionId).catch(() => ({ items: [] })),
    loadUnifiedBooks(env, gameId, date)
  ]);

  const competitors = Array.isArray(competition?.competitors) ? competition.competitors : [];
  const away = competitors.find((entry: AnyRecord) => entry?.homeAway === "away") || {};
  const home = competitors.find((entry: AnyRecord) => entry?.homeAway === "home") || {};
  const situation = summary?.situation || {};
  const scoreByInning = mapScoreByInning(summary);
  const plays = mapCorePlays(corePlays);
  const boxscoreRoot = (boxscore as AnyRecord)?.gamepackageJSON?.boxscore || (boxscore as AnyRecord)?.boxscore || {};
  const boxscoreTeams = Array.isArray(boxscoreRoot?.teams) ? boxscoreRoot.teams : [];

  const gamecast: NormalizedGamecast = {
    gameId,
    league: "MLB",
    status: {
      state: mapStatusState(stringOrNull(competition?.status?.type?.state || summary?.status?.type?.state)),
      detail: stringOrNull(competition?.status?.type?.detail || summary?.status?.type?.detail) || "Status unavailable",
      progress: {
        inning: numberOrNull(competition?.status?.period || summary?.status?.period),
        half: stringOrNull(competition?.status?.periodPrefix || summary?.status?.periodPrefix),
        outs: numberOrNull(situation?.outs),
        balls: numberOrNull(situation?.balls),
        strikes: numberOrNull(situation?.strikes),
        pitchCount: numberOrNull(situation?.pitcher?.pitchCount)
      }
    },
    teams: {
      away: normalizeGamecastTeam(away),
      home: normalizeGamecastTeam(home)
    },
    scoreByInning,
    situation: {
      inning: numberOrNull(competition?.status?.period || summary?.status?.period),
      half: stringOrNull(competition?.status?.periodPrefix || summary?.status?.periodPrefix),
      outs: numberOrNull(situation?.outs),
      balls: numberOrNull(situation?.balls),
      strikes: numberOrNull(situation?.strikes),
      onBase: {
        first: Boolean(situation?.onFirst),
        second: Boolean(situation?.onSecond),
        third: Boolean(situation?.onThird)
      },
      description: stringOrNull(situation?.lastPlay?.text || competition?.status?.type?.detail)
    },
    currentMatchup: {
      batter: situation?.batter || null,
      pitcher: situation?.pitcher || null
    },
    plays,
    boxscore: {
      away: boxscoreTeams[0] || {},
      home: boxscoreTeams[1] || {}
    },
    odds: {
      books,
      preferredBook: books[0] || null
    },
    meta: {
      venue: stringOrNull(competition?.venue?.fullName || competition?.venue?.name),
      city: stringOrNull(competition?.venue?.address?.city),
      startTime: stringOrNull(competition?.date || summary?.header?.competitions?.[0]?.date),
      tv: Array.isArray(summary?.broadcasts) ? summary.broadcasts.map((entry: AnyRecord) => String(entry?.name || "")).filter(Boolean) : [],
      lastUpdated: new Date().toISOString()
    }
  };

  await persistGamecast(env, gamecast, date);
  return gamecast;
}

export async function handleGameContextRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed(env);
  }

  try {
    const url = new URL(request.url);
    const path = url.pathname;
    const date = parseDate(url.searchParams.get("date"));

    const gamecastMatch = path.match(/^\/games\/mlb\/([^/]+)\/gamecast$/);
    if (gamecastMatch) {
      const gamecast = await buildGamecast(env, gamecastMatch[1], date, url.searchParams.get("refresh") === "1");
      return jsonWithSourceMeta(
        request,
        { date, gameId: gamecastMatch[1], data: gamecast },
        {
          route: "/games/mlb/:gameId/gamecast",
          source: "external_plus_db",
          tables: ["mlb_gamecast_state", "mlb_gamecast_plays", "mlb_game_odds_books", "mlb_live"],
          notes: "Normalized MLB Gamecast object built from ESPN summary, boxscore, plays, and persisted book odds, then written to D1.",
          breakdown: {
            plays: gamecast.plays.length,
            books: gamecast.odds.books.length
          }
        },
        200,
        env
      );
    }

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
      const gamecast = await buildGamecast(env, gameId, date, refresh).catch(() => null);
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
          gamecast,
          polling: MLB_LIVE_SYNC_PROFILE,
          sync: sync ? sync.games[0] || null : null
        },
        {
          route: "/live/mlb",
          source,
          tables: ["mlb_live"],
          notes:
            source === "external_plus_db"
              ? "Live snapshot was refreshed from ESPN summary, persisted into D1, and paired with a richer normalized Gamecast object."
              : source === "db"
                ? "Live snapshot and recent pitch events resolved from D1."
                : "Returned seeded live snapshot because no D1 live events were available.",
          breakdown: {
            recent_events: recentEvents.length,
            pitch_types: pitchTypeMix.length,
            refreshed_from_espn: refresh,
            has_gamecast: Boolean(gamecast)
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
