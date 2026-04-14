export const SPORTSBOOKS = ["draftkings", "fanduel", "betmgm", "prizepicks", "underdog"];

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

export function buildMlbPropsGames({ bundle, pregameSlate, weatherBoard }) {
  const pregameGames = pregameSlate?.games || [];
  const scheduleGames = bundle?.schedule?.games || [];
  const weatherGames = weatherBoard?.games || [];
  const markets = bundle?.markets || [];

  if (pregameGames.length === 0 && scheduleGames.length === 0) {
    return [];
  }

  const sourceGames = pregameGames.length > 0 ? pregameGames : scheduleGames;

  return sourceGames.map((game, index) => {
    const weather = weatherGames.find((entry) => String(entry.gameId) === String(game.gameId || game.gamePk)) || null;
    const sourceWeather = pickWeatherSnapshot(game.weatherData, game.gameDate || game.startTime || game.date);
    const weatherHour = weather?.hourly?.[0] || null;
    const marketRows = markets.filter((market) => String(market?.game_id || "") === String(game.gameId || game.gamePk || ""));

    return {
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
      },
      probablePitchers: {
        away: {
          id: Number(game.probablePitchers?.away?.id || game.visitorPitcherId || 0) || null,
          name:
            game.probablePitchers?.away?.name ||
            game.probablePitchers?.away?.fullName ||
            `${game.teams?.away?.abbreviation || game.awayTeam?.abbr || game.visitorTeam?.code || "Away"} Starter`
        },
        home: {
          id: Number(game.probablePitchers?.home?.id || game.homePitcherId || 0) || null,
          name:
            game.probablePitchers?.home?.name ||
            game.probablePitchers?.home?.fullName ||
            `${game.teams?.home?.abbreviation || game.homeTeam?.abbr || game.homeTeam?.code || "Home"} Starter`
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
      sourceBooks: Array.from(new Set(marketRows.map((market) => market.best_book).filter(Boolean))),
      sourceShape: game?.visitorTeam ? "propfinder_like" : "ssa",
      props: []
    };
  });
}
