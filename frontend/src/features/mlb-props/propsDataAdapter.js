export const SPORTSBOOK_LABELS = {
  draftkings: "DK",
  fanduel: "FD",
  mgm: "MGM",
  caesars: "CZR",
  betrivers: "BR",
  fanatics: "FN",
  hardrock: "HR",
  thescore: "SCORE",
  circasports: "CIRCA"
};

function countBattingOrderPlayers(value) {
  if (!value) {
    return 0;
  }

  if (Array.isArray(value)) {
    return value.length;
  }

  return String(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean).length;
}

function pickWeatherSnapshot(weatherRows, startTime) {
  if (!Array.isArray(weatherRows) || weatherRows.length === 0) {
    return null;
  }

  const startEpoch = startTime ? Date.parse(startTime) / 1000 : null;
  if (!Number.isFinite(startEpoch)) {
    return weatherRows[0];
  }

  return weatherRows.reduce((closest, row) => {
    if (!closest) {
      return row;
    }

    const rowDelta = Math.abs(Number(row?.dateTimeEpoch || 0) - startEpoch);
    const closestDelta = Math.abs(Number(closest?.dateTimeEpoch || 0) - startEpoch);
    return rowDelta < closestDelta ? row : closest;
  }, null);
}

function buildRankingSummary(rankings) {
  return (rankings || [])
    .slice()
    .sort((left, right) => Number(left?.rank || 999) - Number(right?.rank || 999))
    .slice(0, 3)
    .map((ranking) => ({
      category: ranking.category || "metric",
      split: ranking.split || "season",
      rank: Number(ranking.rank || 0),
      value: ranking.value
    }));
}

function toNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeTeamAbbr(value) {
  const normalized = String(value || "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  const aliases = {
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

function gameMatchupKey(game) {
  return `${normalizeTeamAbbr(game.awayTeam?.abbr)}@${normalizeTeamAbbr(game.homeTeam?.abbr)}`;
}

function propMatchupKey(prop) {
  return `${normalizeTeamAbbr(prop.awayTeamAbbr || prop.opponentAbbr)}@${normalizeTeamAbbr(prop.homeTeamAbbr || prop.teamAbbr)}`;
}

function groupPropsByMatchup(playerProps) {
  return (playerProps || []).reduce((accumulator, prop) => {
    const key =
      prop.gameId && String(prop.gameId).trim()
        ? `game:${prop.gameId}`
        : `matchup:${propMatchupKey(prop)}`;
    const existing = accumulator.get(key) || [];
    existing.push(prop);
    accumulator.set(key, existing);
    return accumulator;
  }, new Map());
}

function buildCatalogRows(props) {
  return (props || []).flatMap((prop) =>
    Object.entries(prop?.sportsbooks || {}).map(([book, market]) => ({
      playerId: prop.playerId,
      playerName: prop.playerName,
      teamAbbr: prop.teamAbbr,
      propType: prop.propType,
      propLabel: prop.propLabel,
      best_book: book,
      line: market?.line ?? null,
      over: market?.over ?? null,
      under: market?.under ?? null,
      edge: Number(prop?.model?.edge || 0),
      over_probability: prop?.model?.overProb ?? null,
      under_probability: prop?.model?.underProb ?? null
    }))
  );
}

function availableBooks(props) {
  return Array.from(new Set((props || []).flatMap((prop) => prop?.sourceBooks || []))).sort();
}

export function buildMlbPropsGames({ bundle, pregameSlate, weatherBoard }) {
  const pregameGames = pregameSlate?.games || [];
  const scheduleGames = bundle?.schedule?.games || [];
  const weatherGames = weatherBoard?.games || [];
  const playerProps = bundle?.playerProps?.props || [];

  if (pregameGames.length === 0 && scheduleGames.length === 0) {
    return [];
  }

  const sourceGames = pregameGames.length > 0 ? pregameGames : scheduleGames;
  const propsByMatchup = groupPropsByMatchup(playerProps);

  return sourceGames.map((game, index) => {
    const weather = weatherGames.find((entry) => String(entry.gameId) === String(game.gameId || game.gamePk)) || null;
    const sourceWeather = pickWeatherSnapshot(game.weatherData, game.gameDate || game.startTime || game.date);
    const weatherHour = weather?.hourly?.[0] || null;

    const normalizedGame = {
      gamePk: Number(game.gamePk || game.gameId || 900000 + index),
      gameId: String(game.gameId || game.gamePk || 900000 + index),
      startTime: game.startTime || game.gameDate || game.date || null,
      awayTeam: {
        id: Number(game.teams?.away?.id || game.awayTeam?.id || game.visitorTeam?.id || 0) || 1000 + index,
        abbr: game.teams?.away?.abbreviation || game.awayTeam?.abbr || game.visitorTeam?.code || "AWY",
        name: game.teams?.away?.name || game.awayTeam?.name || game.visitorTeam?.fullName || "Away Team"
      },
      homeTeam: {
        id: Number(game.teams?.home?.id || game.homeTeam?.id || 0) || 2000 + index,
        abbr: game.teams?.home?.abbreviation || game.homeTeam?.abbr || game.homeTeam?.code || "HME",
        name: game.teams?.home?.name || game.homeTeam?.name || game.homeTeam?.fullName || "Home Team"
      }
    };

    const props =
      propsByMatchup.get(`game:${normalizedGame.gameId}`) ||
      propsByMatchup.get(`matchup:${gameMatchupKey(normalizedGame)}`) ||
      [];
    const marketRows = buildCatalogRows(props);

    return {
      ...normalizedGame,
      probablePitchers: {
        away: {
          id: Number(game.probablePitchers?.away?.id || game.visitorPitcherId || 0) || null,
          name:
            game.probablePitchers?.away?.name ||
            game.probablePitchers?.away?.fullName ||
            `${normalizedGame.awayTeam.abbr} Starter`
        },
        home: {
          id: Number(game.probablePitchers?.home?.id || game.homePitcherId || 0) || null,
          name:
            game.probablePitchers?.home?.name ||
            game.probablePitchers?.home?.fullName ||
            `${normalizedGame.homeTeam.abbr} Starter`
        }
      },
      weather: {
        tempF: toNumberOrNull(sourceWeather?.temp ?? weatherHour?.tempF),
        windSpeed: toNumberOrNull(sourceWeather?.windSpeed ?? weatherHour?.windSpeed),
        windDir: toNumberOrNull(sourceWeather?.windDir ?? weatherHour?.windDirDeg),
        isDome: Boolean(weather?.isDome || /retractable|closed|dome/i.test(String(game?.ballpark?.roofType || weather?.roofStatus || ""))),
        conditions: sourceWeather?.conditions || weatherHour?.conditions || null,
        precipProb: toNumberOrNull(sourceWeather?.precipProb ?? weatherHour?.precipProb)
      },
      ballpark: {
        name: game?.ballpark?.name || game?.venue?.name || null,
        roofType: game?.ballpark?.roofType || (weather?.isDome ? "Dome" : weather?.roofStatus || "Open Air"),
        city: game?.ballpark?.city || game?.venue?.city || null,
        state: game?.ballpark?.stateAbbrev || game?.ballpark?.state || game?.venue?.state || null,
        turfType: game?.ballpark?.turfType || null
      },
      teamRankings: {
        home: buildRankingSummary(game?.homeTeam?.rankings || []),
        away: buildRankingSummary(game?.visitorTeam?.rankings || game?.awayTeam?.rankings || [])
      },
      battingOrders: {
        home: countBattingOrderPlayers(game?.homeBattingOrder),
        away: countBattingOrderPlayers(game?.visitorBattingOrder)
      },
      marketRows,
      marketCount: marketRows.length,
      sourceBooks: availableBooks(props),
      sourceShape: game?.visitorTeam ? "propfinder_like" : "ssa",
      props
    };
  });
}
