import { execute, queryAll, queryFirst } from "../../shared/db";
import { syncRotowireSlateSupport } from "../../shared/rotowireLineups";
import { jsonWithSourceMeta } from "../../shared/sourceMeta";
import type {
  Env,
  NormalizedGameOdds,
  NormalizedGameStream,
  NormalizedGameTeam,
  NormalizedPregameGame,
  NormalizedWeatherGame,
  StatcastPreview
} from "../../shared/types";
import { json, methodNotAllowed, parseDate, withError } from "../../shared/utils";
import { syncMlbScoreboardOdds } from "../../mlb-schedule/src/index";

type AnyRecord = Record<string, any>;

const ESPN_SITE_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard";
const SAVANT_SCHEDULE_URL = "https://baseballsavant.mlb.com/schedule";
const SAVANT_PREVIEW_URL = "https://baseballsavant.mlb.com/savant/api/v1/game/preview";

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

function getScoreboardEvents(scoreboard: AnyRecord): AnyRecord[] {
  if (Array.isArray(scoreboard?.events)) {
    return scoreboard.events;
  }
  return Array.isArray(scoreboard?.sports?.[0]?.leagues?.[0]?.events) ? scoreboard.sports[0].leagues[0].events : [];
}

async function fetchJson<T = AnyRecord>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} for ${url}`);
  }

  return (await response.json()) as T;
}

async function fetchScoreboardForDate(date: string): Promise<AnyRecord> {
  return fetchJson<AnyRecord>(`${ESPN_SITE_SCOREBOARD_URL}?dates=${date.replace(/-/g, "")}`);
}

function buildEventMap(events: AnyRecord[]): Map<string, AnyRecord> {
  return new Map(events.map((event) => [String(event?.id || event?.competitionId || ""), event]));
}

function probablePitcherFromCompetitor(competitor: AnyRecord) {
  const summary = Array.isArray(competitor?.summaryAthletes)
    ? competitor.summaryAthletes.find((entry: AnyRecord) => String(entry?.type || "").includes("PITCHER"))
    : null;
  const athlete = summary?.athlete || competitor?.probablePitcher || null;
  const id = stringOrNull(athlete?.id || athlete?.playerId);
  const name = stringOrNull(athlete?.displayName || athlete?.fullName || athlete?.shortName);
  const headshot = stringOrNull(athlete?.headshot);

  if (!id && !name) {
    return null;
  }

  return { id, name, headshot };
}

function parsePregameGame(baseGame: {
  league: "MLB";
  gameId: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "FINAL" | "UNKNOWN";
  startTime: string | null;
  summary: string | null;
  period: number | null;
  location: string | null;
  teams: { home: NormalizedGameTeam; away: NormalizedGameTeam };
  odds: NormalizedGameOdds | null;
  stream: NormalizedGameStream;
}, rawEvent: AnyRecord): NormalizedPregameGame {
  const competitors = Array.isArray(rawEvent?.competitors)
    ? rawEvent.competitors
    : Array.isArray(rawEvent?.competitions?.[0]?.competitors)
      ? rawEvent.competitions[0].competitors
      : [];
  const home = competitors.find((competitor: AnyRecord) => competitor?.homeAway === "home") || {};
  const away = competitors.find((competitor: AnyRecord) => competitor?.homeAway === "away") || {};

  return {
    ...baseGame,
    season: typeof rawEvent?.season === "number" ? rawEvent.season : null,
    seasonType: stringOrNull(rawEvent?.seasonType),
    venue: {
      name: stringOrNull(rawEvent?.location || rawEvent?.venue?.fullName || rawEvent?.competitions?.[0]?.venue?.fullName),
      city: stringOrNull(rawEvent?.venue?.address?.city || rawEvent?.competitions?.[0]?.venue?.address?.city),
      state: stringOrNull(rawEvent?.venue?.address?.state || rawEvent?.competitions?.[0]?.venue?.address?.state)
    },
    probablePitchers: {
      home: probablePitcherFromCompetitor(home),
      away: probablePitcherFromCompetitor(away)
    },
    updatedAt: new Date().toISOString(),
    payload: rawEvent
  };
}

async function persistPregameGame(env: Env, date: string, game: NormalizedPregameGame): Promise<void> {
  const persistedGame = await execute(
    env,
    `INSERT OR REPLACE INTO mlb_pregame_games (
      date, game_id, league, start_time, status, summary, season, season_type,
      venue_name, venue_city, venue_state,
      probable_home_pitcher_id, probable_home_pitcher_name, probable_home_pitcher_headshot,
      probable_away_pitcher_id, probable_away_pitcher_name, probable_away_pitcher_headshot,
      odds_json, stream_json, payload_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      date,
      game.gameId,
      game.league,
      game.startTime,
      game.status,
      game.summary,
      game.season,
      game.seasonType,
      game.venue.name,
      game.venue.city,
      game.venue.state,
      game.probablePitchers.home?.id,
      game.probablePitchers.home?.name,
      game.probablePitchers.home?.headshot,
      game.probablePitchers.away?.id,
      game.probablePitchers.away?.name,
      game.probablePitchers.away?.headshot,
      JSON.stringify(game.odds || null),
      JSON.stringify(game.stream || null),
      JSON.stringify(game.payload || {}),
      game.updatedAt || new Date().toISOString()
    ]
  );
  if (!persistedGame) {
    throw new Error(`Failed to persist pregame game ${game.gameId}`);
  }

  for (const entry of [
    { side: "home", team: game.teams.home },
    { side: "away", team: game.teams.away }
  ]) {
    const persistedTeam = await execute(
      env,
      `INSERT OR REPLACE INTO mlb_pregame_teams (
        date, game_id, side, team_id, abbreviation, display_name, record_summary,
        logo, logo_dark, color, alternate_color, score, payload_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        date,
        game.gameId,
        entry.side,
        entry.team.id,
        entry.team.abbreviation,
        entry.team.name,
        entry.team.record,
        entry.team.logo,
        entry.team.logoDark,
        entry.team.color,
        entry.team.alternateColor,
        entry.team.score,
        JSON.stringify(entry.team),
        game.updatedAt || new Date().toISOString()
      ]
    );
    if (!persistedTeam) {
      throw new Error(`Failed to persist pregame ${entry.side} team for ${game.gameId}`);
    }
  }

  const persistedVenue = await execute(
    env,
    `INSERT OR REPLACE INTO mlb_pregame_venues (
      date, game_id, venue_name, city, state, roof_type, payload_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      date,
      game.gameId,
      game.venue.name,
      game.venue.city,
      game.venue.state,
      "unknown",
      JSON.stringify(game.venue),
      game.updatedAt || new Date().toISOString()
    ]
  );
  if (!persistedVenue) {
    throw new Error(`Failed to persist pregame venue for ${game.gameId}`);
  }
}

async function loadPregameGames(env: Env, date: string): Promise<NormalizedPregameGame[]> {
  const gameRows =
    (await queryAll<{
      game_id: string;
      league: "MLB";
      start_time: string | null;
      status: "SCHEDULED" | "IN_PROGRESS" | "FINAL" | "UNKNOWN";
      summary: string | null;
      season: number | null;
      season_type: string | null;
      venue_name: string | null;
      venue_city: string | null;
      venue_state: string | null;
      probable_home_pitcher_id: string | null;
      probable_home_pitcher_name: string | null;
      probable_home_pitcher_headshot: string | null;
      probable_away_pitcher_id: string | null;
      probable_away_pitcher_name: string | null;
      probable_away_pitcher_headshot: string | null;
      odds_json: string | null;
      stream_json: string | null;
      payload_json: string;
      updated_at: string;
    }>(env, "SELECT * FROM mlb_pregame_games WHERE date = ? ORDER BY start_time, game_id", [date])) || [];

  const teamRows =
    (await queryAll<{ game_id: string; side: string; payload_json: string }>(
      env,
      "SELECT game_id, side, payload_json FROM mlb_pregame_teams WHERE date = ?",
      [date]
    )) || [];

  const teamsByGame = teamRows.reduce<Record<string, Record<string, NormalizedGameTeam>>>((accumulator, row) => {
    const existing = accumulator[row.game_id] || {};
    existing[row.side] = JSON.parse(row.payload_json) as NormalizedGameTeam;
    accumulator[row.game_id] = existing;
    return accumulator;
  }, {});

  return gameRows.map((row) => ({
    league: "MLB",
    gameId: row.game_id,
    status: row.status,
    startTime: row.start_time,
    summary: row.summary,
    period: null,
    location: row.venue_name,
    teams: {
      home: teamsByGame[row.game_id]?.home || {
        id: "",
        name: "",
        abbreviation: "",
        score: null,
        record: null,
        logo: null,
        logoDark: null,
        color: null,
        alternateColor: null
      },
      away: teamsByGame[row.game_id]?.away || {
        id: "",
        name: "",
        abbreviation: "",
        score: null,
        record: null,
        logo: null,
        logoDark: null,
        color: null,
        alternateColor: null
      }
    },
    odds: row.odds_json ? (JSON.parse(row.odds_json) as NormalizedGameOdds) : null,
    stream: row.stream_json
      ? (JSON.parse(row.stream_json) as NormalizedGameStream)
      : {
          isLive: false,
          isReplayAvailable: false,
          requires: { espnPlus: false, cableLogin: false },
          links: { web: null, mobile: null },
          broadcasts: []
        },
    season: row.season,
    seasonType: row.season_type,
    venue: {
      name: row.venue_name,
      city: row.venue_city,
      state: row.venue_state
    },
    probablePitchers: {
      home: row.probable_home_pitcher_id || row.probable_home_pitcher_name
        ? {
            id: row.probable_home_pitcher_id,
            name: row.probable_home_pitcher_name,
            headshot: row.probable_home_pitcher_headshot
          }
        : null,
      away: row.probable_away_pitcher_id || row.probable_away_pitcher_name
        ? {
            id: row.probable_away_pitcher_id,
            name: row.probable_away_pitcher_name,
            headshot: row.probable_away_pitcher_headshot
          }
        : null
    },
    updatedAt: row.updated_at,
    payload: row.payload_json ? (JSON.parse(row.payload_json) as Record<string, unknown>) : undefined
  }));
}

export async function syncPregameSlate(env: Env, date: string): Promise<NormalizedPregameGame[]> {
  const sync = await syncMlbScoreboardOdds(env, date);
  const scoreboard = await fetchScoreboardForDate(date);
  const eventMap = buildEventMap(getScoreboardEvents(scoreboard));
  const games = sync.discoveredGames.map((game) => parsePregameGame(game, eventMap.get(game.gameId) || {}));

  await Promise.all(games.map((game) => persistPregameGame(env, date, game)));
  return games;
}

async function ensurePregameSlate(env: Env, date: string, refresh: boolean): Promise<NormalizedPregameGame[]> {
  const existing = refresh ? [] : await loadPregameGames(env, date);
  if (existing.length > 0) {
    return existing;
  }
  return syncPregameSlate(env, date);
}

function teamAlias(value: string | null): string {
  const normalized = String(value || "").trim().toUpperCase();
  const aliases: Record<string, string> = {
    AZ: "ARI",
    ARZ: "ARI",
    KCR: "KC",
    WAS: "WSH",
    WSN: "WSH",
    SDP: "SD",
    CWS: "CHW",
    TBR: "TB",
    SFG: "SF"
  };
  return aliases[normalized] || normalized;
}

function formatSavantDate(date: string): string {
  const [year, month, day] = date.split("-").map((value) => Number(value));
  return `${year}-${month}-${day}`;
}

function arrayOfRecords(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value.filter((entry) => entry && typeof entry === "object") as AnyRecord[] : [];
}

function extractScheduleTeamAbbreviation(scheduleRow: AnyRecord, side: "home" | "away"): string | null {
  const team = scheduleRow?.teams?.[side]?.team || {};
  return teamAlias(
    stringOrNull(
      team?.abbreviation ||
        team?.teamCode ||
        team?.fileCode ||
        scheduleRow?.[`${side}_team`] ||
        scheduleRow?.[`${side}Team`]
    )
  );
}

async function fetchSavantSchedule(date: string): Promise<AnyRecord[]> {
  const payload = await fetchJson<AnyRecord>(`${SAVANT_SCHEDULE_URL}?date=${formatSavantDate(date)}&format=json`);
  if (Array.isArray(payload)) {
    return payload;
  }

  const directSchedule = arrayOfRecords(payload?.schedule);
  if (directSchedule.length > 0) {
    return directSchedule;
  }

  const datedGames = arrayOfRecords(payload?.schedule?.dates || payload?.dates).flatMap((entry) => arrayOfRecords(entry?.games));
  return datedGames;
}

async function fetchSavantPreview(gamePk: number): Promise<AnyRecord> {
  return fetchJson<AnyRecord>(`${SAVANT_PREVIEW_URL}?game_pk=${gamePk}`);
}

function matchPregameGame(scheduleRow: AnyRecord, games: NormalizedPregameGame[]): NormalizedPregameGame | null {
  const home = extractScheduleTeamAbbreviation(scheduleRow, "home");
  const away = extractScheduleTeamAbbreviation(scheduleRow, "away");
  return (
    games.find(
      (game) => teamAlias(game.teams.home.abbreviation) === home && teamAlias(game.teams.away.abbreviation) === away
    ) || null
  );
}

function normalizeFallbackStatcastPitcher(row: AnyRecord | null, team: string) {
  if (!row) {
    return null;
  }

  return {
    playerId: numberOrNull(row?.id || row?.player_id || row?.playerId),
    name: String(row?.fullName || row?.player_name || row?.playerName || row?.name || "Unknown pitcher"),
    team,
    throws: stringOrNull(row?.pitchHand?.description || row?.pitchHand?.code || row?.throws || row?.pitch_hand),
    ip: null,
    xERA: null,
    xwOBA: null,
    kPct: null,
    bbPct: null,
    barrelPctAllowed: null,
    avgEVAllowed: null,
    pitchMix: {}
  };
}

function normalizeStatcastScheduleFallback(scheduleRow: AnyRecord, game: NormalizedPregameGame, fallbackDate: string): StatcastPreview {
  const homeTeam = game.teams.home.abbreviation || game.teams.home.name;
  const awayTeam = game.teams.away.abbreviation || game.teams.away.name;

  return {
    gameId: game.gameId,
    gamePk: numberOrNull(scheduleRow?.gamePk || scheduleRow?.game_pk),
    date: stringOrNull(scheduleRow?.officialDate || scheduleRow?.gameDate || scheduleRow?.date) || fallbackDate,
    homeTeam,
    awayTeam,
    hittersHome: [],
    hittersAway: [],
    pitcherHome: normalizeFallbackStatcastPitcher(scheduleRow?.teams?.home?.probablePitcher || null, homeTeam),
    pitcherAway: normalizeFallbackStatcastPitcher(scheduleRow?.teams?.away?.probablePitcher || null, awayTeam),
    raw: {
      source: "savant_schedule_fallback",
      schedule: scheduleRow
    }
  };
}

function normalizeStatcastPreview(raw: AnyRecord, gameId: string, fallbackDate: string, homeTeam: string, awayTeam: string): StatcastPreview {
  const hittersHome = arrayOfRecords(raw?.hitters_home || raw?.home_hitters || raw?.hitters?.home).map((row) => ({
    playerId: numberOrNull(row?.player_id || row?.playerId),
    name: String(row?.player_name || row?.playerName || row?.name || "Unknown hitter"),
    team: homeTeam,
    bats: stringOrNull(row?.bats || row?.bat_side),
    pa: numberOrNull(row?.pa),
    xwOBA: numberOrNull(row?.xwoba || row?.xwOBA),
    xBA: numberOrNull(row?.xba || row?.xBA),
    xSLG: numberOrNull(row?.xslg || row?.xSLG),
    hardHitPct: numberOrNull(row?.hard_hit_percent || row?.hardHitPct),
    avgEV: numberOrNull(row?.avg_ev || row?.avgEV),
    avgLA: numberOrNull(row?.avg_la || row?.avgLA),
    barrelPct: numberOrNull(row?.barrel_percent || row?.barrelPct)
  }));
  const hittersAway = arrayOfRecords(raw?.hitters_away || raw?.away_hitters || raw?.hitters?.away).map((row) => ({
    playerId: numberOrNull(row?.player_id || row?.playerId),
    name: String(row?.player_name || row?.playerName || row?.name || "Unknown hitter"),
    team: awayTeam,
    bats: stringOrNull(row?.bats || row?.bat_side),
    pa: numberOrNull(row?.pa),
    xwOBA: numberOrNull(row?.xwoba || row?.xwOBA),
    xBA: numberOrNull(row?.xba || row?.xBA),
    xSLG: numberOrNull(row?.xslg || row?.xSLG),
    hardHitPct: numberOrNull(row?.hard_hit_percent || row?.hardHitPct),
    avgEV: numberOrNull(row?.avg_ev || row?.avgEV),
    avgLA: numberOrNull(row?.avg_la || row?.avgLA),
    barrelPct: numberOrNull(row?.barrel_percent || row?.barrelPct)
  }));
  const normalizePitcher = (row: AnyRecord | null, team: string) =>
    row
      ? {
          playerId: numberOrNull(row?.player_id || row?.playerId),
          name: String(row?.player_name || row?.playerName || row?.name || "Unknown pitcher"),
          team,
          throws: stringOrNull(row?.throws || row?.pitch_hand),
          ip: numberOrNull(row?.ip),
          xERA: numberOrNull(row?.xera || row?.xERA),
          xwOBA: numberOrNull(row?.xwoba || row?.xwOBA),
          kPct: numberOrNull(row?.k_percent || row?.kPct),
          bbPct: numberOrNull(row?.bb_percent || row?.bbPct),
          barrelPctAllowed: numberOrNull(row?.barrel_percent_allowed || row?.barrelPctAllowed),
          avgEVAllowed: numberOrNull(row?.avg_ev_allowed || row?.avgEVAllowed),
          pitchMix: arrayOfRecords(row?.pitch_mix || row?.pitchMix || row?.pitch_arsenal).reduce<Record<string, number>>((accumulator, entry) => {
            const key = stringOrNull(entry?.pitch_type || entry?.pitchType || entry?.name);
            const value = numberOrNull(entry?.usage_percent || entry?.usage || entry?.value);
            if (key && value !== null) {
              accumulator[key] = value;
            }
            return accumulator;
          }, {})
        }
      : null;
  const homePitcherRaw = (raw?.pitcher_home || raw?.home_pitcher || raw?.pitchers?.home || null) as AnyRecord | null;
  const awayPitcherRaw = (raw?.pitcher_away || raw?.away_pitcher || raw?.pitchers?.away || null) as AnyRecord | null;

  return {
    gameId,
    gamePk: numberOrNull(raw?.game_pk || raw?.gamePk),
    date: stringOrNull(raw?.game_date || raw?.date) || fallbackDate,
    homeTeam: stringOrNull(raw?.home_team || raw?.homeTeam) || homeTeam,
    awayTeam: stringOrNull(raw?.away_team || raw?.awayTeam) || awayTeam,
    hittersHome,
    hittersAway,
    pitcherHome: normalizePitcher(homePitcherRaw, homeTeam),
    pitcherAway: normalizePitcher(awayPitcherRaw, awayTeam),
    raw
  };
}

async function persistStatcastPreview(env: Env, preview: StatcastPreview): Promise<void> {
  const persistedPreview = await execute(
    env,
    `INSERT OR REPLACE INTO mlb_statcast_previews (
      game_id, game_pk, date, home_team, away_team, summary, preview_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      preview.gameId,
      preview.gamePk,
      preview.date,
      preview.homeTeam,
      preview.awayTeam,
      `${preview.awayTeam} @ ${preview.homeTeam}`,
      JSON.stringify(preview),
      new Date().toISOString()
    ]
  );
  if (!persistedPreview) {
    throw new Error(`Failed to persist Statcast preview for ${preview.gameId}`);
  }
}

async function ensureStatcastPreviews(env: Env, date: string, refresh: boolean): Promise<StatcastPreview[]> {
  const existing =
    refresh
      ? []
      : ((await queryAll<{ preview_json: string }>(env, "SELECT preview_json FROM mlb_statcast_previews WHERE date = ?", [date])) || []).map(
          (row) => JSON.parse(row.preview_json) as StatcastPreview
        );
  if (existing.length > 0) {
    return existing;
  }

  const games = await ensurePregameSlate(env, date, refresh);
  const schedule = await fetchSavantSchedule(date);
  const previews: StatcastPreview[] = [];

  for (const scheduleRow of schedule) {
    const game = matchPregameGame(scheduleRow, games);
    const gamePk = numberOrNull(scheduleRow?.game_pk || scheduleRow?.gamePk);
    if (!game || gamePk === null) {
      continue;
    }

    try {
      const preview = await fetchSavantPreview(gamePk)
        .then((rawPreview) =>
          normalizeStatcastPreview(
            rawPreview,
            game.gameId,
            date,
            game.teams.home.abbreviation || game.teams.home.name,
            game.teams.away.abbreviation || game.teams.away.name
          )
        )
        .catch(() => normalizeStatcastScheduleFallback(scheduleRow, game, date));
      await persistStatcastPreview(env, preview);
      previews.push(preview);
    } catch {
      // Ignore preview gaps for now and keep the remaining slate moving.
    }
  }

  return previews;
}

async function buildWeatherGames(env: Env, date: string, refresh: boolean): Promise<NormalizedWeatherGame[]> {
  const games = await ensurePregameSlate(env, date, refresh);
  const contexts =
    (await queryAll<{
      game_id: string;
      weather_desc: string | null;
      temp: number | null;
      wind: number | null;
      park_name: string | null;
      run_environment: number | null;
      confidence: number | null;
    }>(
      env,
      `SELECT game_id, weather_desc, temp, wind, park_name, run_environment, confidence
       FROM mlb_game_context
       WHERE date = ?`,
      [date]
    )) || [];
  let weatherRows =
    (await queryAll<{
      game_id: string;
      temp: number | null;
      humidity: number | null;
      wind_speed: number | null;
      wind_dir: number | null;
      hr_boost: number | null;
      run_boost: number | null;
    }>(
      env,
      `SELECT game_id, temp, humidity, wind_speed, wind_dir, hr_boost, run_boost
       FROM mlb_weather
       WHERE date = ?`,
      [date]
    )) || [];
  let rotowireSupport = null;
  if (refresh || weatherRows.length === 0) {
    rotowireSupport = await syncRotowireSlateSupport(env, date, games).catch(() => null);
    if (rotowireSupport && rotowireSupport.weatherRows.length > 0) {
      weatherRows = rotowireSupport.weatherRows.map((row) => ({
        game_id: row.gameId,
        temp: row.temp,
        humidity: null,
        wind_speed: row.windSpeed,
        wind_dir: row.windDir,
        hr_boost: null,
        run_boost: null
      }));
    }
  }
  const contextByGame = new Map(contexts.map((row) => [row.game_id, row]));
  const weatherByGame = new Map(weatherRows.map((row) => [row.game_id, row]));
  const rotowireWeatherByGame = new Map((rotowireSupport?.weatherRows || []).map((row) => [row.gameId, row]));

  return games.map((game) => {
    const context = contextByGame.get(game.gameId) || null;
    const weather = weatherByGame.get(game.gameId) || null;
    const rotowireWeather = rotowireWeatherByGame.get(game.gameId) || null;
    const wind = weather?.wind_speed ?? context?.wind ?? null;
    const desc = context?.weather_desc || rotowireWeather?.conditions || null;
    const stoplight =
      String(desc || "").toLowerCase().includes("storm") ? "red"
      : String(desc || "").toLowerCase().includes("rain") ? "orange"
      : (wind || 0) >= 18 ? "yellow"
      : "green";
    return {
      gameId: game.gameId,
      date,
      awayTeam: game.teams.away.abbreviation || game.teams.away.name,
      homeTeam: game.teams.home.abbreviation || game.teams.home.name,
      park: context?.park_name || game.venue.name,
      city: game.venue.city,
      state: game.venue.state,
      firstPitchLocal: game.startTime,
      isDome: Boolean(rotowireWeather?.isDome),
      roofStatus: rotowireWeather?.isDome ? "closed" : "unknown",
      stoplight,
      environment: {
        runEnvIndex: context?.run_environment ?? weather?.run_boost ?? null,
        hrEnvIndex: weather?.hr_boost ?? null,
        evBoostPct: weather?.hr_boost ?? null,
        babipBoostPct: context?.confidence ?? null
      },
      hourly: [
        {
          timeLabel: "Game window",
          tempF: weather?.temp ?? context?.temp ?? null,
          conditions: desc,
          windSpeed: wind,
          windDirDeg: weather?.wind_dir ?? null,
          precipProb: rotowireWeather?.precipProb ?? null,
          cloudCover: weather?.humidity ?? null,
          source: weather
            ? rotowireSupport?.weatherRows.some((entry) => entry.gameId === game.gameId)
              ? "rotowire_daily_lineups"
              : "mlb_weather"
            : "mlb_game_context"
        }
      ]
    };
  });
}

export async function handlePregameRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return methodNotAllowed(env);
  }

  try {
    const url = new URL(request.url);
    const path = url.pathname;
    const date = parseDate(url.searchParams.get("date"));
    const refresh = request.method === "POST" || url.searchParams.get("refresh") === "1";

    if (path === "/pregame/mlb" || path === "/admin/mlb/pregame-sync") {
      const games = await ensurePregameSlate(env, date, refresh);
      return jsonWithSourceMeta(
        request,
        { date, games },
        {
          route: path === "/admin/mlb/pregame-sync" ? path : "/pregame/mlb",
          source: "external_plus_db",
          tables: ["mlb_pregame_games", "mlb_pregame_teams", "mlb_pregame_venues"],
          notes:
            path === "/admin/mlb/pregame-sync"
              ? "Manual MLB pregame slate sync from the ESPN scoreboard into D1."
              : "Pregame slate is served from D1 and refreshed from the ESPN scoreboard when requested or missing.",
          breakdown: { games: games.length, refreshed: refresh }
        },
        200,
        env
      );
    }

    if (path === "/weather/mlb") {
      const games = await buildWeatherGames(env, date, refresh);
      return jsonWithSourceMeta(
        request,
        { date, games },
        {
          route: "/weather/mlb",
          source: "external_plus_db",
          tables: ["mlb_pregame_games", "mlb_game_context", "mlb_weather", "mlb_statcast_previews"],
          notes: "Weather research surface built from persisted pregame, context, and weather tables.",
          breakdown: { games: games.length }
        },
        200,
        env
      );
    }

    if (path === "/admin/mlb/statcast-sync") {
      const previews = await ensureStatcastPreviews(env, date, true);
      return jsonWithSourceMeta(
        request,
        { date, count: previews.length, previews },
        {
          route: "/admin/mlb/statcast-sync",
          source: "external_plus_db",
          tables: ["mlb_statcast_previews", "mlb_pregame_games"],
          notes: "Manual Baseball Savant Statcast preview sync for the resolved MLB slate.",
          breakdown: { previews: previews.length }
        },
        200,
        env
      );
    }

    const previewMatch = path.match(/^\/games\/mlb\/([^/]+)\/preview$/);
    if (previewMatch) {
      const games = await ensurePregameSlate(env, date, refresh);
      const game = games.find((entry) => entry.gameId === previewMatch[1]) || null;
      if (!game) {
        return json({ error: "Game preview not found" }, 404, env);
      }

      const previews = await ensureStatcastPreviews(env, date, refresh);
      const preview = previews.find((entry) => entry.gameId === previewMatch[1]) || null;
      const context =
        (await queryFirst<Record<string, unknown>>(
          env,
          `SELECT date, game_id, away_team, away_team_id, home_team, home_team_id, weather_desc, temp, wind,
                  park_name, park_factor, umpire_name, run_environment, bullpen_edge, confidence
           FROM mlb_game_context
           WHERE date = ? AND game_id = ?
           LIMIT 1`,
          [date, previewMatch[1]]
        )) || null;
      const weather = (await buildWeatherGames(env, date, false)).find((entry) => entry.gameId === previewMatch[1]) || null;

      return jsonWithSourceMeta(
        request,
        { date, gameId: previewMatch[1], data: { game, preview, context, weather } },
        {
          route: "/games/mlb/:gameId/preview",
          source: "external_plus_db",
          tables: ["mlb_pregame_games", "mlb_statcast_previews", "mlb_game_context", "mlb_weather"],
          notes: "Joined MLB preview surface combining persisted ESPN pregame slate, Statcast preview, game context, and weather.",
          breakdown: { has_statcast_preview: Boolean(preview), refreshed: refresh }
        },
        200,
        env
      );
    }

    return json({ error: "Pregame route not found" }, 404, env);
  } catch (error) {
    return withError(error, env);
  }
}
