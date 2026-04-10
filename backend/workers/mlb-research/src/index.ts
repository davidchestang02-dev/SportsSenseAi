import type { Env } from "../../shared/types";
import { json, methodNotAllowed, parseDate, withError } from "../../shared/utils";

const ESPN_TEAMS_URL = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams";
const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";

type AnyRecord = Record<string, any>;

interface EspnBrand {
  espnId: string | null;
  abbreviation: string;
  displayName: string;
  color: string | null;
  alternateColor: string | null;
  logo: string | null;
  darkLogo: string | null;
  scoreboardLogo: string | null;
}

interface EspnBrandLookup {
  byAbbreviation: Map<string, EspnBrand>;
  byName: Map<string, EspnBrand>;
}

interface NormalizedTeamInfo {
  id: number | null;
  name: string;
  abbreviation: string;
  shortName: string;
  locationName: string | null;
  clubName: string | null;
  record: {
    wins: number | null;
    losses: number | null;
    pct: string | null;
  };
  league: string | null;
  division: string | null;
  venue: string | null;
  brand: EspnBrand | null;
}

function normalizeColor(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().replace(/^#/, "");
  return trimmed ? `#${trimmed}` : null;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }

  return null;
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  return null;
}

function normalizeKey(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function inferSeason(date: string, seasonValue: string | null): string {
  return (seasonValue || "").trim() || date.slice(0, 4);
}

function headshotUrl(playerId: number | null): string | null {
  if (!playerId) {
    return null;
  }

  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_360,q_auto:best/v1/people/${playerId}/headshot/67/current`;
}

function pickEspnLogo(logos: AnyRecord[], preferred: string): string | null {
  const preferredLogo =
    logos.find((logo) => Array.isArray(logo?.rel) && logo.rel.includes(preferred)) ||
    logos.find((logo) => Array.isArray(logo?.rel) && logo.rel.includes("scoreboard")) ||
    logos.find((logo) => Array.isArray(logo?.rel) && logo.rel.includes("default")) ||
    logos[0];

  return stringOrNull(preferredLogo?.href);
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

async function fetchEspnBrandLookup(): Promise<EspnBrandLookup> {
  const payload = await fetchJson<AnyRecord>(ESPN_TEAMS_URL);
  const teams = payload?.sports?.[0]?.leagues?.[0]?.teams || [];
  const byAbbreviation = new Map<string, EspnBrand>();
  const byName = new Map<string, EspnBrand>();

  for (const entry of teams) {
    const team = entry?.team;
    if (!team) {
      continue;
    }

    const logos = Array.isArray(team.logos) ? team.logos : [];
    const brand: EspnBrand = {
      espnId: stringOrNull(team.id),
      abbreviation: String(team.abbreviation || team.displayName || ""),
      displayName: String(team.displayName || team.name || ""),
      color: normalizeColor(team.color),
      alternateColor: normalizeColor(team.alternateColor),
      logo: pickEspnLogo(logos, "primary_logo_on_black_color") || pickEspnLogo(logos, "default"),
      darkLogo: pickEspnLogo(logos, "dark"),
      scoreboardLogo: pickEspnLogo(logos, "scoreboard")
    };

    if (brand.abbreviation) {
      byAbbreviation.set(normalizeKey(brand.abbreviation), brand);
    }

    if (brand.displayName) {
      byName.set(normalizeKey(brand.displayName), brand);
    }
  }

  return { byAbbreviation, byName };
}

function resolveBrand(lookup: EspnBrandLookup, abbreviation: string | null, name: string | null): EspnBrand | null {
  if (abbreviation) {
    const match = lookup.byAbbreviation.get(normalizeKey(abbreviation));
    if (match) {
      return match;
    }
  }

  if (name) {
    const match = lookup.byName.get(normalizeKey(name));
    if (match) {
      return match;
    }
  }

  return null;
}

function normalizeTeamInfo(team: AnyRecord, brand: EspnBrand | null, record?: AnyRecord): NormalizedTeamInfo {
  return {
    id: numberOrNull(team?.id),
    name: String(team?.name || team?.displayName || ""),
    abbreviation: String(team?.abbreviation || ""),
    shortName: String(team?.teamName || team?.shortDisplayName || team?.clubName || team?.name || ""),
    locationName: stringOrNull(team?.locationName || team?.location),
    clubName: stringOrNull(team?.clubName || team?.franchiseName),
    record: {
      wins: numberOrNull(record?.wins),
      losses: numberOrNull(record?.losses),
      pct: stringOrNull(record?.pct)
    },
    league: stringOrNull(team?.league?.name),
    division: stringOrNull(team?.division?.name),
    venue: stringOrNull(team?.venue?.name),
    brand
  };
}

function normalizeSlatePitcher(pitcher: AnyRecord | null | undefined): AnyRecord | null {
  const pitcherId = numberOrNull(pitcher?.id);
  if (!pitcherId) {
    return null;
  }

  return {
    id: pitcherId,
    fullName: String(pitcher?.fullName || ""),
    headshotUrl: headshotUrl(pitcherId)
  };
}

function normalizeSlateGame(game: AnyRecord, lookup: EspnBrandLookup): AnyRecord {
  const awayTeam = game?.teams?.away?.team || {};
  const homeTeam = game?.teams?.home?.team || {};
  const awayInfo = normalizeTeamInfo(
    awayTeam,
    resolveBrand(lookup, stringOrNull(awayTeam?.abbreviation), stringOrNull(awayTeam?.name)),
    game?.teams?.away?.leagueRecord
  );
  const homeInfo = normalizeTeamInfo(
    homeTeam,
    resolveBrand(lookup, stringOrNull(homeTeam?.abbreviation), stringOrNull(homeTeam?.name)),
    game?.teams?.home?.leagueRecord
  );

  return {
    gamePk: numberOrNull(game?.gamePk),
    officialDate: stringOrNull(game?.officialDate),
    gameDate: stringOrNull(game?.gameDate),
    status: {
      state: stringOrNull(game?.status?.abstractGameState),
      detail: stringOrNull(game?.status?.detailedState),
      code: stringOrNull(game?.status?.statusCode)
    },
    venue: {
      id: numberOrNull(game?.venue?.id),
      name: stringOrNull(game?.venue?.name)
    },
    dayNight: stringOrNull(game?.dayNight),
    matchupLabel: `${awayInfo.abbreviation || awayInfo.name} @ ${homeInfo.abbreviation || homeInfo.name}`,
    awayTeam: awayInfo,
    homeTeam: homeInfo,
    probablePitchers: {
      away: normalizeSlatePitcher(game?.teams?.away?.probablePitcher),
      home: normalizeSlatePitcher(game?.teams?.home?.probablePitcher)
    }
  };
}

function normalizePlayerBio(person: AnyRecord, brand: EspnBrand | null): AnyRecord {
  const playerId = numberOrNull(person?.id);

  return {
    id: playerId,
    fullName: String(person?.fullName || ""),
    firstName: stringOrNull(person?.firstName),
    lastName: stringOrNull(person?.lastName),
    currentAge: numberOrNull(person?.currentAge),
    birthDate: stringOrNull(person?.birthDate),
    birthCity: stringOrNull(person?.birthCity),
    birthStateProvince: stringOrNull(person?.birthStateProvince),
    birthCountry: stringOrNull(person?.birthCountry),
    height: stringOrNull(person?.height),
    weight: numberOrNull(person?.weight),
    bats: stringOrNull(person?.batSide?.code),
    batsDescription: stringOrNull(person?.batSide?.description),
    throws: stringOrNull(person?.pitchHand?.code),
    throwsDescription: stringOrNull(person?.pitchHand?.description),
    primaryNumber: stringOrNull(person?.primaryNumber),
    primaryPosition: {
      code: stringOrNull(person?.primaryPosition?.code),
      type: stringOrNull(person?.primaryPosition?.type),
      abbreviation: stringOrNull(person?.primaryPosition?.abbreviation),
      name: stringOrNull(person?.primaryPosition?.name)
    },
    strikeZoneTop: numberOrNull(person?.strikeZoneTop),
    strikeZoneBottom: numberOrNull(person?.strikeZoneBottom),
    currentTeam: person?.currentTeam
      ? {
          id: numberOrNull(person?.currentTeam?.id),
          name: stringOrNull(person?.currentTeam?.name),
          brand
        }
      : null,
    headshotUrl: headshotUrl(playerId)
  };
}

function normalizeRosterPlayer(entry: AnyRecord, person: AnyRecord | null, hitterStatsById: Map<number, AnyRecord>, pitcherStatsById: Map<number, AnyRecord>): AnyRecord {
  const playerId = numberOrNull(entry?.person?.id);
  const hitterStats = playerId ? hitterStatsById.get(playerId) || null : null;
  const pitcherStats = playerId ? pitcherStatsById.get(playerId) || null : null;

  return {
    id: playerId,
    fullName: String(entry?.person?.fullName || person?.fullName || ""),
    jerseyNumber: stringOrNull(entry?.jerseyNumber || person?.primaryNumber),
    position: {
      code: stringOrNull(entry?.position?.code || person?.primaryPosition?.code),
      type: stringOrNull(entry?.position?.type || person?.primaryPosition?.type),
      abbreviation: stringOrNull(entry?.position?.abbreviation || person?.primaryPosition?.abbreviation),
      name: stringOrNull(entry?.position?.name || person?.primaryPosition?.name)
    },
    status: stringOrNull(entry?.status?.description),
    bats: stringOrNull(person?.batSide?.code),
    throws: stringOrNull(person?.pitchHand?.code),
    age: numberOrNull(person?.currentAge),
    birthDate: stringOrNull(person?.birthDate),
    height: stringOrNull(person?.height),
    weight: numberOrNull(person?.weight),
    headshotUrl: headshotUrl(playerId),
    hitterStats,
    pitcherStats
  };
}

function normalizePlayerStatRow(split: AnyRecord, person: AnyRecord | null): AnyRecord {
  const stat = split?.stat || {};
  const playerId = numberOrNull(split?.player?.id || person?.id);

  return {
    playerId,
    fullName: String(split?.player?.fullName || person?.fullName || ""),
    teamId: numberOrNull(split?.team?.id),
    teamName: stringOrNull(split?.team?.name),
    position: {
      abbreviation: stringOrNull(split?.position?.abbreviation || person?.primaryPosition?.abbreviation),
      type: stringOrNull(split?.position?.type || person?.primaryPosition?.type),
      name: stringOrNull(split?.position?.name || person?.primaryPosition?.name)
    },
    bats: stringOrNull(person?.batSide?.code),
    throws: stringOrNull(person?.pitchHand?.code),
    age: numberOrNull(person?.currentAge),
    headshotUrl: headshotUrl(playerId),
    stat
  };
}

function statValue(stat: AnyRecord, key: string): number {
  return numberOrNull(stat?.[key]) || 0;
}

function roundRate(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 1000) / 1000;
}

function inningsFromOuts(outs: number): string {
  const whole = Math.floor(outs / 3);
  const remainder = outs % 3;
  return `${whole}.${remainder}`;
}

function aggregateHitting(rows: AnyRecord[]): AnyRecord | null {
  if (rows.length === 0) {
    return null;
  }

  const totals = rows.reduce(
    (accumulator, row) => {
      const stat = row.stat || {};
      return {
        games: accumulator.games + 1,
        atBats: accumulator.atBats + statValue(stat, "atBats"),
        hits: accumulator.hits + statValue(stat, "hits"),
        totalBases: accumulator.totalBases + statValue(stat, "totalBases"),
        homeRuns: accumulator.homeRuns + statValue(stat, "homeRuns"),
        rbi: accumulator.rbi + statValue(stat, "rbi"),
        runs: accumulator.runs + statValue(stat, "runs"),
        walks: accumulator.walks + statValue(stat, "baseOnBalls"),
        strikeOuts: accumulator.strikeOuts + statValue(stat, "strikeOuts"),
        doubles: accumulator.doubles + statValue(stat, "doubles"),
        triples: accumulator.triples + statValue(stat, "triples"),
        hitByPitch: accumulator.hitByPitch + statValue(stat, "hitByPitch"),
        sacFlies: accumulator.sacFlies + statValue(stat, "sacFlies"),
        stolenBases: accumulator.stolenBases + statValue(stat, "stolenBases")
      };
    },
    {
      games: 0,
      atBats: 0,
      hits: 0,
      totalBases: 0,
      homeRuns: 0,
      rbi: 0,
      runs: 0,
      walks: 0,
      strikeOuts: 0,
      doubles: 0,
      triples: 0,
      hitByPitch: 0,
      sacFlies: 0,
      stolenBases: 0
    }
  );

  const obpDenominator = totals.atBats + totals.walks + totals.hitByPitch + totals.sacFlies;
  const avg = totals.atBats > 0 ? totals.hits / totals.atBats : null;
  const obp = obpDenominator > 0 ? (totals.hits + totals.walks + totals.hitByPitch) / obpDenominator : null;
  const slg = totals.atBats > 0 ? totals.totalBases / totals.atBats : null;

  return {
    gamesPlayed: totals.games,
    atBats: totals.atBats,
    hits: totals.hits,
    totalBases: totals.totalBases,
    homeRuns: totals.homeRuns,
    rbi: totals.rbi,
    runs: totals.runs,
    walks: totals.walks,
    strikeOuts: totals.strikeOuts,
    doubles: totals.doubles,
    triples: totals.triples,
    stolenBases: totals.stolenBases,
    avg: roundRate(avg),
    obp: roundRate(obp),
    slg: roundRate(slg),
    ops: roundRate(obp !== null && slg !== null ? obp + slg : null)
  };
}

function aggregatePitching(rows: AnyRecord[]): AnyRecord | null {
  if (rows.length === 0) {
    return null;
  }

  const totals = rows.reduce(
    (accumulator, row) => {
      const stat = row.stat || {};
      return {
        games: accumulator.games + 1,
        outs: accumulator.outs + statValue(stat, "outs"),
        hits: accumulator.hits + statValue(stat, "hits"),
        earnedRuns: accumulator.earnedRuns + statValue(stat, "earnedRuns"),
        walks: accumulator.walks + statValue(stat, "baseOnBalls"),
        strikeOuts: accumulator.strikeOuts + statValue(stat, "strikeOuts"),
        homeRuns: accumulator.homeRuns + statValue(stat, "homeRuns"),
        battersFaced: accumulator.battersFaced + statValue(stat, "battersFaced"),
        gamesStarted: accumulator.gamesStarted + statValue(stat, "gamesStarted")
      };
    },
    {
      games: 0,
      outs: 0,
      hits: 0,
      earnedRuns: 0,
      walks: 0,
      strikeOuts: 0,
      homeRuns: 0,
      battersFaced: 0,
      gamesStarted: 0
    }
  );

  const innings = totals.outs / 3;
  const era = innings > 0 ? (totals.earnedRuns * 9) / innings : null;
  const whip = innings > 0 ? (totals.walks + totals.hits) / innings : null;
  const kPer9 = innings > 0 ? (totals.strikeOuts * 9) / innings : null;
  const bbPer9 = innings > 0 ? (totals.walks * 9) / innings : null;
  const hPer9 = innings > 0 ? (totals.hits * 9) / innings : null;
  const hrPer9 = innings > 0 ? (totals.homeRuns * 9) / innings : null;

  return {
    gamesPlayed: totals.games,
    gamesStarted: totals.gamesStarted,
    inningsPitched: inningsFromOuts(totals.outs),
    outs: totals.outs,
    hits: totals.hits,
    earnedRuns: totals.earnedRuns,
    walks: totals.walks,
    strikeOuts: totals.strikeOuts,
    homeRuns: totals.homeRuns,
    battersFaced: totals.battersFaced,
    era: roundRate(era),
    whip: roundRate(whip),
    strikeoutsPer9: roundRate(kPer9),
    walksPer9: roundRate(bbPer9),
    hitsPer9: roundRate(hPer9),
    homeRunsPer9: roundRate(hrPer9)
  };
}

function normalizeGameLogRow(split: AnyRecord): AnyRecord {
  return {
    date: stringOrNull(split?.date),
    isHome: Boolean(split?.isHome),
    isWin: Boolean(split?.isWin),
    summary: stringOrNull(split?.stat?.summary),
    opponent: split?.opponent
      ? {
          id: numberOrNull(split?.opponent?.id),
          name: stringOrNull(split?.opponent?.name)
        }
      : null,
    game: split?.game
      ? {
          gamePk: numberOrNull(split?.game?.gamePk),
          dayNight: stringOrNull(split?.game?.dayNight)
        }
      : null,
    stat: split?.stat || {}
  };
}

function normalizeSplits(rows: AnyRecord[]): AnyRecord[] {
  return rows.map((row) => ({
    code: stringOrNull(row?.split?.code),
    description: stringOrNull(row?.split?.description),
    stat: row?.stat || {}
  }));
}

function splitsByCode(rows: AnyRecord[]): Record<string, AnyRecord> {
  return rows.reduce<Record<string, AnyRecord>>((accumulator, row) => {
    const code = stringOrNull(row?.code);
    if (code) {
      accumulator[code] = row;
    }
    return accumulator;
  }, {});
}

async function fetchPeopleMap(personIds: number[]): Promise<Map<number, AnyRecord>> {
  if (personIds.length === 0) {
    return new Map<number, AnyRecord>();
  }

  const payload = await fetchJson<AnyRecord>(`${MLB_API_BASE}/people?personIds=${personIds.join(",")}`);
  const people = Array.isArray(payload?.people) ? payload.people : [];
  return new Map<number, AnyRecord>(people.map((person) => [Number(person.id), person]));
}

async function handleResearchSlate(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const date = parseDate(url.searchParams.get("date"));
  const schedule = await fetchJson<AnyRecord>(
    `${MLB_API_BASE}/schedule?sportId=1&date=${date}&hydrate=probablePitcher,team,venue`
  );
  const lookup = await fetchEspnBrandLookup();
  const games = schedule?.dates?.[0]?.games || [];

  return json(
    {
      date,
      season: inferSeason(date, url.searchParams.get("season")),
      games: games.map((game: AnyRecord) => normalizeSlateGame(game, lookup))
    },
    200,
    env
  );
}

async function handleTeamResearch(request: Request, env: Env, teamId: number): Promise<Response> {
  const url = new URL(request.url);
  const date = parseDate(url.searchParams.get("date"));
  const season = inferSeason(date, url.searchParams.get("season"));

  const [lookup, teamPayload, rosterPayload, hitterPayload, pitcherPayload, teamStatsPayload, schedulePayload] = await Promise.all([
    fetchEspnBrandLookup(),
    fetchJson<AnyRecord>(`${MLB_API_BASE}/teams/${teamId}?season=${season}&hydrate=venue,division,league`),
    fetchJson<AnyRecord>(`${MLB_API_BASE}/teams/${teamId}/roster?season=${season}`),
    fetchJson<AnyRecord>(`${MLB_API_BASE}/stats?stats=season&group=hitting&teamId=${teamId}&season=${season}&sportIds=1&playerPool=ALL&limit=250`),
    fetchJson<AnyRecord>(`${MLB_API_BASE}/stats?stats=season&group=pitching&teamId=${teamId}&season=${season}&sportIds=1&playerPool=ALL&limit=250`),
    fetchJson<AnyRecord>(`${MLB_API_BASE}/teams/${teamId}/stats?stats=season,statSplits&group=hitting,pitching&season=${season}&sitCodes=vl,vr,gh,ga`),
    fetchJson<AnyRecord>(`${MLB_API_BASE}/schedule?sportId=1&date=${date}&hydrate=probablePitcher,team,venue`)
  ]);

  const team = teamPayload?.teams?.[0] || {};
  const rosterEntries = Array.isArray(rosterPayload?.roster) ? rosterPayload.roster : [];
  const hitterSplits = Array.isArray(hitterPayload?.stats?.[0]?.splits) ? hitterPayload.stats[0].splits : [];
  const pitcherSplits = Array.isArray(pitcherPayload?.stats?.[0]?.splits) ? pitcherPayload.stats[0].splits : [];
  const peopleMap = await fetchPeopleMap(
    rosterEntries
      .map((entry: AnyRecord) => numberOrNull(entry?.person?.id))
      .filter((value: number | null): value is number => value !== null)
  );

  const hitterRows = hitterSplits.map((split: AnyRecord) => normalizePlayerStatRow(split, peopleMap.get(Number(split?.player?.id)) || null));
  const pitcherRows = pitcherSplits.map((split: AnyRecord) => normalizePlayerStatRow(split, peopleMap.get(Number(split?.player?.id)) || null));
  const hitterStatsById = new Map<number, AnyRecord>(
    hitterRows.filter((row: AnyRecord) => row.playerId).map((row: AnyRecord) => [Number(row.playerId), row])
  );
  const pitcherStatsById = new Map<number, AnyRecord>(
    pitcherRows.filter((row: AnyRecord) => row.playerId).map((row: AnyRecord) => [Number(row.playerId), row])
  );
  const teamBrand = resolveBrand(lookup, stringOrNull(team?.abbreviation), stringOrNull(team?.name));
  const teamInfo = normalizeTeamInfo(team, teamBrand);
  const games = Array.isArray(schedulePayload?.dates?.[0]?.games) ? schedulePayload.dates[0].games : [];
  const matchup = games
    .map((game: AnyRecord) => normalizeSlateGame(game, lookup))
    .find((game: AnyRecord) => game.awayTeam?.id === teamInfo.id || game.homeTeam?.id === teamInfo.id) || null;
  const teamStats = Array.isArray(teamStatsPayload?.stats) ? teamStatsPayload.stats : [];
  const seasonHitting = teamStats.find((entry: AnyRecord) => entry?.group?.displayName === "hitting" && entry?.type?.displayName === "season")?.splits?.[0]?.stat || null;
  const seasonPitching = teamStats.find((entry: AnyRecord) => entry?.group?.displayName === "pitching" && entry?.type?.displayName === "season")?.splits?.[0]?.stat || null;
  const hittingSplitsNormalized = normalizeSplits(
    teamStats.find((entry: AnyRecord) => entry?.group?.displayName === "hitting" && entry?.type?.displayName === "statSplits")?.splits || []
  );
  const pitchingSplitsNormalized = normalizeSplits(
    teamStats.find((entry: AnyRecord) => entry?.group?.displayName === "pitching" && entry?.type?.displayName === "statSplits")?.splits || []
  );

  const roster = rosterEntries
    .map((entry: AnyRecord) =>
      normalizeRosterPlayer(entry, peopleMap.get(Number(entry?.person?.id)) || null, hitterStatsById, pitcherStatsById)
    )
    .sort((left: AnyRecord, right: AnyRecord) => String(left.position?.abbreviation || "").localeCompare(String(right.position?.abbreviation || "")) || String(left.fullName).localeCompare(String(right.fullName)));

  return json(
    {
      date,
      season,
      team: teamInfo,
      matchup,
      roster,
      hitting: {
        teamSeason: seasonHitting,
        splits: hittingSplitsNormalized,
        splitsByCode: splitsByCode(hittingSplitsNormalized),
        players: hitterRows.sort((left: AnyRecord, right: AnyRecord) => statValue(right.stat || {}, "ops") - statValue(left.stat || {}, "ops"))
      },
      pitching: {
        teamSeason: seasonPitching,
        splits: pitchingSplitsNormalized,
        splitsByCode: splitsByCode(pitchingSplitsNormalized),
        players: pitcherRows.sort((left: AnyRecord, right: AnyRecord) => statValue(left.stat || {}, "era") - statValue(right.stat || {}, "era"))
      }
    },
    200,
    env
  );
}

async function handlePlayerResearch(request: Request, env: Env, playerId: number): Promise<Response> {
  const url = new URL(request.url);
  const date = parseDate(url.searchParams.get("date"));
  const season = inferSeason(date, url.searchParams.get("season"));
  const opponentTeamId = numberOrNull(url.searchParams.get("opponentTeamId"));
  const opposingPitcherId = numberOrNull(url.searchParams.get("opposingPitcherId"));

  const lookup = await fetchEspnBrandLookup();
  const playerPayload = await fetchJson<AnyRecord>(`${MLB_API_BASE}/people/${playerId}?hydrate=currentTeam`);
  const person = playerPayload?.people?.[0] || {};
  const isPitcher = String(person?.primaryPosition?.type || "").toLowerCase() === "pitcher" || String(person?.primaryPosition?.abbreviation || "") === "P";
  const statsGroup = isPitcher ? "pitching" : "hitting";

  const [seasonPayload, gameLogPayload, splitPayload, vsPlayerPayload] = await Promise.all([
    fetchJson<AnyRecord>(`${MLB_API_BASE}/people/${playerId}/stats?stats=season&group=${statsGroup}&season=${season}`),
    fetchJson<AnyRecord>(`${MLB_API_BASE}/people/${playerId}/stats?stats=gameLog&group=${statsGroup}&season=${season}`),
    fetchJson<AnyRecord>(`${MLB_API_BASE}/people/${playerId}/stats?stats=statSplits&group=${statsGroup}&season=${season}&sitCodes=vl,vr,gh,ga`),
    !isPitcher && opposingPitcherId
      ? fetchJson<AnyRecord>(`${MLB_API_BASE}/people/${playerId}/stats?stats=vsPlayer&group=hitting&opposingPlayerId=${opposingPitcherId}&season=${season}`)
      : Promise.resolve(null)
  ]);

  const seasonRow = seasonPayload?.stats?.[0]?.splits?.[0] || null;
  const gameLogs = (Array.isArray(gameLogPayload?.stats?.[0]?.splits) ? gameLogPayload.stats[0].splits : [])
    .map((split: AnyRecord) => normalizeGameLogRow(split))
    .sort((left: AnyRecord, right: AnyRecord) => String(right.date || "").localeCompare(String(left.date || "")));
  const recentLast3 = isPitcher ? aggregatePitching(gameLogs.slice(0, 3)) : aggregateHitting(gameLogs.slice(0, 3));
  const recentLast5 = isPitcher ? aggregatePitching(gameLogs.slice(0, 5)) : aggregateHitting(gameLogs.slice(0, 5));
  const recentLast10 = isPitcher ? aggregatePitching(gameLogs.slice(0, 10)) : aggregateHitting(gameLogs.slice(0, 10));
  const splitRows = normalizeSplits(Array.isArray(splitPayload?.stats?.[0]?.splits) ? splitPayload.stats[0].splits : []);
  const opponentHistoryRows = opponentTeamId ? gameLogs.filter((row: AnyRecord) => row?.opponent?.id === opponentTeamId) : [];
  const opponentHistorySummary = opponentHistoryRows.length > 0 ? (isPitcher ? aggregatePitching(opponentHistoryRows) : aggregateHitting(opponentHistoryRows)) : null;
  const vsPitcherRow = vsPlayerPayload?.stats?.[0]?.splits?.[0] || null;
  const currentTeamBrand = resolveBrand(lookup, null, stringOrNull(person?.currentTeam?.name));

  return json(
    {
      date,
      season,
      group: statsGroup,
      player: normalizePlayerBio(person, currentTeamBrand),
      seasonStats: seasonRow ? { stat: seasonRow.stat || {}, team: seasonRow.team || null } : null,
      recent: {
        games: gameLogs,
        last3: recentLast3,
        last5: recentLast5,
        last10: recentLast10
      },
      splits: {
        list: splitRows,
        byCode: splitsByCode(splitRows)
      },
      opponentHistory: opponentTeamId
        ? {
            teamId: opponentTeamId,
            games: opponentHistoryRows,
            summary: opponentHistorySummary
          }
        : null,
      vsPitcher: vsPitcherRow
        ? {
            pitcher: {
              id: numberOrNull(vsPitcherRow?.pitcher?.id),
              fullName: stringOrNull(vsPitcherRow?.pitcher?.fullName),
              headshotUrl: headshotUrl(numberOrNull(vsPitcherRow?.pitcher?.id))
            },
            summary: vsPitcherRow?.stat || {},
            opponent: vsPitcherRow?.opponent || null
          }
        : null
    },
    200,
    env
  );
}

export async function handleResearchRequest(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowed(env);
  }

  try {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/research/mlb/slate") {
      return handleResearchSlate(request, env);
    }

    if (path.startsWith("/research/mlb/team/")) {
      const teamId = numberOrNull(path.split("/").pop());
      if (!teamId) {
        return json({ error: "A valid MLB team id is required." }, 400, env);
      }
      return handleTeamResearch(request, env, teamId);
    }

    if (path.startsWith("/research/mlb/player/")) {
      const playerId = numberOrNull(path.split("/").pop());
      if (!playerId) {
        return json({ error: "A valid MLB player id is required." }, 400, env);
      }
      return handlePlayerResearch(request, env, playerId);
    }

    return json({ error: "Research route not found" }, 404, env);
  } catch (error) {
    return withError(error, env);
  }
}
