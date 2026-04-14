import { execute, queryAll } from "../../shared/db";
import { syncMlbScoreboardOdds } from "../../mlb-schedule/src/index";
import { fetchRotowireLineupGames } from "../../shared/rotowireLineups";
import { jsonWithSourceMeta } from "../../shared/sourceMeta";
import type { Env, NormalizedPlayerProp, NormalizedPlayerPropModel, ProjectionRow } from "../../shared/types";
import { methodNotAllowed, parseDate, round, withError } from "../../shared/utils";

type AnyRecord = Record<string, any>;

type PropBlock = {
  propKey: string;
  propLabel: string;
  rows: AnyRecord[];
};

type LineupHandMap = Map<string, string | null>;

type InferredMatchup = {
  teamAbbr: string;
  opponentAbbr: string | null;
  awayAbbr: string | null;
  homeAbbr: string | null;
  homeAway: "HOME" | "AWAY" | null;
};

type FlattenedPlayerProp = {
  date: string;
  uniquePropId: string;
  gameId: string | null;
  sourceGameId: string | null;
  playerId: number | null;
  playerName: string;
  firstName: string | null;
  lastName: string | null;
  teamAbbr: string;
  opponentAbbr: string | null;
  homeTeamAbbr: string | null;
  awayTeamAbbr: string | null;
  homeAway: "HOME" | "AWAY" | null;
  propKey: string;
  propType: string;
  propLabel: string;
  line: number | null;
  handedness: string | null;
  teamLogo: string | null;
  playerLink: string | null;
  sportsbooks: Record<string, { line: number | null; over: number | null; under: number | null }>;
  sourceBooks: string[];
  raw: Record<string, unknown>;
};

const ROTOWIRE_PLAYER_PROPS_URL = "https://www.rotowire.com/betting/mlb/player-props.php";
const BOOK_ORDER = ["draftkings", "fanduel", "mgm", "caesars", "betrivers", "fanatics", "hardrock", "thescore", "circasports"];

const PROP_MAP: Record<string, { propType: string; propLabel: string }> = {
  strikeouts: { propType: "K", propLabel: "Strikeouts" },
  er: { propType: "ER", propLabel: "Earned Runs" },
  earnedruns: { propType: "ER", propLabel: "Earned Runs" },
  bases: { propType: "TB", propLabel: "Total Bases" },
  totalbases: { propType: "TB", propLabel: "Total Bases" },
  runs: { propType: "RUNS", propLabel: "Runs Scored" },
  hits: { propType: "HITS", propLabel: "Hits" },
  hr: { propType: "HR", propLabel: "Home Runs" },
  homeruns: { propType: "HR", propLabel: "Home Runs" }
};

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
    const trimmed = value.trim();
    if (!trimmed || /^null$/i.test(trimmed) || /^off$/i.test(trimmed)) {
      return null;
    }
    const parsed = Number(trimmed.replace(/[^\d.+-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeName(value: string | null): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function teamAlias(value: string | null | undefined): string {
  const normalized = String(value || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
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

function propMeta(propKey: string, propLabel: string | null) {
  const normalizedKey = String(propKey || "").trim().toLowerCase();
  const compactKey = normalizedKey.replace(/[^a-z]/g, "");
  const mapped = PROP_MAP[normalizedKey] || PROP_MAP[compactKey];
  return {
    propKey: normalizedKey,
    propType: mapped?.propType || normalizedKey.toUpperCase(),
    propLabel: propLabel || mapped?.propLabel || normalizedKey
  };
}

function matchupKey(awayAbbr: string | null, homeAbbr: string | null): string {
  return `${teamAlias(awayAbbr)}@${teamAlias(homeAbbr)}`;
}

function preferredLine(sportsbooks: Record<string, { line: number | null }>): number | null {
  for (const book of BOOK_ORDER) {
    const line = sportsbooks[book]?.line;
    if (line !== null && line !== undefined) {
      return line;
    }
  }

  return null;
}

function keyForHand(teamAbbr: string | null, playerName: string | null): string {
  return `${teamAlias(teamAbbr)}|${normalizeName(playerName)}`;
}

function buildLineupHandMap(lineupGames: Awaited<ReturnType<typeof fetchRotowireLineupGames>>): LineupHandMap {
  const map: LineupHandMap = new Map();

  for (const game of lineupGames) {
    for (const player of game.away.players) {
      map.set(keyForHand(game.away.abbr, player.playerName), player.bats || null);
    }
    for (const player of game.home.players) {
      map.set(keyForHand(game.home.abbr, player.playerName), player.bats || null);
    }
    if (game.away.pitcher?.name) {
      map.set(keyForHand(game.away.abbr, game.away.pitcher.name), game.away.pitcher.throws || null);
    }
    if (game.home.pitcher?.name) {
      map.set(keyForHand(game.home.abbr, game.home.pitcher.name), game.home.pitcher.throws || null);
    }
  }

  return map;
}

function inferMatchup(team: string | null, opponentRaw: string | null): InferredMatchup {
  const teamAbbr = teamAlias(team);
  const opponentText = String(opponentRaw || "").trim().toUpperCase();
  const isAway = opponentText.startsWith("@");
  const opponentAbbr = teamAlias(opponentText.replace(/^@/, ""));

  if (!teamAbbr || !opponentAbbr) {
    return {
      teamAbbr,
      opponentAbbr: opponentAbbr || null,
      awayAbbr: null,
      homeAbbr: null,
      homeAway: null
    };
  }

  return {
    teamAbbr,
    opponentAbbr,
    awayAbbr: isAway ? teamAbbr : opponentAbbr,
    homeAbbr: isAway ? opponentAbbr : teamAbbr,
    homeAway: isAway ? "AWAY" : "HOME"
  };
}

function extractJsonArray(source: string, startIndex: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "[") {
      depth += 1;
      continue;
    }

    if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function parseInlinePropBlocks(html: string): PropBlock[] {
  const blocks: PropBlock[] = [];
  const matches = Array.from(html.matchAll(/const prop = "([^"]+)";/g));

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const start = current.index ?? 0;
    const propKey = current[1];
    const nextStart = matches[index + 1]?.index ?? html.length;
    const blockText = html.slice(start, nextStart);
    const propNameMatch = blockText.match(/const propName = "([^"]+)";/);
    const dataStart = blockText.indexOf("data:");

    if (dataStart >= 0) {
      const arrayStart = blockText.indexOf("[", dataStart);
      if (arrayStart >= 0) {
        const payload = extractJsonArray(blockText, arrayStart);
        if (payload) {
          try {
            const rows = JSON.parse(payload) as AnyRecord[];
            if (Array.isArray(rows)) {
              blocks.push({
                propKey,
                propLabel: propNameMatch?.[1] || propKey,
                rows
              });
            }
          } catch {
            // Ignore malformed blocks so the rest of the page can still sync.
          }
        }
      }
    }
  }

  return blocks;
}

function normalizeBookName(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "betmgm") {
    return "mgm";
  }
  return normalized;
}

function playerIdFromRecord(record: AnyRecord | null | undefined): number | null {
  if (!record || typeof record !== "object") {
    return null;
  }

  return numberOrNull(record.playerId ?? record.player_id ?? record.playerID ?? record.athleteId ?? record.athlete_id ?? record.id);
}

function looksLikeBookMarket(value: unknown): value is AnyRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as AnyRecord;
  return "line" in record || "over" in record || "under" in record || "overOdds" in record || "underOdds" in record || "odds" in record;
}

function collectSportsbooks(row: AnyRecord, propKey: string): Record<string, { line: number | null; over: number | null; under: number | null }> {
  const books: Record<string, { line: number | null; over: number | null; under: number | null }> = {};

  for (const book of BOOK_ORDER) {
    const line = numberOrNull(row[`${book}_${propKey}`]);
    const under = numberOrNull(row[`${book}_${propKey}Under`]);
    const over = numberOrNull(row[`${book}_${propKey}Over`]);
    if (line !== null || under !== null || over !== null) {
      books[book] = { line, under, over };
    }
  }

  return books;
}

function collectNestedSportsbooks(row: AnyRecord): Record<string, { line: number | null; over: number | null; under: number | null }> {
  const books: Record<string, { line: number | null; over: number | null; under: number | null }> = {};

  for (const book of BOOK_ORDER) {
    const market = row[book];
    if (!looksLikeBookMarket(market)) {
      continue;
    }

    books[book] = {
      line: numberOrNull(market.line),
      over: numberOrNull(market.over ?? market.overOdds ?? market.odds),
      under: numberOrNull(market.under ?? market.underOdds)
    };
  }

  return books;
}

function mergeSportsbooks(
  ...sources: Array<Record<string, { line: number | null; over: number | null; under: number | null }>>
): Record<string, { line: number | null; over: number | null; under: number | null }> {
  const merged: Record<string, { line: number | null; over: number | null; under: number | null }> = {};

  for (const source of sources) {
    for (const [book, market] of Object.entries(source || {})) {
      const existing = merged[book] || { line: null, over: null, under: null };
      merged[book] = {
        line: market.line ?? existing.line,
        over: market.over ?? existing.over,
        under: market.under ?? existing.under
      };
    }
  }

  return merged;
}

function hasAnySportsbookData(record: AnyRecord): boolean {
  if (Object.keys(collectNestedSportsbooks(record)).length > 0) {
    return true;
  }

  return Object.keys(record).some((key) => BOOK_ORDER.some((book) => key.startsWith(`${book}_`)));
}

function isPlayerCollectionKey(key: string): boolean {
  return /players|athletes|playerdata|roster/i.test(key);
}

function buildProxyPlayerLookup(batch: AnyRecord): Map<string, AnyRecord> {
  const lookup = new Map<string, AnyRecord>();

  function visit(node: unknown, keyHint = ""): void {
    if (Array.isArray(node)) {
      if (isPlayerCollectionKey(keyHint)) {
        for (const item of node) {
          if (!item || typeof item !== "object" || Array.isArray(item)) {
            continue;
          }
          const playerId = playerIdFromRecord(item as AnyRecord);
          if (playerId === null) {
            continue;
          }
          lookup.set(String(playerId), item as AnyRecord);
        }
        return;
      }

      for (const item of node) {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          visit(item, keyHint);
        }
      }
      return;
    }

    if (!node || typeof node !== "object") {
      return;
    }

    for (const [key, value] of Object.entries(node as AnyRecord)) {
      visit(value, key);
    }
  }

  visit(batch);
  return lookup;
}

function collectProxyRowGroups(batch: AnyRecord): PropBlock[] {
  const groups: PropBlock[] = [];
  const directRows = Array.isArray(batch?.props) ? batch.props : Array.isArray(batch?.data) ? batch.data : null;
  const directPropKey = stringOrNull(batch.prop) || stringOrNull(batch.type) || stringOrNull(batch.propType);

  if (directRows && directPropKey) {
    groups.push({
      propKey: directPropKey,
      propLabel: stringOrNull(batch.propName) || stringOrNull(batch.label) || directPropKey,
      rows: directRows.filter((row) => row && typeof row === "object" && !Array.isArray(row)) as AnyRecord[]
    });
  }

  for (const [key, value] of Object.entries(batch)) {
    if (!Array.isArray(value) || isPlayerCollectionKey(key)) {
      continue;
    }

    const rows = value.filter((row) => row && typeof row === "object" && !Array.isArray(row)) as AnyRecord[];
    if (rows.length === 0) {
      continue;
    }

    if (!rows.some((row) => playerIdFromRecord(row) !== null) || !rows.some((row) => hasAnySportsbookData(row))) {
      continue;
    }

    groups.push({
      propKey: key,
      propLabel: key,
      rows
    });
  }

  return groups;
}

function flattenInlineBlock(
  block: PropBlock,
  date: string,
  scheduleMap: Map<string, string>,
  handMap: LineupHandMap
): FlattenedPlayerProp[] {
  const meta = propMeta(block.propKey, block.propLabel);

  return block.rows
    .map((row) => {
      const matchup = inferMatchup(stringOrNull(row.team), stringOrNull(row.opp));
      const gameId = scheduleMap.get(matchupKey(matchup.awayAbbr, matchup.homeAbbr)) || null;
      const sportsbooks = collectSportsbooks(row, meta.propKey);
      const sourceBooks = Object.keys(sportsbooks);

      if (sourceBooks.length === 0) {
        return null;
      }

      const playerName = stringOrNull(row.name) || [stringOrNull(row.firstName), stringOrNull(row.lastName)].filter(Boolean).join(" ") || "Unknown Player";
      const line = preferredLine(sportsbooks);
      const sourceGameId = stringOrNull(row.gameID);
      const uniquePropId = [gameId || sourceGameId || matchupKey(matchup.awayAbbr, matchup.homeAbbr), stringOrNull(row.playerID) || normalizeName(playerName), meta.propType]
        .filter(Boolean)
        .join("|");

      return {
        date,
        uniquePropId,
        gameId,
        sourceGameId,
        playerId: numberOrNull(row.playerID),
        playerName,
        firstName: stringOrNull(row.firstName),
        lastName: stringOrNull(row.lastName),
        teamAbbr: matchup.teamAbbr,
        opponentAbbr: matchup.opponentAbbr,
        homeTeamAbbr: matchup.homeAbbr,
        awayTeamAbbr: matchup.awayAbbr,
        homeAway: matchup.homeAway,
        propKey: meta.propKey,
        propType: meta.propType,
        propLabel: meta.propLabel,
        line,
        handedness: handMap.get(keyForHand(matchup.teamAbbr, playerName)) || null,
        teamLogo: stringOrNull(row.logo),
        playerLink: stringOrNull(row.playerLink),
        sportsbooks,
        sourceBooks,
        raw: row
      } satisfies FlattenedPlayerProp;
    })
    .filter(Boolean) as FlattenedPlayerProp[];
}

function normalizeProxyBatchRows(
  batch: AnyRecord,
  date: string,
  scheduleMap: Map<string, string>,
  handMap: LineupHandMap
): FlattenedPlayerProp[] {
  const playerLookup = buildProxyPlayerLookup(batch);

  return collectProxyRowGroups(batch)
    .flatMap((group) => {
      const meta = propMeta(group.propKey, group.propLabel);

      return group.rows
        .map((item: AnyRecord) => {
          const playerId = playerIdFromRecord(item);
          const player = playerId !== null ? playerLookup.get(String(playerId)) || null : null;
          const merged = {
            ...(player || {}),
            ...item
          };

          const matchup = inferMatchup(
            stringOrNull(merged.team || merged.teamAbbr),
            stringOrNull(merged.opp || merged.opponent || merged.opponentTeam)
          );
          const sourceGameId = stringOrNull(
            merged.gameID || merged.gameId || merged.gamePk || batch.gameID || batch.gameId || batch.gamePk
          );
          const gameId = scheduleMap.get(matchupKey(matchup.awayAbbr, matchup.homeAbbr)) || sourceGameId;
          const sportsbooks = mergeSportsbooks(collectSportsbooks(merged, group.propKey), collectNestedSportsbooks(merged));
          const sourceBooks = Object.keys(sportsbooks).filter(
            (book) => sportsbooks[book].line !== null || sportsbooks[book].over !== null || sportsbooks[book].under !== null
          );

          if (sourceBooks.length === 0) {
            return null;
          }

          const playerName =
            stringOrNull(merged.playerName || merged.player || merged.name) ||
            [stringOrNull(merged.firstName), stringOrNull(merged.lastName)].filter(Boolean).join(" ") ||
            "Unknown Player";
          const line = preferredLine(sportsbooks);
          const uniquePropId = [gameId || sourceGameId || matchupKey(matchup.awayAbbr, matchup.homeAbbr), playerId || normalizeName(playerName), meta.propType]
            .filter(Boolean)
            .join("|");

          return {
            date,
            uniquePropId,
            gameId,
            sourceGameId,
            playerId,
            playerName,
            firstName: stringOrNull(merged.firstName),
            lastName: stringOrNull(merged.lastName),
            teamAbbr: matchup.teamAbbr || teamAlias(stringOrNull(merged.teamAbbr || merged.team)),
            opponentAbbr: matchup.opponentAbbr,
            homeTeamAbbr: matchup.homeAbbr,
            awayTeamAbbr: matchup.awayAbbr,
            homeAway: matchup.homeAway,
            propKey: meta.propKey,
            propType: meta.propType,
            propLabel: meta.propLabel,
            line,
            handedness: handMap.get(keyForHand(matchup.teamAbbr, playerName)) || null,
            teamLogo: stringOrNull(merged.logo),
            playerLink: stringOrNull(merged.playerLink),
            sportsbooks,
            sourceBooks,
            raw: merged
          } satisfies FlattenedPlayerProp;
        })
        .filter(Boolean) as FlattenedPlayerProp[];
    });
}

function projectionKey(teamAbbr: string | null, playerName: string | null): string {
  return `${teamAlias(teamAbbr)}|${normalizeName(playerName)}`;
}

function factorial(value: number): number {
  if (value <= 1) {
    return 1;
  }

  let result = 1;
  for (let index = 2; index <= value; index += 1) {
    result *= index;
  }
  return result;
}

function poissonAtLeast(mean: number, threshold: number): number {
  const lambda = Math.max(mean, 0.0001);
  const cutoff = Math.max(Math.ceil(threshold), 0);
  let cumulative = 0;

  for (let index = 0; index < cutoff; index += 1) {
    cumulative += (Math.exp(-lambda) * lambda ** index) / factorial(index);
  }

  return Math.max(0, Math.min(1, 1 - cumulative));
}

function solvePoissonMean(targetProbability: number, threshold: number): number | null {
  if (!Number.isFinite(targetProbability) || targetProbability <= 0 || targetProbability >= 1) {
    return null;
  }

  let low = 0.0001;
  let high = Math.max(12, threshold * 4);
  for (let iteration = 0; iteration < 32; iteration += 1) {
    const mid = (low + high) / 2;
    const probability = poissonAtLeast(mid, threshold);
    if (probability < targetProbability) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return round((low + high) / 2, 3);
}

function deriveModel(propType: string, line: number | null, projection: ProjectionRow | null): NormalizedPlayerPropModel | null {
  if (!projection || line === null) {
    return null;
  }

  let mean: number | null = null;

  if (propType === "K") {
    mean = numberOrNull(projection.k_proj);
  } else if (propType === "ER") {
    mean = numberOrNull(projection.er_proj);
  } else if (propType === "RUNS") {
    mean = solvePoissonMean(Number(projection.P_runs_1p || 0), 1);
  } else if (propType === "TB") {
    mean = solvePoissonMean(Number(projection.P_tb_2p || 0), 2);
  } else if (propType === "HITS") {
    mean = solvePoissonMean(Number(projection.P_hits_1p || 0), 1);
  }

  if (mean === null) {
    return null;
  }

  const threshold = Math.floor(line) + 1;
  const overProb = round(poissonAtLeast(mean, threshold), 4);
  return {
    mean,
    overProb,
    underProb: round(1 - overProb, 4),
    edge: round(mean - line, 3)
  };
}

function booksFromRow(row: AnyRecord): Record<string, { line: number | null; over: number | null; under: number | null }> {
  try {
    return JSON.parse(String(row.sportsbooks_json || "{}")) as Record<string, { line: number | null; over: number | null; under: number | null }>;
  } catch {
    return {};
  }
}

function rawFromRow(row: AnyRecord): Record<string, unknown> | undefined {
  try {
    return row.raw_json ? (JSON.parse(String(row.raw_json)) as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function apiPropFromRow(row: AnyRecord, projectionMap: Map<string, ProjectionRow>): NormalizedPlayerProp {
  const sportsbooks = booksFromRow(row);
  const line = numberOrNull(row.consensus_line);
  const projection = projectionMap.get(projectionKey(row.team_abbr, row.player_name)) || null;

  return {
    date: String(row.date),
    gameId: stringOrNull(row.game_id),
    sourceGameId: stringOrNull(row.source_game_id),
    uniquePropId: String(row.unique_prop_id),
    playerId: numberOrNull(row.player_id),
    playerName: String(row.player_name),
    teamAbbr: String(row.team_abbr),
    opponentAbbr: stringOrNull(row.opponent_abbr),
    homeTeamAbbr: stringOrNull(row.home_team_abbr),
    awayTeamAbbr: stringOrNull(row.away_team_abbr),
    homeAway: stringOrNull(row.home_away) as "HOME" | "AWAY" | null,
    propKey: String(row.prop_key),
    propType: String(row.prop_type),
    propLabel: String(row.prop_label),
    line,
    handedness: stringOrNull(row.handedness),
    teamLogo: stringOrNull(row.team_logo),
    playerLink: stringOrNull(row.player_link),
    sportsbooks,
    sourceBooks: String(row.source_books || "")
      .split(",")
      .map((book) => book.trim())
      .filter(Boolean),
    model: deriveModel(String(row.prop_type), line, projection),
    payload: rawFromRow(row)
  };
}

async function fetchRotowirePlayerPropsHtml(date: string): Promise<string> {
  const response = await fetch(`${ROTOWIRE_PLAYER_PROPS_URL}?date=${date}`, {
    headers: {
      Accept: "text/html,application/xhtml+xml"
    }
  });

  if (!response.ok) {
    throw new Error(`RotoWire player props request failed: ${response.status}`);
  }

  return response.text();
}

async function persistPlayerProp(env: Env, prop: FlattenedPlayerProp): Promise<void> {
  const books = prop.sportsbooks;
  const updatedAt = new Date().toISOString();

  await execute(
    env,
    `INSERT OR REPLACE INTO mlb_player_props (
      date, unique_prop_id, game_id, source_game_id, player_id, player_name, first_name, last_name,
      team_abbr, opponent_abbr, home_team_abbr, away_team_abbr, home_away,
      prop_key, prop_type, prop_label, consensus_line, handedness, source_books, team_logo, player_link,
      draftkings_line, draftkings_over, draftkings_under,
      fanduel_line, fanduel_over, fanduel_under,
      mgm_line, mgm_over, mgm_under,
      caesars_line, caesars_over, caesars_under,
      betrivers_line, betrivers_over, betrivers_under,
      fanatics_line, fanatics_over, fanatics_under,
      hardrock_line, hardrock_over, hardrock_under,
      thescore_line, thescore_over, thescore_under,
      circasports_line, circasports_over, circasports_under,
      sportsbooks_json, raw_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
    [
      prop.date,
      prop.uniquePropId,
      prop.gameId,
      prop.sourceGameId,
      prop.playerId,
      prop.playerName,
      prop.firstName,
      prop.lastName,
      prop.teamAbbr,
      prop.opponentAbbr,
      prop.homeTeamAbbr,
      prop.awayTeamAbbr,
      prop.homeAway,
      prop.propKey,
      prop.propType,
      prop.propLabel,
      prop.line,
      prop.handedness,
      prop.sourceBooks.join(","),
      prop.teamLogo,
      prop.playerLink,
      books.draftkings?.line ?? null,
      books.draftkings?.over ?? null,
      books.draftkings?.under ?? null,
      books.fanduel?.line ?? null,
      books.fanduel?.over ?? null,
      books.fanduel?.under ?? null,
      books.mgm?.line ?? null,
      books.mgm?.over ?? null,
      books.mgm?.under ?? null,
      books.caesars?.line ?? null,
      books.caesars?.over ?? null,
      books.caesars?.under ?? null,
      books.betrivers?.line ?? null,
      books.betrivers?.over ?? null,
      books.betrivers?.under ?? null,
      books.fanatics?.line ?? null,
      books.fanatics?.over ?? null,
      books.fanatics?.under ?? null,
      books.hardrock?.line ?? null,
      books.hardrock?.over ?? null,
      books.hardrock?.under ?? null,
      books.thescore?.line ?? null,
      books.thescore?.over ?? null,
      books.thescore?.under ?? null,
      books.circasports?.line ?? null,
      books.circasports?.over ?? null,
      books.circasports?.under ?? null,
      JSON.stringify(prop.sportsbooks),
      JSON.stringify(prop.raw),
      updatedAt
    ]
  );

  await execute(
    env,
    `INSERT INTO mlb_player_props_history (
      timestamp, date, unique_prop_id, game_id, source_game_id, player_id, player_name, team_abbr, prop_type, consensus_line, sportsbooks_json, raw_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
    [
      updatedAt,
      prop.date,
      prop.uniquePropId,
      prop.gameId,
      prop.sourceGameId,
      prop.playerId,
      prop.playerName,
      prop.teamAbbr,
      prop.propType,
      prop.line,
      JSON.stringify(prop.sportsbooks),
      JSON.stringify(prop.raw)
    ]
  );
}

async function loadProjectionMap(env: Env, date: string): Promise<Map<string, ProjectionRow>> {
  const rows = (await queryAll<ProjectionRow>(env, "SELECT * FROM mlb_projections WHERE date = ?", [date])) || [];
  const map = new Map<string, ProjectionRow>();
  for (const row of rows) {
    map.set(projectionKey(row.team, row.player_name), row);
  }
  return map;
}

export async function syncMlbPlayerProps(
  env: Env,
  date: string,
  options: {
    html?: string | null;
    proxyPayload?: unknown;
  } = {}
): Promise<{
  date: string;
  synced: number;
  matchedGames: number;
  unmatchedProps: number;
  propTypes: string[];
  source: "html" | "proxy";
}> {
  const [scheduleSync, lineupGames] = await Promise.all([
    syncMlbScoreboardOdds(env, date).catch(() => null),
    fetchRotowireLineupGames(date).catch(() => [])
  ]);
  const scheduleMap = new Map<string, string>();
  for (const game of scheduleSync?.discoveredGames || []) {
    scheduleMap.set(matchupKey(game.teams.away.abbreviation, game.teams.home.abbreviation), game.gameId);
  }

  const handMap = buildLineupHandMap(lineupGames);
  const proxyPayload = options.proxyPayload;

  const flattened =
    proxyPayload !== undefined && proxyPayload !== null
      ? (Array.isArray(proxyPayload) ? proxyPayload : [proxyPayload]).flatMap((batch) =>
          normalizeProxyBatchRows(batch as AnyRecord, date, scheduleMap, handMap)
        )
      : parseInlinePropBlocks(options.html || (await fetchRotowirePlayerPropsHtml(date))).flatMap((block) =>
          flattenInlineBlock(block, date, scheduleMap, handMap)
        );

  const deduped = Array.from(
    new Map(flattened.map((row) => [row.uniquePropId, row])).values()
  );

  for (const row of deduped) {
    await persistPlayerProp(env, row);
  }

  return {
    date,
    synced: deduped.length,
    matchedGames: deduped.filter((row) => Boolean(row.gameId)).length,
    unmatchedProps: deduped.filter((row) => !row.gameId).length,
    propTypes: Array.from(new Set(deduped.map((row) => row.propType))).sort(),
    source: proxyPayload !== undefined && proxyPayload !== null ? "proxy" : "html"
  };
}

async function loadPlayerProps(env: Env, date: string): Promise<NormalizedPlayerProp[]> {
  const [rows, projectionMap] = await Promise.all([
    queryAll<AnyRecord>(
      env,
      "SELECT * FROM mlb_player_props WHERE date = ? ORDER BY COALESCE(game_id, source_game_id), team_abbr, player_name, prop_type",
      [date]
    ),
    loadProjectionMap(env, date)
  ]);

  return (rows || []).map((row) => apiPropFromRow(row, projectionMap));
}

export async function handlePlayerPropsRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path.startsWith("/admin/mlb/props-sync")) {
    if (request.method !== "GET" && request.method !== "POST") {
      return methodNotAllowed(env);
    }
  } else if (request.method !== "GET") {
    return methodNotAllowed(env);
  }

  try {
    const date = parseDate(url.searchParams.get("date"));
    const refresh = url.searchParams.get("refresh") === "1";

    if (path.startsWith("/admin/mlb/props-sync")) {
      let proxyPayload: unknown = null;
      if (request.method === "POST") {
        try {
          proxyPayload = await request.json();
        } catch {
          proxyPayload = null;
        }
      }

      const result = await syncMlbPlayerProps(env, date, { proxyPayload });
      const props = await loadPlayerProps(env, date);

      return jsonWithSourceMeta(
        request,
        {
          date,
          sync: result,
          props
        },
        {
          route: "/admin/mlb/props-sync",
          source: result.source === "proxy" ? "external_plus_db" : "external_plus_db",
          tables: ["mlb_player_props", "mlb_player_props_history"],
          notes:
            result.source === "proxy"
              ? "Player props were normalized from a posted raw proxy payload and persisted into D1."
              : "Player props were fetched from the RotoWire MLB player-props page, flattened into SQL-ready rows, and persisted into D1.",
          breakdown: {
            synced: result.synced,
            matched_games: result.matchedGames,
            unmatched_props: result.unmatchedProps
          }
        },
        200,
        env
      );
    }

    let props = await loadPlayerProps(env, date);
    let syncSummary: Awaited<ReturnType<typeof syncMlbPlayerProps>> | null = null;
    if (refresh || props.length === 0) {
      syncSummary = await syncMlbPlayerProps(env, date);
      props = await loadPlayerProps(env, date);
    }

    const availableBooks = Array.from(new Set(props.flatMap((prop) => prop.sourceBooks))).sort();
    const availablePropTypes = Array.from(new Set(props.map((prop) => prop.propType))).sort();

    return jsonWithSourceMeta(
      request,
      {
        date,
        props,
        books: availableBooks,
        propTypes: availablePropTypes,
        ingestion: syncSummary
      },
      {
        route: "/props/mlb",
        source: syncSummary ? "external_plus_db" : props.length > 0 ? "db_only" : "empty",
        tables: ["mlb_player_props", "mlb_player_props_history", "mlb_projections"],
        notes:
          props.length > 0
            ? "Player props are served from persisted RotoWire rows and optionally enriched with deterministic model outputs when those rows exist in D1."
            : "No persisted MLB player props were available for the selected date.",
        breakdown: {
          props: props.length,
          books: availableBooks.length,
          prop_types: availablePropTypes.length
        }
      },
      200,
      env
    );
  } catch (error) {
    return withError(error, env);
  }
}
