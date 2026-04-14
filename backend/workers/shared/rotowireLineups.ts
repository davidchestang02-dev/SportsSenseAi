import { execute } from "./db";
import type { Env, InjuryRow, LineupRow, NormalizedPregameGame } from "./types";

type RotowireLineupPlayer = {
  playerId: number | null;
  playerName: string;
  battingOrder: number;
  bats: string | null;
  position: string | null;
};

type RotowirePitcher = {
  playerId: number | null;
  name: string | null;
  throws: string | null;
  statLine: string | null;
};

type RotowireTeamLineup = {
  abbr: string;
  confirmed: boolean;
  status: string;
  pitcher: RotowirePitcher | null;
  players: RotowireLineupPlayer[];
};

type RotowireWeather = {
  text: string | null;
  conditions: string | null;
  tempF: number | null;
  windSpeed: number | null;
  windDirDeg: number | null;
  windLabel: string | null;
  precipProb: number | null;
  isDome: boolean;
};

export type RotowireLineupGame = {
  awayAbbr: string;
  homeAbbr: string;
  startTimeEt: string | null;
  umpireName: string | null;
  weather: RotowireWeather | null;
  away: RotowireTeamLineup;
  home: RotowireTeamLineup;
  lineText: string | null;
  totalText: string | null;
};

export type RotowireSlateSupport = {
  lineups: LineupRow[];
  injuries: InjuryRow[];
  weatherRows: Array<{
    date: string;
    gameId: string;
    temp: number | null;
    windSpeed: number | null;
    windDir: number | null;
    precipProb: number | null;
    conditions: string | null;
    isDome: boolean;
  }>;
  umpires: Array<{
    date: string;
    gameId: string;
    name: string | null;
  }>;
  parsedGames: RotowireLineupGame[];
  matchedGames: number;
};

const ROTOWIRE_DAILY_LINEUPS_URL = "https://www.rotowire.com/baseball/daily-lineups.php";
const ESPN_TEAM_INJURIES_URL = "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams";

function cleanText(value: string | null | undefined): string {
  return decodeHtmlEntities(String(value || ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&deg;/g, "°")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&#39;|&#x27;|&#8217;/g, "'")
    .replace(/&ndash;|&mdash;/g, "-")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function teamAlias(value: string | null | undefined): string {
  const normalized = String(value || "").trim().toUpperCase();
  const aliases: Record<string, string> = {
    AZ: "ARI",
    ARZ: "ARI",
    CWS: "CHW",
    KCR: "KC",
    SDP: "SD",
    SFG: "SF",
    TBR: "TB",
    WAS: "WSH",
    WSN: "WSH"
  };
  return aliases[normalized] || normalized;
}

function etDate(dayOffset = 0): string {
  const now = new Date(Date.now() + dayOffset * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function rotowireUrlForDate(date: string): string {
  if (date === etDate(0)) {
    return ROTOWIRE_DAILY_LINEUPS_URL;
  }

  if (date === etDate(1)) {
    return `${ROTOWIRE_DAILY_LINEUPS_URL}?date=tomorrow`;
  }

  return `${ROTOWIRE_DAILY_LINEUPS_URL}?date=${date}`;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(`RotoWire request failed: ${response.status} for ${url}`);
  }

  return response.text();
}

function blockStarts(html: string): number[] {
  const starts: number[] = [];
  const pattern = /<div class="lineup is-mlb(?: [^"]*)?">/g;
  let match = pattern.exec(html);

  while (match) {
    if (typeof match.index === "number") {
      starts.push(match.index);
    }
    match = pattern.exec(html);
  }

  return starts;
}

function parseTeamLineup(section: string, abbr: string): RotowireTeamLineup {
  const pitcherMatch =
    section.match(
      /<div class="lineup__player-highlight-name">[\s\S]*?<a[^>]*href="[^"]*-(\d+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<span class="lineup__throws">([\s\S]*?)<\/span>[\s\S]*?<div class="lineup__player-highlight-stats">([\s\S]*?)<\/div>/
    ) || null;
  const statusMatch = section.match(/<li class="lineup__status[^"]*">([\s\S]*?)<\/li>/);
  const playerMatches = [...section.matchAll(/<li class="lineup__player">([\s\S]*?)<\/li>/g)];

  const players = playerMatches.map((match, index) => {
    const playerMarkup = match[1] || "";
    const idMatch = playerMarkup.match(/href="[^"]*-(\d+)"/);
    const titleMatch = playerMarkup.match(/title="([^"]+)"/);
    const nameMatch = playerMarkup.match(/<a[^>]*>([\s\S]*?)<\/a>/);
    const batsMatch = playerMarkup.match(/<span class="lineup__bats">([\s\S]*?)<\/span>/);
    const positionMatch = playerMarkup.match(/<div class="lineup__pos">([\s\S]*?)<\/div>/);

    return {
      playerId: numberOrNull(idMatch?.[1]),
      playerName: cleanText(titleMatch?.[1] || nameMatch?.[1] || "Unknown player"),
      battingOrder: index + 1,
      bats: cleanText(batsMatch?.[1] || "") || null,
      position: cleanText(positionMatch?.[1] || "") || null
    };
  });

  return {
    abbr,
    confirmed: /lineup__status is-confirmed/.test(section),
    status: cleanText(statusMatch?.[1] || "Expected lineup") || "Expected lineup",
    pitcher: pitcherMatch
      ? {
          playerId: numberOrNull(pitcherMatch[1]),
          name: cleanText(pitcherMatch[2]),
          throws: cleanText(pitcherMatch[3]) || null,
          statLine: cleanText(pitcherMatch[4]) || null
        }
      : null,
    players
  };
}

function normalizeWeatherCondition(iconSrc: string | null, iconAlt: string | null): string | null {
  if (String(iconSrc || "").toLowerCase().includes("dome")) {
    return "Dome";
  }

  const raw = String(iconAlt || "")
    .replace(/-day|-night/g, "")
    .replace(/-/g, " ")
    .trim();

  if (!raw) {
    return null;
  }

  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function windLabelToDegrees(label: string | null): number | null {
  const normalized = String(label || "").trim().toUpperCase();
  const directionMap: Record<string, number> = {
    N: 0,
    NE: 45,
    E: 90,
    SE: 135,
    S: 180,
    SW: 225,
    W: 270,
    NW: 315,
    "L-R": 90,
    "R-L": 270
  };

  return directionMap[normalized] ?? null;
}

function parseWeather(block: string): RotowireWeather | null {
  const textMatch = block.match(/<div class="lineup__weather-text">([\s\S]*?)<\/div>/);
  const iconMatch = block.match(/<img class="lineup__weather-icon" src="([^"]+)" alt="([^"]*)"/);
  if (!textMatch && !iconMatch) {
    return null;
  }

  const cleaned = cleanText(textMatch?.[1] || "");
  const windLabelMatch = cleaned.match(/Wind\s+\d+(?:\.\d+)?\s*mph\s+([A-Z-]+)/i);
  const iconSrc = iconMatch?.[1] || null;
  const isDome = String(iconSrc || "").toLowerCase().includes("dome");

  return {
    text: cleaned || null,
    conditions: normalizeWeatherCondition(iconSrc, iconMatch?.[2] || null),
    tempF: numberOrNull(cleaned.match(/(-?\d+(?:\.\d+)?)°/)?.[1]),
    windSpeed: numberOrNull(cleaned.match(/Wind\s+(\d+(?:\.\d+)?)\s*mph/i)?.[1]),
    windDirDeg: windLabelToDegrees(windLabelMatch?.[1] || null),
    windLabel: cleanText(windLabelMatch?.[1] || "") || null,
    precipProb: numberOrNull(cleaned.match(/(\d+(?:\.\d+)?)%/)?.[1]),
    isDome
  };
}

function parseUmpireName(block: string): string | null {
  const umpireMatch = block.match(/<div class="lineup__umpire">([\s\S]*?)<\/div>/);
  const cleaned = cleanText(umpireMatch?.[1] || "").replace(/^Umpire:\s*/i, "");
  if (!cleaned || /not announced yet/i.test(cleaned)) {
    return null;
  }

  return cleaned.split(/\s{2,}|\s+\d+(?:\.\d+)?\s+[A-Z/]/)[0]?.trim() || cleaned;
}

function parseOddsItem(block: string, label: "LINE" | "O/U"): string | null {
  const itemPattern = new RegExp(`<div class="lineup__odds-item">[\\s\\S]*?<b>${label}<\\/b>&nbsp;([\\s\\S]*?)<\\/div>`, "i");
  const itemMatch = block.match(itemPattern);
  if (!itemMatch) {
    return null;
  }

  const preferredValue =
    itemMatch[1].match(/<span class="fanduel[^"]*">([\s\S]*?)<\/span>/)?.[1] ||
    itemMatch[1].match(/<span class="composite[^"]*">([\s\S]*?)<\/span>/)?.[1] ||
    itemMatch[1].match(/<span class="draftkings[^"]*">([\s\S]*?)<\/span>/)?.[1] ||
    itemMatch[1].match(/<span class="betmgm[^"]*">([\s\S]*?)<\/span>/)?.[1] ||
    null;

  const cleaned = cleanText(preferredValue || "");
  return cleaned && cleaned !== "-" ? cleaned : null;
}

export async function fetchRotowireLineupGames(date: string): Promise<RotowireLineupGame[]> {
  const html = await fetchText(rotowireUrlForDate(date));
  const starts = blockStarts(html);
  const games: RotowireLineupGame[] = [];

  for (let index = 0; index < starts.length; index += 1) {
    const block = html.slice(starts[index], starts[index + 1] || html.length);
    if (block.includes("is-tools")) {
      continue;
    }

    const abbrs = [...block.matchAll(/<div class="lineup__abbr">([\s\S]*?)<\/div>/g)].map((match) => cleanText(match[1]));
    if (abbrs.length < 2) {
      continue;
    }

    const teamSectionsMatch = block.match(/<ul class="lineup__list is-visit">([\s\S]*?)<\/ul>[\s\S]*?<ul class="lineup__list is-home">([\s\S]*?)<\/ul>/);
    if (!teamSectionsMatch) {
      continue;
    }

    games.push({
      awayAbbr: teamAlias(abbrs[0]),
      homeAbbr: teamAlias(abbrs[1]),
      startTimeEt: cleanText(block.match(/<div class="lineup__time">([\s\S]*?)<\/div>/)?.[1] || "") || null,
      umpireName: parseUmpireName(block),
      weather: parseWeather(block),
      away: parseTeamLineup(teamSectionsMatch[1], teamAlias(abbrs[0])),
      home: parseTeamLineup(teamSectionsMatch[2], teamAlias(abbrs[1])),
      lineText: parseOddsItem(block, "LINE"),
      totalText: parseOddsItem(block, "O/U")
    });
  }

  return games;
}

function findPregameGame(parsedGame: RotowireLineupGame, games: NormalizedPregameGame[]): NormalizedPregameGame | null {
  return (
    games.find(
      (game) =>
        teamAlias(game.teams.away.abbreviation) === parsedGame.awayAbbr &&
        teamAlias(game.teams.home.abbreviation) === parsedGame.homeAbbr
    ) || null
  );
}

async function fetchTeamInjuries(teamId: string): Promise<Array<{ playerId: number | null; playerName: string; status: string; description: string; lastUpdated: string }>> {
  const response = await fetch(`${ESPN_TEAM_INJURIES_URL}/${teamId}/injuries`, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const injuries = Array.isArray(payload?.injuries) ? payload.injuries : [];

  return injuries.map((injury) => {
    const row = injury as Record<string, unknown>;
    const athlete = (row.athlete || {}) as Record<string, unknown>;
    const detail = cleanText(String(row.detail || row.description || row.status || ""));
    const type = cleanText(String((row.type as Record<string, unknown> | undefined)?.description || ""));

    return {
      playerId: numberOrNull(athlete.id),
      playerName: cleanText(String(athlete.displayName || athlete.fullName || "Unknown player")),
      status: cleanText(String(row.status || (row.fantasy as Record<string, unknown> | undefined)?.status || "Injured")) || "Injured",
      description: detail || type || "Injury note unavailable",
      lastUpdated: cleanText(String(row.date || new Date().toISOString())) || new Date().toISOString()
    };
  });
}

export async function syncRotowireSlateSupport(env: Env, date: string, pregameGames: NormalizedPregameGame[]): Promise<RotowireSlateSupport> {
  const parsedGames = await fetchRotowireLineupGames(date);
  if (env.DB) {
    await env.DB.prepare("DELETE FROM mlb_lineups WHERE date = ?").bind(date).run();
    await env.DB.prepare("DELETE FROM mlb_weather WHERE date = ?").bind(date).run();
    await env.DB.prepare("DELETE FROM mlb_umpires WHERE date = ?").bind(date).run();
  }
  const matchedGames = parsedGames
    .map((parsedGame) => ({
      parsedGame,
      pregameGame: findPregameGame(parsedGame, pregameGames)
    }))
    .filter((entry) => entry.pregameGame);

  const lineups: LineupRow[] = [];
  const weatherRows: RotowireSlateSupport["weatherRows"] = [];
  const umpires: RotowireSlateSupport["umpires"] = [];

  for (const entry of matchedGames) {
    const game = entry.pregameGame!;
    const createdAt = new Date().toISOString();

    for (const player of entry.parsedGame.away.players) {
      lineups.push({
        date,
        game_id: game.gameId,
        team_id: numberOrNull(game.teams.away.id) ?? 0,
        team: game.teams.away.abbreviation,
        player_id: player.playerId ?? 0,
        player_name: player.playerName,
        batting_order: player.battingOrder,
        confirmed: entry.parsedGame.away.confirmed,
        status: entry.parsedGame.away.confirmed ? "Confirmed" : "Expected"
      });

      await execute(
        env,
        `INSERT INTO mlb_lineups (date, game_id, team_id, team, player_id, player_name, batting_order, confirmed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          date,
          game.gameId,
          numberOrNull(game.teams.away.id),
          game.teams.away.abbreviation,
          player.playerId,
          player.playerName,
          player.battingOrder,
          entry.parsedGame.away.confirmed ? 1 : 0,
          createdAt
        ]
      );
    }

    for (const player of entry.parsedGame.home.players) {
      lineups.push({
        date,
        game_id: game.gameId,
        team_id: numberOrNull(game.teams.home.id) ?? 0,
        team: game.teams.home.abbreviation,
        player_id: player.playerId ?? 0,
        player_name: player.playerName,
        batting_order: player.battingOrder,
        confirmed: entry.parsedGame.home.confirmed,
        status: entry.parsedGame.home.confirmed ? "Confirmed" : "Expected"
      });

      await execute(
        env,
        `INSERT INTO mlb_lineups (date, game_id, team_id, team, player_id, player_name, batting_order, confirmed, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          date,
          game.gameId,
          numberOrNull(game.teams.home.id),
          game.teams.home.abbreviation,
          player.playerId,
          player.playerName,
          player.battingOrder,
          entry.parsedGame.home.confirmed ? 1 : 0,
          createdAt
        ]
      );
    }

    if (entry.parsedGame.weather) {
      weatherRows.push({
        date,
        gameId: game.gameId,
        temp: entry.parsedGame.weather.tempF,
        windSpeed: entry.parsedGame.weather.windSpeed,
        windDir: entry.parsedGame.weather.windDirDeg,
        precipProb: entry.parsedGame.weather.precipProb,
        conditions: entry.parsedGame.weather.conditions,
        isDome: entry.parsedGame.weather.isDome
      });

      await execute(
        env,
        `INSERT INTO mlb_weather (
          date, game_id, temp, humidity, wind_speed, wind_dir, air_density, hr_boost, tb_boost, run_boost, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          date,
          game.gameId,
          entry.parsedGame.weather.tempF,
          null,
          entry.parsedGame.weather.windSpeed,
          entry.parsedGame.weather.windDirDeg,
          null,
          null,
          null,
          null,
          createdAt
        ]
      );
    }

    if (entry.parsedGame.umpireName) {
      umpires.push({
        date,
        gameId: game.gameId,
        name: entry.parsedGame.umpireName
      });

      await execute(
        env,
        `INSERT INTO mlb_umpires (
          umpire_id, name, date, game_id, k_boost, bb_boost, hr_boost, run_boost, zone_size, consistency, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [null, entry.parsedGame.umpireName, date, game.gameId, null, null, null, null, null, null, createdAt]
      );
    }
  }

  const uniqueTeams = Array.from(
    new Map(
      matchedGames.flatMap((entry) => {
        const game = entry.pregameGame!;
        return [
          [String(game.teams.away.id), { id: String(game.teams.away.id), abbr: game.teams.away.abbreviation }],
          [String(game.teams.home.id), { id: String(game.teams.home.id), abbr: game.teams.home.abbreviation }]
        ];
      })
    ).values()
  );

  const injuries = (
    await Promise.all(
      uniqueTeams.map(async (team) => {
        if (!team.id) {
          return [];
        }

        const teamInjuries = await fetchTeamInjuries(team.id);
        if (env.DB) {
          await env.DB.prepare("DELETE FROM mlb_injuries WHERE team_id = ?").bind(team.id).run();
        }

        for (const injury of teamInjuries) {
          await execute(
            env,
            `INSERT INTO mlb_injuries (player_id, player_name, team_id, team, status, description, last_updated)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [injury.playerId, injury.playerName, team.id, team.abbr, injury.status, injury.description, injury.lastUpdated]
          );
        }

        return teamInjuries.map((injury) => ({
          player_id: injury.playerId ?? 0,
          player_name: injury.playerName,
          team_id: numberOrNull(team.id) ?? 0,
          team: team.abbr,
          status: injury.status,
          description: injury.description,
          last_updated: injury.lastUpdated
        }));
      })
    )
  ).flat();

  return {
    lineups,
    injuries,
    weatherRows,
    umpires,
    parsedGames,
    matchedGames: matchedGames.length
  };
}
