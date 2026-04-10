import { execute, queryAll, queryFirst } from "../../shared/db";
import { jsonWithSourceMeta } from "../../shared/sourceMeta";
import type { Env, NormalizedBookProvider, NormalizedGameOdds, NormalizedGameStream, NormalizedGameTeam, NormalizedScheduledGame } from "../../shared/types";
import { methodNotAllowed, parseDate, withError } from "../../shared/utils";

type AnyRecord = Record<string, any>;

const ESPN_PERSONALIZED_SCOREBOARD_URL =
  "https://site.web.api.espn.com/apis/personalized/v2/scoreboard/header?sport=baseball&league=mlb&region=us&lang=en&contentorigin=espn&configuration=STREAM_MENU&platform=web&features=sfb-all%2Ccutl&buyWindow=1m&showAirings=buy%2Clive%2Creplay&showZipLookup=true&tz=America%2FNew_York&postalCode=27332&playabilitySource=playbackId";
const ESPN_SITE_SCOREBOARD_URL = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard";

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
    const normalized = value.trim();
    if (normalized.length === 0 || /^OFF$/i.test(normalized)) {
      return null;
    }

    const parsed = Number(normalized.replace(/[+,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseLine(value: unknown): number | null {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(/^o|^u/gi, "");
    return numberOrNull(normalized);
  }

  return null;
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = numberOrNull(value);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function mapGameStatus(value: unknown): "SCHEDULED" | "IN_PROGRESS" | "FINAL" | "UNKNOWN" {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "pre") return "SCHEDULED";
  if (normalized === "in") return "IN_PROGRESS";
  if (normalized === "post") return "FINAL";
  return "UNKNOWN";
}

function getScoreboardEvents(scoreboard: AnyRecord): AnyRecord[] {
  if (Array.isArray(scoreboard?.events)) {
    return scoreboard.events;
  }

  return Array.isArray(scoreboard?.sports?.[0]?.leagues?.[0]?.events) ? scoreboard.sports[0].leagues[0].events : [];
}

function getCompetitors(event: AnyRecord): { home: AnyRecord; away: AnyRecord } {
  const competitors = Array.isArray(event?.competitions?.[0]?.competitors)
    ? event.competitions[0].competitors
    : Array.isArray(event?.competitors)
      ? event.competitors
      : [];

  return {
    home: competitors.find((competitor: AnyRecord) => competitor?.homeAway === "home") || {},
    away: competitors.find((competitor: AnyRecord) => competitor?.homeAway === "away") || {}
  };
}

function buildGameRoute(subresource: string): string {
  return subresource ? `/games/mlb/:gameId/${subresource}` : "/games/mlb/:gameId";
}

function parseHistoryLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 24;
  }

  return Math.min(Math.floor(parsed), 96);
}

function isUpcomingWithinMinutes(startTime: string | null, now: Date, minutes: number): boolean {
  if (!startTime) {
    return false;
  }

  const firstPitch = new Date(startTime);
  if (Number.isNaN(firstPitch.getTime())) {
    return false;
  }

  const deltaMinutes = (firstPitch.getTime() - now.getTime()) / (60 * 1000);
  return deltaMinutes >= 0 && deltaMinutes <= minutes;
}

function isLiveOpsEligible(game: NormalizedScheduledGame, now: Date): boolean {
  if (game.status === "IN_PROGRESS") {
    return true;
  }

  return game.status === "SCHEDULED" && isUpcomingWithinMinutes(game.startTime, now, 60);
}

function normalizeTeam(competitor: AnyRecord): NormalizedGameTeam {
  return {
    id: stringOrNull(competitor?.id) || "",
    name: stringOrNull(competitor?.displayName || competitor?.team?.displayName || competitor?.name) || "",
    abbreviation: stringOrNull(competitor?.abbreviation || competitor?.team?.abbreviation) || "",
    score: numberOrNull(competitor?.score),
    record: stringOrNull(competitor?.record) || null,
    logo: stringOrNull(competitor?.logo) || null,
    logoDark: stringOrNull(competitor?.logoDark) || null,
    color: stringOrNull(competitor?.color) || null,
    alternateColor: stringOrNull(competitor?.alternateColor) || null
  };
}

function normalizeProvider(odds: AnyRecord): NormalizedBookProvider | null {
  const provider = odds?.provider;
  if (!provider) {
    return null;
  }

  const logos = Array.isArray(provider?.logos) ? provider.logos : [];
  const deepLink = Array.isArray(odds?.links)
    ? stringOrNull(odds.links.find((link: AnyRecord) => Array.isArray(link?.rel) && link.rel.includes("bets"))?.href)
    : null;

  return {
    name: stringOrNull(provider?.name) || "Unknown",
    id: stringOrNull(provider?.id),
    logo: {
      light: stringOrNull(logos.find((logo: AnyRecord) => Array.isArray(logo?.rel) && logo.rel.includes("light"))?.href),
      dark: stringOrNull(logos.find((logo: AnyRecord) => Array.isArray(logo?.rel) && logo.rel.includes("dark"))?.href)
    },
    deepLink
  };
}

function normalizeOdds(event: AnyRecord): NormalizedGameOdds | null {
  const competition = Array.isArray(event?.competitions) ? event.competitions[0] : null;
  const rawOdds = Array.isArray(competition?.odds) ? competition.odds[0] : competition?.odds || event?.odds;

  if (!rawOdds) {
    return null;
  }

  const { home, away } = getCompetitors(event);
  const homeAbbr = stringOrNull(home?.abbreviation);
  const awayAbbr = stringOrNull(away?.abbreviation);

  return {
    gameId: stringOrNull(event?.id || competition?.id) || "",
    provider: normalizeProvider(rawOdds),
    moneyline: {
      home: {
        open: numberOrNull(rawOdds?.moneyline?.home?.open?.odds),
        close: numberOrNull(rawOdds?.moneyline?.home?.close?.odds),
        current: numberOrNull(rawOdds?.moneyline?.home?.current?.odds) ?? numberOrNull(rawOdds?.home?.moneyLine),
        isFavorite: Boolean(rawOdds?.homeTeamOdds?.favorite),
        isUnderdog: Boolean(rawOdds?.homeTeamOdds?.underdog)
      },
      away: {
        open: numberOrNull(rawOdds?.moneyline?.away?.open?.odds),
        close: numberOrNull(rawOdds?.moneyline?.away?.close?.odds),
        current: numberOrNull(rawOdds?.moneyline?.away?.current?.odds) ?? numberOrNull(rawOdds?.away?.moneyLine),
        isFavorite: Boolean(rawOdds?.awayTeamOdds?.favorite),
        isUnderdog: Boolean(rawOdds?.awayTeamOdds?.underdog)
      }
    },
    spread: {
      home: {
        open: {
          line: parseLine(rawOdds?.pointSpread?.home?.open?.line),
          odds: numberOrNull(rawOdds?.pointSpread?.home?.open?.odds)
        },
        close: {
          line: parseLine(rawOdds?.pointSpread?.home?.close?.line),
          odds: numberOrNull(rawOdds?.pointSpread?.home?.close?.odds)
        },
        current: {
          line: parseLine(rawOdds?.pointSpread?.home?.current?.line),
          odds: numberOrNull(rawOdds?.pointSpread?.home?.current?.odds)
        }
      },
      away: {
        open: {
          line: parseLine(rawOdds?.pointSpread?.away?.open?.line),
          odds: numberOrNull(rawOdds?.pointSpread?.away?.open?.odds)
        },
        close: {
          line: parseLine(rawOdds?.pointSpread?.away?.close?.line),
          odds: numberOrNull(rawOdds?.pointSpread?.away?.close?.odds)
        },
        current: {
          line: parseLine(rawOdds?.pointSpread?.away?.current?.line),
          odds: numberOrNull(rawOdds?.pointSpread?.away?.current?.odds)
        }
      }
    },
    total: {
      over: {
        open: {
          line: parseLine(rawOdds?.total?.over?.open?.line),
          odds: numberOrNull(rawOdds?.total?.over?.open?.odds)
        },
        close: {
          line: parseLine(rawOdds?.total?.over?.close?.line),
          odds: numberOrNull(rawOdds?.total?.over?.close?.odds)
        },
        current: {
          line: parseLine(rawOdds?.total?.over?.current?.line),
          odds: numberOrNull(rawOdds?.total?.over?.current?.odds) ?? numberOrNull(rawOdds?.overOdds)
        }
      },
      under: {
        open: {
          line: parseLine(rawOdds?.total?.under?.open?.line),
          odds: numberOrNull(rawOdds?.total?.under?.open?.odds)
        },
        close: {
          line: parseLine(rawOdds?.total?.under?.close?.line),
          odds: numberOrNull(rawOdds?.total?.under?.close?.odds)
        },
        current: {
          line: parseLine(rawOdds?.total?.under?.current?.line),
          odds: numberOrNull(rawOdds?.total?.under?.current?.odds) ?? numberOrNull(rawOdds?.underOdds)
        }
      }
    },
    favorite: rawOdds?.homeTeamOdds?.favorite ? homeAbbr : rawOdds?.awayTeamOdds?.favorite ? awayAbbr : null,
    underdog: rawOdds?.homeTeamOdds?.underdog ? homeAbbr : rawOdds?.awayTeamOdds?.underdog ? awayAbbr : null,
    lastUpdated: stringOrNull(rawOdds?.lastUpdated)
  };
}

function normalizeStream(event: AnyRecord): NormalizedGameStream {
  const broadcasts = Array.isArray(event?.broadcasts) ? event.broadcasts : [];
  const watchLink = stringOrNull(event?.watch?.style?.link);
  const eventLink = Array.isArray(event?.links)
    ? stringOrNull(event.links.find((link: AnyRecord) => Array.isArray(link?.rel) && link.rel.includes("event"))?.href)
    : null;
  const mobileLink = Array.isArray(event?.appLinks)
    ? stringOrNull(event.appLinks.find((link: AnyRecord) => Array.isArray(link?.rel) && link.rel.includes("app"))?.href)
    : null;

  return {
    isLive: mapGameStatus(event?.fullStatus?.type?.state || event?.status) === "IN_PROGRESS",
    isReplayAvailable: Boolean(event?.video),
    requires: {
      espnPlus: Boolean(event?.onDisneyNetwork || watchLink?.includes("watch.product.api.espn.com")),
      cableLogin: false
    },
    links: {
      web: watchLink || eventLink,
      mobile: mobileLink
    },
    broadcasts: broadcasts.map((broadcast: AnyRecord) => ({
      name: stringOrNull(broadcast?.name) || "Unknown",
      type: stringOrNull(broadcast?.type) || "Unknown",
      isNational: Boolean(broadcast?.isNational),
      slug: stringOrNull(broadcast?.slug)
    }))
  };
}

function normalizeGame(event: AnyRecord): NormalizedScheduledGame {
  const { home, away } = getCompetitors(event);
  return {
    league: "MLB",
    gameId: stringOrNull(event?.id || event?.competitionId) || "",
    status: mapGameStatus(event?.fullStatus?.type?.state || event?.status),
    startTime: stringOrNull(event?.date),
    summary: stringOrNull(event?.summary || event?.fullStatus?.type?.detail),
    period: numberOrNull(event?.period),
    location: stringOrNull(event?.location),
    teams: {
      home: normalizeTeam(home),
      away: normalizeTeam(away)
    },
    odds: normalizeOdds(event),
    stream: normalizeStream(event)
  };
}

export async function syncMlbScoreboardOdds(
  env: Env,
  date: string,
  options: {
    gameIds?: string[];
    liveOpsOnly?: boolean;
    now?: Date;
    shouldPersistGame?: (game: NormalizedScheduledGame) => boolean;
  } = {}
): Promise<{
  date: string;
  discoveredGames: NormalizedScheduledGame[];
  games: NormalizedScheduledGame[];
  liveGames: NormalizedScheduledGame[];
  oddsSnapshotsAttempted: number;
  oddsSnapshotsPersisted: number;
}> {
  const scoreboard = await fetchScoreboardForDate(date);
  const events = getScoreboardEvents(scoreboard);
  const discoveredGames = events.map((event: AnyRecord) => normalizeGame(event));
  const scopedGameIds = new Set((options.gameIds || []).filter(Boolean));
  const now = options.now || new Date();

  const games = discoveredGames.filter((game) => {
    if (scopedGameIds.size > 0 && !scopedGameIds.has(game.gameId)) {
      return false;
    }

    if (options.liveOpsOnly) {
      return isLiveOpsEligible(game, now);
    }

    if (options.shouldPersistGame && !options.shouldPersistGame(game)) {
      return false;
    }

    return true;
  });

  const persistedOdds = await Promise.all(games.map((game) => persistOddsSnapshot(env, date, game)));

  return {
    date,
    discoveredGames,
    games,
    liveGames: discoveredGames.filter((game) => game.status === "IN_PROGRESS"),
    oddsSnapshotsAttempted: games.filter((game) => Boolean(game.odds?.provider)).length,
    oddsSnapshotsPersisted: persistedOdds.filter(Boolean).length
  };
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
  const dates = date.replace(/-/g, "");

  try {
    return await fetchJson<AnyRecord>(`${ESPN_PERSONALIZED_SCOREBOARD_URL}&dates=${dates}`);
  } catch {
    return fetchJson<AnyRecord>(`${ESPN_SITE_SCOREBOARD_URL}?dates=${dates}`);
  }
}

function candidateDates(dateParam: string | null): string[] {
  if (dateParam) {
    return [parseDate(dateParam)];
  }

  const today = new Date();
  const oneDay = 24 * 60 * 60 * 1000;
  return [0, -1, 1].map((offset) => new Date(today.getTime() + offset * oneDay).toISOString().slice(0, 10));
}

async function findEvent(gameId: string, dateParam: string | null): Promise<{ date: string; event: AnyRecord | null }> {
  for (const date of candidateDates(dateParam)) {
    const scoreboard = await fetchScoreboardForDate(date);
    const events = getScoreboardEvents(scoreboard);
    const event = events.find((item: AnyRecord) => String(item?.id || item?.competitionId) === gameId) || null;
    if (event) {
      return { date, event };
    }
  }

  return { date: parseDate(dateParam), event: null };
}

async function getCurrentOddsRow(env: Env, gameId: string, date: string | null): Promise<AnyRecord | null> {
  const sql = date
    ? "SELECT * FROM mlb_odds WHERE game_id = ? AND date = ? ORDER BY rowid DESC LIMIT 1"
    : "SELECT * FROM mlb_odds WHERE game_id = ? ORDER BY rowid DESC LIMIT 1";
  const bindings = date ? [gameId, date] : [gameId];
  return queryFirst<AnyRecord>(env, sql, bindings);
}

async function getOddsHistoryRows(env: Env, gameId: string, date: string | null, limit: number): Promise<AnyRecord[]> {
  const sql = date
    ? "SELECT * FROM mlb_odds_history WHERE game_id = ? AND date = ? ORDER BY timestamp DESC LIMIT ?"
    : "SELECT * FROM mlb_odds_history WHERE game_id = ? ORDER BY timestamp DESC LIMIT ?";
  const bindings = date ? [gameId, date, limit] : [gameId, limit];
  const rows = (await queryAll<AnyRecord>(env, sql, bindings)) || [];
  return rows.reverse();
}

function providerFromRow(currentRow: AnyRecord | null, historyRow: AnyRecord | null): NormalizedBookProvider | null {
  const row = currentRow || historyRow;
  if (!row?.provider_name) {
    return null;
  }

  return {
    name: stringOrNull(row.provider_name) || "Unknown",
    id: stringOrNull(row.provider_id),
    logo: {
      light: stringOrNull(currentRow?.provider_logo_light),
      dark: stringOrNull(currentRow?.provider_logo_dark)
    },
    deepLink: stringOrNull(currentRow?.provider_deep_link)
  };
}

function historyPointFromRow(row: AnyRecord) {
  return {
    timestamp: stringOrNull(row.timestamp),
    moneyline: {
      home: pickNumber(row.moneyline_home_current, row.moneyline_home_close, row.moneyline_home_open),
      away: pickNumber(row.moneyline_away_current, row.moneyline_away_close, row.moneyline_away_open)
    },
    spread: {
      home: {
        line: pickNumber(row.spread_home_current_line, row.spread_home_close_line, row.spread_home_open_line),
        odds: pickNumber(row.spread_home_current_odds, row.spread_home_close_odds, row.spread_home_open_odds)
      },
      away: {
        line: pickNumber(row.spread_away_current_line, row.spread_away_close_line, row.spread_away_open_line),
        odds: pickNumber(row.spread_away_current_odds, row.spread_away_close_odds, row.spread_away_open_odds)
      }
    },
    total: {
      line: pickNumber(row.total_over_current_line, row.total_over_close_line, row.total_over_open_line),
      overOdds: pickNumber(row.total_over_current_odds, row.total_over_close_odds, row.total_over_open_odds),
      underOdds: pickNumber(row.total_under_current_odds, row.total_under_close_odds, row.total_under_open_odds)
    },
    favorite: stringOrNull(row.favorite),
    underdog: stringOrNull(row.underdog),
    lastUpdated: stringOrNull(row.last_updated)
  };
}

function movementValue(open: number | null, latest: number | null) {
  return {
    open,
    latest,
    delta: open !== null && latest !== null ? latest - open : null
  };
}

function movementPoint(
  openLine: number | null,
  latestLine: number | null,
  openOdds: number | null,
  latestOdds: number | null
) {
  return {
    open: {
      line: openLine,
      odds: openOdds
    },
    latest: {
      line: latestLine,
      odds: latestOdds
    },
    delta: {
      line: openLine !== null && latestLine !== null ? latestLine - openLine : null,
      odds: openOdds !== null && latestOdds !== null ? latestOdds - openOdds : null
    }
  };
}

async function loadOddsPersistenceState(
  env: Env,
  gameId: string,
  dateParam: string | null,
  limit: number
): Promise<{ date: string | null; currentRow: AnyRecord | null; historyRows: AnyRecord[]; refreshedFromScoreboard: boolean }> {
  let resolvedDate = dateParam ? parseDate(dateParam) : null;
  let [currentRow, historyRows] = await Promise.all([
    getCurrentOddsRow(env, gameId, resolvedDate),
    getOddsHistoryRows(env, gameId, resolvedDate, limit)
  ]);
  let refreshedFromScoreboard = false;

  if (!currentRow || historyRows.length === 0) {
    try {
      const { date, event } = await findEvent(gameId, dateParam);
      if (event) {
        const normalizedGame = normalizeGame(event);
        await persistOddsSnapshot(env, date, normalizedGame);
        refreshedFromScoreboard = true;
        if (!resolvedDate) {
          resolvedDate = date;
        }
        [currentRow, historyRows] = await Promise.all([
          getCurrentOddsRow(env, gameId, resolvedDate),
          getOddsHistoryRows(env, gameId, resolvedDate, limit)
        ]);
      }
    } catch {
      // Keep serving persisted rows when the live scoreboard cannot be refreshed.
    }
  }

  return {
    date: resolvedDate || stringOrNull(currentRow?.date) || stringOrNull(historyRows.at(-1)?.date),
    currentRow,
    historyRows,
    refreshedFromScoreboard
  };
}

function buildOddsHistoryPayload(gameId: string, date: string | null, currentRow: AnyRecord | null, historyRows: AnyRecord[]) {
  return {
    gameId,
    date,
    provider: providerFromRow(currentRow, historyRows.at(-1) || null),
    samples: historyRows.length,
    firstTimestamp: stringOrNull(historyRows[0]?.timestamp),
    latestTimestamp: stringOrNull(historyRows.at(-1)?.timestamp),
    points: historyRows.map((row) => historyPointFromRow(row))
  };
}

function buildOddsMovementPayload(gameId: string, date: string | null, currentRow: AnyRecord | null, historyRows: AnyRecord[]) {
  const firstRow = historyRows[0] || currentRow;
  const latestRow = currentRow || historyRows.at(-1) || firstRow;

  return {
    gameId,
    date,
    provider: providerFromRow(currentRow, latestRow || null),
    samples: historyRows.length,
    firstTimestamp: stringOrNull(firstRow?.timestamp),
    latestTimestamp: stringOrNull(historyRows.at(-1)?.timestamp) || stringOrNull(currentRow?.last_updated),
    moneyline: {
      home: movementValue(
        pickNumber(firstRow?.moneyline_home_open, firstRow?.moneyline_home_close, firstRow?.moneyline_home_current),
        pickNumber(latestRow?.moneyline_home_current, latestRow?.moneyline_home_close, latestRow?.moneyline_home_open)
      ),
      away: movementValue(
        pickNumber(firstRow?.moneyline_away_open, firstRow?.moneyline_away_close, firstRow?.moneyline_away_current),
        pickNumber(latestRow?.moneyline_away_current, latestRow?.moneyline_away_close, latestRow?.moneyline_away_open)
      )
    },
    spread: {
      home: movementPoint(
        pickNumber(firstRow?.spread_home_open_line, firstRow?.spread_home_close_line, firstRow?.spread_home_current_line),
        pickNumber(latestRow?.spread_home_current_line, latestRow?.spread_home_close_line, latestRow?.spread_home_open_line),
        pickNumber(firstRow?.spread_home_open_odds, firstRow?.spread_home_close_odds, firstRow?.spread_home_current_odds),
        pickNumber(latestRow?.spread_home_current_odds, latestRow?.spread_home_close_odds, latestRow?.spread_home_open_odds)
      ),
      away: movementPoint(
        pickNumber(firstRow?.spread_away_open_line, firstRow?.spread_away_close_line, firstRow?.spread_away_current_line),
        pickNumber(latestRow?.spread_away_current_line, latestRow?.spread_away_close_line, latestRow?.spread_away_open_line),
        pickNumber(firstRow?.spread_away_open_odds, firstRow?.spread_away_close_odds, firstRow?.spread_away_current_odds),
        pickNumber(latestRow?.spread_away_current_odds, latestRow?.spread_away_close_odds, latestRow?.spread_away_open_odds)
      )
    },
    total: {
      line: movementValue(
        pickNumber(firstRow?.total_over_open_line, firstRow?.total_over_close_line, firstRow?.total_over_current_line),
        pickNumber(latestRow?.total_over_current_line, latestRow?.total_over_close_line, latestRow?.total_over_open_line)
      ),
      overOdds: movementValue(
        pickNumber(firstRow?.total_over_open_odds, firstRow?.total_over_close_odds, firstRow?.total_over_current_odds),
        pickNumber(latestRow?.total_over_current_odds, latestRow?.total_over_close_odds, latestRow?.total_over_open_odds)
      ),
      underOdds: movementValue(
        pickNumber(firstRow?.total_under_open_odds, firstRow?.total_under_close_odds, firstRow?.total_under_current_odds),
        pickNumber(latestRow?.total_under_current_odds, latestRow?.total_under_close_odds, latestRow?.total_under_open_odds)
      )
    },
    favorite: {
      open: stringOrNull(firstRow?.favorite),
      latest: stringOrNull(latestRow?.favorite)
    },
    underdog: {
      open: stringOrNull(firstRow?.underdog),
      latest: stringOrNull(latestRow?.underdog)
    }
  };
}

async function persistOddsSnapshot(env: Env, date: string, game: NormalizedScheduledGame): Promise<boolean> {
  if (!game.odds || !game.odds.provider) {
    return false;
  }

  const odds = game.odds;
  const provider = game.odds.provider;
  const rawPayload = JSON.stringify(odds);
  const bestOdds =
    odds.moneyline.home.current ??
    odds.moneyline.away.current ??
    odds.total.over.current.odds ??
    odds.total.under.current.odds ??
    odds.spread.home.current.odds ??
    odds.spread.away.current.odds;

  const deleted = await execute(env, "DELETE FROM mlb_odds WHERE date = ? AND game_id = ? AND provider_name = ?", [
    date,
    game.gameId,
    provider.name
  ]);

  const currentSnapshotBindings = [
    date,
    game.gameId,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    provider.name,
    bestOdds,
    odds.lastUpdated,
    provider.name,
    provider.id,
    provider.logo.light,
    provider.logo.dark,
    provider.deepLink,
    game.teams.home.abbreviation,
    game.teams.away.abbreviation,
    odds.favorite,
    odds.underdog,
    odds.moneyline.home.open,
    odds.moneyline.home.close,
    odds.moneyline.home.current,
    odds.moneyline.away.open,
    odds.moneyline.away.close,
    odds.moneyline.away.current,
    odds.spread.home.open.line,
    odds.spread.home.open.odds,
    odds.spread.home.close.line,
    odds.spread.home.close.odds,
    odds.spread.home.current.line,
    odds.spread.home.current.odds,
    odds.spread.away.open.line,
    odds.spread.away.open.odds,
    odds.spread.away.close.line,
    odds.spread.away.close.odds,
    odds.spread.away.current.line,
    odds.spread.away.current.odds,
    odds.total.over.open.line,
    odds.total.over.open.odds,
    odds.total.over.close.line,
    odds.total.over.close.odds,
    odds.total.over.current.line,
    odds.total.over.current.odds,
    odds.total.under.open.line,
    odds.total.under.open.odds,
    odds.total.under.close.line,
    odds.total.under.close.odds,
    odds.total.under.current.line,
    odds.total.under.current.odds,
    rawPayload
  ];
  const inserted = await execute(
    env,
    `INSERT INTO mlb_odds (
      date, game_id, player_id, prop_type, dk, fd, mgm, czr, espn, best_book, best_odds, last_updated,
      provider_name, provider_id, provider_logo_light, provider_logo_dark, provider_deep_link,
      home_team_abbr, away_team_abbr, favorite, underdog,
      moneyline_home_open, moneyline_home_close, moneyline_home_current,
      moneyline_away_open, moneyline_away_close, moneyline_away_current,
      spread_home_open_line, spread_home_open_odds, spread_home_close_line, spread_home_close_odds, spread_home_current_line, spread_home_current_odds,
      spread_away_open_line, spread_away_open_odds, spread_away_close_line, spread_away_close_odds, spread_away_current_line, spread_away_current_odds,
      total_over_open_line, total_over_open_odds, total_over_close_line, total_over_close_odds, total_over_current_line, total_over_current_odds,
      total_under_open_line, total_under_open_odds, total_under_close_line, total_under_close_odds, total_under_current_line, total_under_current_odds,
      raw_payload
    ) VALUES (${currentSnapshotBindings.map(() => "?").join(", ")})`,
    currentSnapshotBindings
  );

  const historyBindings = [
    new Date().toISOString(),
    date,
    game.gameId,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    provider.name,
    provider.id,
    game.teams.home.abbreviation,
    game.teams.away.abbreviation,
    odds.favorite,
    odds.underdog,
    odds.moneyline.home.open,
    odds.moneyline.home.close,
    odds.moneyline.home.current,
    odds.moneyline.away.open,
    odds.moneyline.away.close,
    odds.moneyline.away.current,
    odds.spread.home.open.line,
    odds.spread.home.open.odds,
    odds.spread.home.close.line,
    odds.spread.home.close.odds,
    odds.spread.home.current.line,
    odds.spread.home.current.odds,
    odds.spread.away.open.line,
    odds.spread.away.open.odds,
    odds.spread.away.close.line,
    odds.spread.away.close.odds,
    odds.spread.away.current.line,
    odds.spread.away.current.odds,
    odds.total.over.open.line,
    odds.total.over.open.odds,
    odds.total.over.close.line,
    odds.total.over.close.odds,
    odds.total.over.current.line,
    odds.total.over.current.odds,
    odds.total.under.open.line,
    odds.total.under.open.odds,
    odds.total.under.close.line,
    odds.total.under.close.odds,
    odds.total.under.current.line,
    odds.total.under.current.odds,
    odds.lastUpdated,
    rawPayload
  ];
  const historyInserted = await execute(
    env,
    `INSERT INTO mlb_odds_history (
      timestamp, date, game_id, player_id, prop_type, dk, fd, mgm, czr, espn,
      provider_name, provider_id, home_team_abbr, away_team_abbr, favorite, underdog,
      moneyline_home_open, moneyline_home_close, moneyline_home_current,
      moneyline_away_open, moneyline_away_close, moneyline_away_current,
      spread_home_open_line, spread_home_open_odds, spread_home_close_line, spread_home_close_odds, spread_home_current_line, spread_home_current_odds,
      spread_away_open_line, spread_away_open_odds, spread_away_close_line, spread_away_close_odds, spread_away_current_line, spread_away_current_odds,
      total_over_open_line, total_over_open_odds, total_over_close_line, total_over_close_odds, total_over_current_line, total_over_current_odds,
      total_under_open_line, total_under_open_odds, total_under_close_line, total_under_close_odds, total_under_current_line, total_under_current_odds,
      last_updated, raw_payload
    ) VALUES (${historyBindings.map(() => "?").join(", ")})`,
    historyBindings
  );

  return deleted && inserted && historyInserted;
}

export async function handleScheduleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed(env);
  }

  try {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/games/mlb/")) {
      const segments = path.split("/").filter(Boolean);
      const gameId = segments[2] || "";
      const subresource = segments.slice(3).join("/");
      const route = buildGameRoute(subresource);

      if (subresource === "odds/history" || subresource === "odds/movement") {
        const limit = parseHistoryLimit(url.searchParams.get("limit"));
        const oddsState = await loadOddsPersistenceState(env, gameId, url.searchParams.get("date"), limit);

        if (!oddsState.currentRow && oddsState.historyRows.length === 0) {
          return jsonWithSourceMeta(
            request,
            { date: oddsState.date, gameId, error: "No persisted odds history was found for the requested game." },
            {
              route,
              source: "mlb_odds_history",
              tables: ["mlb_odds", "mlb_odds_history"],
              notes: "The requested gameId has no persisted odds rows yet."
            },
            404,
            env
          );
        }

        const payload =
          subresource === "odds/history"
            ? buildOddsHistoryPayload(gameId, oddsState.date, oddsState.currentRow, oddsState.historyRows)
            : buildOddsMovementPayload(gameId, oddsState.date, oddsState.currentRow, oddsState.historyRows);

        return jsonWithSourceMeta(
          request,
          { date: oddsState.date, gameId, data: payload },
          {
            route,
            source: oddsState.refreshedFromScoreboard ? "external_plus_db" : "mlb_odds_history",
            tables: ["mlb_odds", "mlb_odds_history"],
            notes:
              subresource === "odds/history"
                ? "Odds history is served from persisted D1 snapshots and refreshed from the ESPN scoreboard when the current window is available."
                : "Line movement is computed from persisted D1 odds snapshots and refreshed from the ESPN scoreboard when the current window is available.",
            breakdown: {
              samples: oddsState.historyRows.length,
              refreshed_from_scoreboard: oddsState.refreshedFromScoreboard
            }
          },
          200,
          env
        );
      }

      if (subresource !== "" && subresource !== "odds" && subresource !== "streams") {
        return jsonWithSourceMeta(
          request,
          { gameId, error: "Unknown game subresource." },
          {
            route,
            source: "router",
            tables: [],
            notes: "Unsupported MLB game subresource."
          },
          404,
          env
        );
      }

      const { date, event } = await findEvent(gameId, url.searchParams.get("date"));

      if (!event) {
        return jsonWithSourceMeta(
          request,
          { date, gameId, error: "Game not found on the requested scoreboard window." },
          {
            route,
            source: "espn_scoreboard",
            tables: [],
            notes: "The requested gameId was not found in the searched ESPN scoreboard windows."
          },
          404,
          env
        );
      }

      const normalizedGame = normalizeGame(event);
      const persisted = await persistOddsSnapshot(env, date, normalizedGame);
      const payload =
        subresource === "odds"
          ? normalizedGame.odds
          : subresource === "streams"
            ? normalizedGame.stream
            : normalizedGame;

      return jsonWithSourceMeta(
        request,
        { date, gameId, data: payload },
        {
          route,
          source: "espn_scoreboard",
          tables: ["mlb_odds", "mlb_odds_history"],
          notes:
            subresource === "odds"
              ? "Game odds were fetched from ESPN scoreboard competition odds and normalized into the SportsSenseAi odds schema."
              : subresource === "streams"
                ? "Game stream metadata was fetched from ESPN scoreboard watch and broadcast fields."
                : "Game detail was fetched from ESPN scoreboard and normalized into the SportsSenseAi game schema.",
          breakdown: {
            odds_snapshot_persisted: persisted
          }
        },
        200,
        env
      );
    }

    const date = parseDate(url.searchParams.get("date"));
    const sync = await syncMlbScoreboardOdds(env, date);

    return jsonWithSourceMeta(
      request,
      {
        date,
        games: sync.games,
        ingestion: {
          odds_snapshots_attempted: sync.oddsSnapshotsAttempted,
          odds_snapshots_persisted: sync.oddsSnapshotsPersisted
        }
      },
      {
        route: path,
        source: "espn_scoreboard",
        tables: ["mlb_odds", "mlb_odds_history"],
        notes: "Scoreboard slate, odds, and stream metadata fetched from ESPN and normalized into SportsSenseAi game objects.",
        breakdown: {
          games: sync.games.length,
          odds_snapshots_persisted: sync.oddsSnapshotsPersisted
        }
      },
      200,
      env
    );
  } catch (error) {
    return withError(error, env);
  }
}
