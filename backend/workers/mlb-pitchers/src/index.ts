import { queryAll, queryFirst } from "../../shared/db";
import { jsonWithSourceMeta } from "../../shared/sourceMeta";
import type { Env, NormalizedPitcherSplit, NormalizedPitcherStats } from "../../shared/types";
import { json, methodNotAllowed, parseDate, withError } from "../../shared/utils";

type AnyRecord = Record<string, any>;

const ESPN_STATS_PAGE =
  "https://www.espn.com/mlb/stats/player/_/view/pitching/table/pitching/sort/wins/dir/desc";
const ESPN_CORE_BASE = "https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb";
const ESPN_SITE_TEAMS = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams";

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

function round(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 1000) / 1000;
}

function pitcherModel(row: Record<string, unknown>) {
  const ip = numberOrNull(row.ip) || 0;
  const h = numberOrNull(row.h) || 0;
  const bb = numberOrNull(row.bb) || 0;
  const k = numberOrNull(row.k) || 0;
  const hr = numberOrNull(row.hr) || 0;
  const bf = ip * 3 + h + bb;
  return {
    kPct: bf > 0 ? round(k / bf) : null,
    bbPct: bf > 0 ? round(bb / bf) : null,
    fip: ip > 0 ? round((13 * hr + 3 * bb - 2 * k) / ip + 3.1) : null
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

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} for ${url}`);
  }
  return response.text();
}

function extractStatsPageJson(html: string): AnyRecord | null {
  const patterns = [/window\.__espn_stats\s*=\s*(\{[\s\S]*?\});/, /__espn_stats\s*=\s*(\{[\s\S]*?\});/];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      try {
        return JSON.parse(match[1]) as AnyRecord;
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function upsertPitcher(env: Env, season: number, row: Record<string, unknown>): Promise<void> {
  if (!env.DB) {
    return;
  }

  await env.DB.prepare(
    `INSERT INTO mlb_pitcher_stats (
      season, espn_player_id, name, team_id, team_abbr, team_name, pos, jersey, status, headshot_url, throws,
      gp, gs, qs, w, l, sv, hld, ip, h, er, hr, bb, k, era, whip, k9, bb9, hr9, kbb, war,
      splits_json, raw_json, scraped_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(season, espn_player_id) DO UPDATE SET
      name = COALESCE(excluded.name, mlb_pitcher_stats.name),
      team_id = COALESCE(excluded.team_id, mlb_pitcher_stats.team_id),
      team_abbr = COALESCE(excluded.team_abbr, mlb_pitcher_stats.team_abbr),
      team_name = COALESCE(excluded.team_name, mlb_pitcher_stats.team_name),
      pos = COALESCE(excluded.pos, mlb_pitcher_stats.pos),
      jersey = COALESCE(excluded.jersey, mlb_pitcher_stats.jersey),
      status = COALESCE(excluded.status, mlb_pitcher_stats.status),
      headshot_url = COALESCE(excluded.headshot_url, mlb_pitcher_stats.headshot_url),
      throws = COALESCE(excluded.throws, mlb_pitcher_stats.throws),
      gp = COALESCE(excluded.gp, mlb_pitcher_stats.gp),
      gs = COALESCE(excluded.gs, mlb_pitcher_stats.gs),
      qs = COALESCE(excluded.qs, mlb_pitcher_stats.qs),
      w = COALESCE(excluded.w, mlb_pitcher_stats.w),
      l = COALESCE(excluded.l, mlb_pitcher_stats.l),
      sv = COALESCE(excluded.sv, mlb_pitcher_stats.sv),
      hld = COALESCE(excluded.hld, mlb_pitcher_stats.hld),
      ip = COALESCE(excluded.ip, mlb_pitcher_stats.ip),
      h = COALESCE(excluded.h, mlb_pitcher_stats.h),
      er = COALESCE(excluded.er, mlb_pitcher_stats.er),
      hr = COALESCE(excluded.hr, mlb_pitcher_stats.hr),
      bb = COALESCE(excluded.bb, mlb_pitcher_stats.bb),
      k = COALESCE(excluded.k, mlb_pitcher_stats.k),
      era = COALESCE(excluded.era, mlb_pitcher_stats.era),
      whip = COALESCE(excluded.whip, mlb_pitcher_stats.whip),
      k9 = COALESCE(excluded.k9, mlb_pitcher_stats.k9),
      bb9 = COALESCE(excluded.bb9, mlb_pitcher_stats.bb9),
      hr9 = COALESCE(excluded.hr9, mlb_pitcher_stats.hr9),
      kbb = COALESCE(excluded.kbb, mlb_pitcher_stats.kbb),
      war = COALESCE(excluded.war, mlb_pitcher_stats.war),
      splits_json = COALESCE(excluded.splits_json, mlb_pitcher_stats.splits_json),
      raw_json = COALESCE(excluded.raw_json, mlb_pitcher_stats.raw_json),
      scraped_at = excluded.scraped_at`
  )
    .bind(
      season,
      row.espn_player_id,
      row.name,
      row.team_id,
      row.team_abbr,
      row.team_name,
      row.pos,
      row.jersey,
      row.status,
      row.headshot_url,
      row.throws,
      row.gp,
      row.gs,
      row.qs,
      row.w,
      row.l,
      row.sv,
      row.hld,
      row.ip,
      row.h,
      row.er,
      row.hr,
      row.bb,
      row.k,
      row.era,
      row.whip,
      row.k9,
      row.bb9,
      row.hr9,
      row.kbb,
      row.war,
      row.splits_json,
      row.raw_json,
      row.scraped_at
    )
    .run();
}

async function replacePitcherSplits(env: Env, season: number, playerId: string, splits: NormalizedPitcherSplit[]): Promise<void> {
  if (!env.DB) {
    return;
  }

  await env.DB.prepare("DELETE FROM mlb_pitcher_splits WHERE season = ? AND espn_player_id = ?").bind(season, playerId).run();
  for (const split of splits) {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO mlb_pitcher_splits (
        season, espn_player_id, split_code, split_label, gp, ip, h, er, hr, bb, k,
        era, whip, k9, bb9, hr9, kbb, split_json, scraped_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        season,
        playerId,
        split.splitCode,
        split.splitLabel,
        split.gp,
        split.ip,
        split.h,
        split.er,
        split.hr,
        split.bb,
        split.k,
        split.era,
        split.whip,
        split.k9,
        split.bb9,
        split.hr9,
        split.kbb,
        JSON.stringify(split.split),
        new Date().toISOString()
      )
      .run();
  }
}

async function ingestPitchersFromStatsPage(env: Env, season: number): Promise<number> {
  const payload = extractStatsPageJson(await fetchText(ESPN_STATS_PAGE));
  const players = Array.isArray(payload?.players) ? payload.players : [];
  for (const player of players) {
    const stats = player?.stats || {};
    await upsertPitcher(env, season, {
      espn_player_id: String(player?.id || ""),
      name: String(player?.name || "Unknown pitcher"),
      team_id: stringOrNull(player?.teamId),
      team_abbr: stringOrNull(player?.team),
      pos: stringOrNull(player?.pos) || "P",
      gp: numberOrNull(stats?.gp),
      gs: numberOrNull(stats?.gs),
      qs: numberOrNull(stats?.qs),
      w: numberOrNull(stats?.w),
      l: numberOrNull(stats?.l),
      sv: numberOrNull(stats?.sv),
      hld: numberOrNull(stats?.hld),
      ip: numberOrNull(stats?.ip),
      h: numberOrNull(stats?.h),
      er: numberOrNull(stats?.er),
      hr: numberOrNull(stats?.hr),
      bb: numberOrNull(stats?.bb),
      k: numberOrNull(stats?.k),
      era: numberOrNull(stats?.era),
      whip: numberOrNull(stats?.whip),
      k9: numberOrNull(stats?.k9),
      bb9: numberOrNull(stats?.bb9),
      hr9: numberOrNull(stats?.hr9),
      kbb: numberOrNull(stats?.kbb),
      war: numberOrNull(stats?.war),
      raw_json: JSON.stringify(player),
      scraped_at: new Date().toISOString()
    });
  }
  return players.length;
}

async function ingestPitcherSiteMetadata(env: Env, season: number): Promise<number> {
  const payload = await fetchJson<AnyRecord>(ESPN_SITE_TEAMS);
  const teams = Array.isArray(payload?.sports?.[0]?.leagues?.[0]?.teams) ? payload.sports[0].leagues[0].teams : [];
  let count = 0;

  for (const entry of teams) {
    const team = entry?.team;
    const teamId = stringOrNull(team?.id);
    if (!teamId) continue;
    const roster = await fetchJson<AnyRecord>(`https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/${teamId}/roster`);
    const athletes = Array.isArray(roster?.athletes) ? roster.athletes.flatMap((group: AnyRecord) => group?.items || []) : Array.isArray(roster?.athletes?.items) ? roster.athletes.items : [];
    for (const athlete of athletes) {
      const position = String(athlete?.position?.abbreviation || athlete?.position?.name || "");
      if (!position.includes("P")) continue;
      count += 1;
      await upsertPitcher(env, season, {
        espn_player_id: String(athlete?.id || ""),
        name: String(athlete?.fullName || athlete?.displayName || "Unknown pitcher"),
        team_id: teamId,
        team_abbr: stringOrNull(team?.abbreviation),
        team_name: stringOrNull(team?.displayName),
        pos: stringOrNull(athlete?.position?.abbreviation) || "P",
        jersey: stringOrNull(athlete?.jersey),
        status: stringOrNull(athlete?.status?.type || athlete?.status?.name),
        headshot_url: stringOrNull(athlete?.headshot?.href || athlete?.headshot),
        throws: stringOrNull(athlete?.displayHand || athlete?.hand),
        raw_json: JSON.stringify(athlete),
        scraped_at: new Date().toISOString()
      });
    }
  }

  return count;
}

function extractCoreStatsMap(statsRoot: AnyRecord): Record<string, number | null> {
  const maps: Record<string, number | null> = {};
  const categories = Array.isArray(statsRoot?.splits?.categories) ? statsRoot.splits.categories : Array.isArray(statsRoot?.categories) ? statsRoot.categories : [];
  for (const category of categories) {
    for (const stat of Array.isArray(category?.stats) ? category.stats : []) {
      const name = String(stat?.name || "");
      if (name) {
        maps[name] = numberOrNull(stat?.value);
      }
    }
  }
  return maps;
}

function normalizeCoreSplit(split: AnyRecord, season: number, playerId: string): NormalizedPitcherSplit {
  const stat = split?.stats || split?.stat || split;
  return {
    season,
    playerId,
    splitCode: String(split?.split?.code || split?.code || split?.name || split?.id || "split"),
    splitLabel: stringOrNull(split?.split?.displayName || split?.displayName || split?.name || split?.description),
    gp: numberOrNull(stat?.games || stat?.gp),
    ip: numberOrNull(stat?.inningsPitched || stat?.ip),
    h: numberOrNull(stat?.hits || stat?.h),
    er: numberOrNull(stat?.earnedRuns || stat?.er),
    hr: numberOrNull(stat?.homeRuns || stat?.hr),
    bb: numberOrNull(stat?.baseOnBalls || stat?.bb),
    k: numberOrNull(stat?.strikeOuts || stat?.k),
    era: numberOrNull(stat?.era),
    whip: numberOrNull(stat?.whip),
    k9: numberOrNull(stat?.strikeoutsPerNineInnings || stat?.k9),
    bb9: numberOrNull(stat?.walksPerNineInnings || stat?.bb9),
    hr9: numberOrNull(stat?.homeRunsPerNineInnings || stat?.hr9),
    kbb: numberOrNull(stat?.strikeoutWalkRatio || stat?.kbb),
    split
  };
}

async function ingestPitchersFromCore(env: Env, season: number): Promise<number> {
  const athletes = await fetchJson<AnyRecord>(`${ESPN_CORE_BASE}/seasons/${season}/athletes?limit=2000&active=true&position=P&stats=season`);
  const items = Array.isArray(athletes?.items) ? athletes.items : [];
  let count = 0;
  for (const item of items) {
    const athlete = await fetchJson<AnyRecord>(String(item?.$ref || item?.href || item));
    const statsRef = stringOrNull(athlete?.statistics?.$ref);
    const teamRef = stringOrNull(athlete?.team?.$ref);
    const statsRoot = statsRef ? await fetchJson<AnyRecord>(statsRef) : {};
    const team = teamRef ? await fetchJson<AnyRecord>(teamRef) : athlete?.team || {};
    const statsMap = extractCoreStatsMap(statsRoot);
    const splitsRoot = stringOrNull(statsRoot?.splits?.$ref) ? await fetchJson<AnyRecord>(String(statsRoot.splits.$ref)) : statsRoot?.splits || {};
    const splitItems = Array.isArray(splitsRoot?.items) ? splitsRoot.items : Array.isArray(splitsRoot?.splits) ? splitsRoot.splits : [];
    const splits = splitItems.map((split: AnyRecord) => normalizeCoreSplit(split, season, String(athlete?.id || "")));
    count += 1;
    await upsertPitcher(env, season, {
      espn_player_id: String(athlete?.id || ""),
      name: String(athlete?.fullName || athlete?.displayName || "Unknown pitcher"),
      team_id: stringOrNull(team?.id || athlete?.team?.id),
      team_abbr: stringOrNull(team?.abbreviation || athlete?.team?.abbreviation),
      team_name: stringOrNull(team?.displayName || athlete?.team?.displayName),
      pos: stringOrNull(athlete?.position?.abbreviation) || "P",
      gp: statsMap.games,
      gs: statsMap.gamesStarted,
      qs: statsMap.qualityStarts,
      w: statsMap.wins,
      l: statsMap.losses,
      sv: statsMap.saves,
      hld: statsMap.holds,
      ip: statsMap.inningsPitched,
      h: statsMap.hits,
      er: statsMap.earnedRuns,
      hr: statsMap.homeRuns,
      bb: statsMap.baseOnBalls,
      k: statsMap.strikeOuts,
      era: statsMap.era,
      whip: statsMap.whip,
      k9: statsMap.strikeoutsPerNineInnings,
      bb9: statsMap.walksPerNineInnings,
      hr9: statsMap.homeRunsPerNineInnings,
      kbb: statsMap.strikeoutWalkRatio,
      war: statsMap.war,
      splits_json: JSON.stringify(splitsRoot || null),
      raw_json: JSON.stringify({ athlete, statsRoot, team }),
      scraped_at: new Date().toISOString()
    });
    await replacePitcherSplits(env, season, String(athlete?.id || ""), splits);
  }
  return count;
}

export async function syncPitchers(env: Env, season: number): Promise<{ statsPage: number; site: number; core: number }> {
  const statsPage = await ingestPitchersFromStatsPage(env, season).catch(() => 0);
  const site = await ingestPitcherSiteMetadata(env, season).catch(() => 0);
  const core = await ingestPitchersFromCore(env, season).catch(() => 0);
  return { statsPage, site, core };
}

function mapPitcherRow(row: Record<string, unknown>, splits: NormalizedPitcherSplit[]): NormalizedPitcherStats {
  return {
    season: Number(row.season || 0),
    espnPlayerId: String(row.espn_player_id || ""),
    name: String(row.name || "Unknown pitcher"),
    teamId: stringOrNull(row.team_id),
    teamAbbr: stringOrNull(row.team_abbr),
    teamName: stringOrNull(row.team_name),
    pos: stringOrNull(row.pos),
    jersey: stringOrNull(row.jersey),
    status: stringOrNull(row.status),
    headshotUrl: stringOrNull(row.headshot_url),
    throws: stringOrNull(row.throws),
    gp: numberOrNull(row.gp),
    gs: numberOrNull(row.gs),
    qs: numberOrNull(row.qs),
    w: numberOrNull(row.w),
    l: numberOrNull(row.l),
    sv: numberOrNull(row.sv),
    hld: numberOrNull(row.hld),
    ip: numberOrNull(row.ip),
    h: numberOrNull(row.h),
    er: numberOrNull(row.er),
    hr: numberOrNull(row.hr),
    bb: numberOrNull(row.bb),
    k: numberOrNull(row.k),
    era: numberOrNull(row.era),
    whip: numberOrNull(row.whip),
    k9: numberOrNull(row.k9),
    bb9: numberOrNull(row.bb9),
    hr9: numberOrNull(row.hr9),
    kbb: numberOrNull(row.kbb),
    war: numberOrNull(row.war),
    model: pitcherModel(row),
    splits,
    raw: row.raw_json ? (JSON.parse(String(row.raw_json)) as Record<string, unknown>) : undefined
  };
}

export async function handlePitchersRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return methodNotAllowed(env);
  }

  try {
    const url = new URL(request.url);
    const path = url.pathname;
    const season = Number(url.searchParams.get("season") || parseDate(url.searchParams.get("date")).slice(0, 4));
    const refresh = request.method === "POST" || url.searchParams.get("refresh") === "1";

    if (path === "/admin/mlb/pitchers/sync") {
      const sync = await syncPitchers(env, season);
      return jsonWithSourceMeta(
        request,
        { season, sync },
        {
          route: "/admin/mlb/pitchers/sync",
          source: "external_plus_db",
          tables: ["mlb_pitcher_stats", "mlb_pitcher_splits"],
          notes: "Manual MLB pitcher ingestion using ESPN stats page, site roster metadata, and core stats + splits.",
          breakdown: sync
        },
        200,
        env
      );
    }

    if (path === "/pitchers/mlb") {
      let rows = (await queryAll<Record<string, unknown>>(env, "SELECT * FROM mlb_pitcher_stats WHERE season = ?", [season])) || [];
      if ((refresh || rows.length === 0) && env.DB) {
        await syncPitchers(env, season);
        rows = (await queryAll<Record<string, unknown>>(env, "SELECT * FROM mlb_pitcher_stats WHERE season = ?", [season])) || [];
      }
      const sortKey = String(url.searchParams.get("sort") || "era").toLowerCase();
      const mapped = rows.map((row) => mapPitcherRow(row, []));
      const comparators: Record<string, (left: NormalizedPitcherStats, right: NormalizedPitcherStats) => number> = {
        era: (left, right) => (left.era ?? 999) - (right.era ?? 999),
        whip: (left, right) => (left.whip ?? 999) - (right.whip ?? 999),
        k: (left, right) => (right.k ?? -1) - (left.k ?? -1),
        war: (left, right) => (right.war ?? -1) - (left.war ?? -1),
        wins: (left, right) => (right.w ?? -1) - (left.w ?? -1)
      };
      mapped.sort(comparators[sortKey] || comparators.era);
      return jsonWithSourceMeta(
        request,
        { season, pitchers: mapped.slice(0, Number(url.searchParams.get("limit") || 100)) },
        {
          route: "/pitchers/mlb",
          source: "external_plus_db",
          tables: ["mlb_pitcher_stats", "mlb_pitcher_splits"],
          notes: "MLB pitcher leaderboard served from D1 and refreshed from ESPN when requested or empty.",
          breakdown: { pitchers: mapped.length, refreshed: refresh || rows.length === 0 }
        },
        200,
        env
      );
    }

    const statsMatch = path.match(/^\/pitchers\/mlb\/([^/]+)$/);
    if (statsMatch) {
      const splits =
        (await queryAll<Record<string, unknown>>(
          env,
          "SELECT * FROM mlb_pitcher_splits WHERE season = ? AND espn_player_id = ? ORDER BY split_label",
          [season, statsMatch[1]]
        )) || [];
      let row = await queryFirst<Record<string, unknown>>(
        env,
        "SELECT * FROM mlb_pitcher_stats WHERE season = ? AND espn_player_id = ? LIMIT 1",
        [season, statsMatch[1]]
      );
      if (!row && refresh) {
        await syncPitchers(env, season);
        row = await queryFirst<Record<string, unknown>>(
          env,
          "SELECT * FROM mlb_pitcher_stats WHERE season = ? AND espn_player_id = ? LIMIT 1",
          [season, statsMatch[1]]
        );
      }
      if (!row) {
        return json({ error: "Pitcher not found" }, 404, env);
      }
      return jsonWithSourceMeta(
        request,
        { season, pitcher: mapPitcherRow(row, splits.map((split) => ({
          season,
          playerId: statsMatch[1],
          splitCode: String(split.split_code || ""),
          splitLabel: stringOrNull(split.split_label),
          gp: numberOrNull(split.gp),
          ip: numberOrNull(split.ip),
          h: numberOrNull(split.h),
          er: numberOrNull(split.er),
          hr: numberOrNull(split.hr),
          bb: numberOrNull(split.bb),
          k: numberOrNull(split.k),
          era: numberOrNull(split.era),
          whip: numberOrNull(split.whip),
          k9: numberOrNull(split.k9),
          bb9: numberOrNull(split.bb9),
          hr9: numberOrNull(split.hr9),
          kbb: numberOrNull(split.kbb),
          split: split.split_json ? (JSON.parse(String(split.split_json)) as Record<string, unknown>) : {}
        }))) },
        {
          route: "/pitchers/mlb/:playerId",
          source: "db_only",
          tables: ["mlb_pitcher_stats", "mlb_pitcher_splits"],
          notes: "Full normalized pitcher profile served from D1."
        },
        200,
        env
      );
    }

    const splitsMatch = path.match(/^\/pitchers\/mlb\/([^/]+)\/splits$/);
    if (splitsMatch) {
      const splits =
        (await queryAll<Record<string, unknown>>(
          env,
          "SELECT * FROM mlb_pitcher_splits WHERE season = ? AND espn_player_id = ? ORDER BY split_label",
          [season, splitsMatch[1]]
        )) || [];
      return jsonWithSourceMeta(
        request,
        {
          season,
          playerId: splitsMatch[1],
          splits: splits.map((split) => ({
            splitCode: String(split.split_code || ""),
            splitLabel: stringOrNull(split.split_label),
            gp: numberOrNull(split.gp),
            ip: numberOrNull(split.ip),
            era: numberOrNull(split.era),
            whip: numberOrNull(split.whip),
            k9: numberOrNull(split.k9),
            bb9: numberOrNull(split.bb9),
            hr9: numberOrNull(split.hr9),
            split: split.split_json ? JSON.parse(String(split.split_json)) : {}
          }))
        },
        {
          route: "/pitchers/mlb/:playerId/splits",
          source: "db_only",
          tables: ["mlb_pitcher_splits"],
          notes: "Pitcher split ledger served from D1."
        },
        200,
        env
      );
    }

    return json({ error: "Pitchers route not found" }, 404, env);
  } catch (error) {
    return withError(error, env);
  }
}
