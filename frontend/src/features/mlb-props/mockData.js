const SPORTSBOOKS = ["draftkings", "fanduel", "betmgm", "prizepicks", "underdog"];

const TEAM_PLAYER_LIBRARY = {
  ATL: [
    { name: "Ronald Acuna Jr.", handedness: "R", profile: "power" },
    { name: "Matt Olson", handedness: "L", profile: "slug" },
    { name: "Austin Riley", handedness: "R", profile: "contact" }
  ],
  CLE: [
    { name: "Jose Ramirez", handedness: "S", profile: "power" },
    { name: "Steven Kwan", handedness: "L", profile: "contact" },
    { name: "Kyle Manzardo", handedness: "L", profile: "slug" }
  ],
  PHI: [
    { name: "Bryce Harper", handedness: "L", profile: "power" },
    { name: "Trea Turner", handedness: "R", profile: "contact" },
    { name: "Kyle Schwarber", handedness: "L", profile: "slug" }
  ],
  ARI: [
    { name: "Corbin Carroll", handedness: "L", profile: "speed" },
    { name: "Ketel Marte", handedness: "S", profile: "contact" },
    { name: "Eugenio Suarez", handedness: "R", profile: "power" }
  ],
  LAD: [
    { name: "Shohei Ohtani", handedness: "L", profile: "power" },
    { name: "Mookie Betts", handedness: "R", profile: "contact" },
    { name: "Freddie Freeman", handedness: "L", profile: "slug" }
  ],
  SD: [
    { name: "Fernando Tatis Jr.", handedness: "R", profile: "power" },
    { name: "Manny Machado", handedness: "R", profile: "contact" },
    { name: "Jackson Merrill", handedness: "L", profile: "speed" }
  ],
  KC: [
    { name: "Bobby Witt Jr.", handedness: "R", profile: "power" },
    { name: "Vinnie Pasquantino", handedness: "L", profile: "slug" },
    { name: "Salvador Perez", handedness: "R", profile: "contact" }
  ],
  CHW: [
    { name: "Luis Robert Jr.", handedness: "R", profile: "power" },
    { name: "Andrew Benintendi", handedness: "L", profile: "contact" },
    { name: "Andrew Vaughn", handedness: "R", profile: "slug" }
  ]
};

const GENERIC_PLAYER_SEEDS = [
  { suffix: "Lead Bat", handedness: "R", profile: "contact" },
  { suffix: "Middle Order", handedness: "L", profile: "slug" },
  { suffix: "Cleanup", handedness: "R", profile: "power" }
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, digits = 3) {
  const precision = 10 ** digits;
  return Math.round(value * precision) / precision;
}

function teamPlayers(teamAbbr) {
  return TEAM_PLAYER_LIBRARY[teamAbbr] || GENERIC_PLAYER_SEEDS.map((seed) => ({
    name: `${teamAbbr} ${seed.suffix}`,
    handedness: seed.handedness,
    profile: seed.profile
  }));
}

function americanFromProbability(probability) {
  const bounded = clamp(probability, 0.03, 0.97);
  if (bounded >= 0.5) {
    return -Math.round((bounded / (1 - bounded)) * 100);
  }
  return Math.round(((1 - bounded) / bounded) * 100);
}

function buildSportsbookLines(line, overProb, variance = 0, preferredOdds = null) {
  const adjusted = clamp(overProb + variance, 0.08, 0.92);
  const overAmerican = preferredOdds ?? americanFromProbability(adjusted);
  const underAmerican = americanFromProbability(1 - adjusted);
  return {
    draftkings: { over: overAmerican, under: underAmerican },
    fanduel: { over: overAmerican + 5, under: underAmerican - 5 },
    betmgm: { over: overAmerican - 5, under: underAmerican + 5 },
    prizepicks: { line },
    underdog: { line }
  };
}

function buildRecentForm(mean, volatility) {
  return Array.from({ length: 10 }, (_, index) => {
    const wave = Math.sin((index + 1) * 0.9) * volatility;
    return round(clamp(mean + wave, 0, Math.max(mean * 1.8, 1.25)), 2);
  });
}

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

function hitterStatcast(seedIndex, profile) {
  const profileBoost =
    profile === "power" ? { xwOBA: 0.032, xSLG: 0.08, barrel: 0.05, ev: 2.6, la: 5.2 }
    : profile === "slug" ? { xwOBA: 0.018, xSLG: 0.05, barrel: 0.03, ev: 1.8, la: 3.4 }
    : profile === "speed" ? { xwOBA: 0.012, xSLG: 0.025, barrel: 0.01, ev: 0.7, la: 0.8 }
    : { xwOBA: 0.008, xSLG: 0.018, barrel: 0.008, ev: 0.4, la: 0.5 };

  return {
    xwOBA: round(0.332 + seedIndex * 0.012 + profileBoost.xwOBA, 3),
    xBA: round(0.249 + seedIndex * 0.014 + profileBoost.xwOBA * 0.55, 3),
    xSLG: round(0.404 + seedIndex * 0.024 + profileBoost.xSLG, 3),
    hardHitPct: round(0.39 + seedIndex * 0.02 + profileBoost.barrel, 3),
    barrelPct: round(0.07 + seedIndex * 0.012 + profileBoost.barrel, 3),
    avgEV: round(88.2 + seedIndex * 1.4 + profileBoost.ev, 1),
    avgLA: round(10.5 + seedIndex * 1.3 + profileBoost.la, 1)
  };
}

function buildHitterProp({ playerId, playerName, teamAbbr, handedness, propType, line, overProb, edge, statcast, preferredOdds }) {
  const mean =
    propType === "HR"
      ? round(0.14 + statcast.barrelPct * 0.85 + edge * 0.18, 2)
      : propType === "TB"
        ? round(1.08 + overProb * 1.15 + edge * 0.6, 2)
        : round(0.58 + overProb * 0.82 + edge * 0.35, 2);

  return {
    playerId,
    playerName,
    teamAbbr,
    handedness,
    propType,
    line,
    sportsbooks: buildSportsbookLines(line, overProb, 0, preferredOdds),
    model: {
      mean,
      overProb: round(overProb, 2),
      underProb: round(1 - overProb, 2),
      edge: round(edge, 2)
    },
    statcast,
    recentForm: buildRecentForm(mean, propType === "HR" ? 0.12 : 0.26)
  };
}

function buildPitcherProp({ playerId, playerName, teamAbbr, handedness, line, overProb, mean, preferredOdds }) {
  return {
    playerId,
    playerName,
    teamAbbr,
    handedness,
    propType: "K",
    line,
    sportsbooks: buildSportsbookLines(line, overProb, 0, preferredOdds),
    model: {
      mean: round(mean, 2),
      overProb: round(overProb, 2),
      underProb: round(1 - overProb, 2),
      edge: round(mean - line, 2)
    },
    statcast: {
      xwOBA: round(0.262 - (overProb - 0.5) * 0.06, 3),
      xBA: round(0.214 - (overProb - 0.5) * 0.04, 3),
      xSLG: round(0.372 - (overProb - 0.5) * 0.08, 3),
      hardHitPct: round(0.328 - (overProb - 0.5) * 0.05, 3),
      barrelPct: round(0.064 - (overProb - 0.5) * 0.02, 3),
      avgEV: round(87.6 - (overProb - 0.5) * 2.1, 1),
      avgLA: round(9.4 - (overProb - 0.5) * 2.3, 1)
    },
    recentForm: buildRecentForm(mean, 1.1)
  };
}

export const exampleMlbPropsData = {
  games: [
    {
      gamePk: 824938,
      gameId: "401814909",
      startTime: "2026-04-12T23:20:00Z",
      awayTeam: { id: 114, abbr: "CLE", name: "Cleveland Guardians" },
      homeTeam: { id: 144, abbr: "ATL", name: "Atlanta Braves" },
      probablePitchers: {
        away: { id: 676440, name: "Tanner Bibee" },
        home: { id: 519242, name: "Chris Sale" }
      },
      weather: {
        tempF: 72,
        windSpeed: 8,
        windDir: 270,
        isDome: false,
        conditions: "Clear",
        precipProb: 0
      },
      ballpark: {
        name: "Truist Park",
        roofType: "Open Air",
        city: "Atlanta",
        state: "GA",
        turfType: "Grass"
      },
      teamRankings: {
        home: [
          { category: "strikeouts", split: "Season", rank: 7, value: 1321 },
          { category: "strikeouts", split: "vs RHP", rank: 9, value: 882 }
        ],
        away: [
          { category: "strikeouts", split: "Season", rank: 19, value: 1198 },
          { category: "strikeouts", split: "vs LHP", rank: 24, value: 351 }
        ]
      },
      battingOrders: {
        home: 9,
        away: 9
      },
      marketCount: 18,
      props: [
        buildHitterProp({
          playerId: 660670,
          playerName: "Ronald Acuna Jr.",
          teamAbbr: "ATL",
          handedness: "R",
          propType: "HITS",
          line: 0.5,
          overProb: 0.61,
          edge: 0.11,
          statcast: hitterStatcast(2, "power"),
          preferredOdds: -138
        }),
        buildHitterProp({
          playerId: 608070,
          playerName: "Jose Ramirez",
          teamAbbr: "CLE",
          handedness: "S",
          propType: "TB",
          line: 1.5,
          overProb: 0.56,
          edge: 0.18,
          statcast: hitterStatcast(1, "power"),
          preferredOdds: -124
        }),
        buildPitcherProp({
          playerId: 519242,
          playerName: "Chris Sale",
          teamAbbr: "ATL",
          handedness: "L",
          line: 7.5,
          overProb: 0.58,
          mean: 8.1,
          preferredOdds: -128
        })
      ]
    },
    {
      gamePk: 824907,
      gameId: "401814907",
      startTime: "2026-04-12T17:35:00Z",
      awayTeam: { id: 109, abbr: "ARI", name: "Arizona Diamondbacks" },
      homeTeam: { id: 143, abbr: "PHI", name: "Philadelphia Phillies" },
      probablePitchers: {
        away: { id: 32675, name: "Eduardo Rodriguez" },
        home: { id: 33192, name: "Aaron Nola" }
      },
      weather: {
        tempF: 67,
        windSpeed: 11,
        windDir: 210,
        isDome: false,
        conditions: "Partly cloudy",
        precipProb: 12
      },
      ballpark: {
        name: "Citizens Bank Park",
        roofType: "Open Air",
        city: "Philadelphia",
        state: "PA",
        turfType: "Grass"
      },
      teamRankings: {
        home: [
          { category: "strikeouts", split: "Season", rank: 11, value: 1278 },
          { category: "strikeouts", split: "vs LHP", rank: 4, value: 428 }
        ],
        away: [
          { category: "strikeouts", split: "Season", rank: 17, value: 1215 },
          { category: "strikeouts", split: "Away", rank: 13, value: 641 }
        ]
      },
      battingOrders: {
        home: 9,
        away: 9
      },
      marketCount: 16,
      props: [
        buildHitterProp({
          playerId: 30951,
          playerName: "Bryce Harper",
          teamAbbr: "PHI",
          handedness: "L",
          propType: "HR",
          line: 0.5,
          overProb: 0.34,
          edge: 0.08,
          statcast: hitterStatcast(2, "slug"),
          preferredOdds: 198
        }),
        buildHitterProp({
          playerId: 672279,
          playerName: "Corbin Carroll",
          teamAbbr: "ARI",
          handedness: "L",
          propType: "HITS",
          line: 0.5,
          overProb: 0.59,
          edge: 0.09,
          statcast: hitterStatcast(1, "speed"),
          preferredOdds: -132
        }),
        buildPitcherProp({
          playerId: 33192,
          playerName: "Aaron Nola",
          teamAbbr: "PHI",
          handedness: "R",
          line: 6.5,
          overProb: 0.55,
          mean: 7.0,
          preferredOdds: -118
        })
      ]
    }
  ]
};

function matchesTeam(row, team) {
  const teamId = Number(team?.id);
  return (
    String(row?.team || "").toUpperCase() === String(team?.abbr || "").toUpperCase() ||
    String(row?.team || "").toUpperCase() === String(team?.name || "").toUpperCase() ||
    Number(row?.team_id || 0) === teamId
  );
}

function findMatchingMarket(markets, playerName, propType) {
  const normalizedType =
    propType === "HITS" ? "hits"
    : propType === "TB" ? "tb"
    : propType === "HR" ? "hr"
    : "k";

  return (markets || []).find((market) => {
    const marketName = String(market?.player_name || "").toLowerCase();
    const marketType = String(market?.prop_type || "").toLowerCase();
    return marketName === String(playerName || "").toLowerCase() && marketType.includes(normalizedType);
  }) || null;
}

function createPropRowsFromSimulation(game, simPlayers, markets) {
  const homeBatters = simPlayers
    .filter((row) => row?.type !== "pitcher" && matchesTeam(row, game.homeTeam))
    .sort((left, right) => Number(right.compositeScore || 0) - Number(left.compositeScore || 0))
    .slice(0, 2);
  const awayBatters = simPlayers
    .filter((row) => row?.type !== "pitcher" && matchesTeam(row, game.awayTeam))
    .sort((left, right) => Number(right.compositeScore || 0) - Number(left.compositeScore || 0))
    .slice(0, 2);

  const props = [];
  const battingBlueprint = [
    { propType: "HITS", probabilityKey: "P_hits_1p", line: 0.5 },
    { propType: "TB", probabilityKey: "P_tb_2p", line: 1.5 },
    { propType: "HR", probabilityKey: "p_hr", line: 0.5 }
  ];

  [...awayBatters, ...homeBatters].forEach((player, index) => {
    const blueprint = battingBlueprint[index % battingBlueprint.length];
    const probability = clamp(Number(player?.[blueprint.probabilityKey] || 0.5), 0.12, 0.88);
    const edge =
      blueprint.propType === "HR"
        ? clamp((probability - 0.27) * 0.6, -0.2, 0.24)
        : clamp((probability - 0.5) * 0.75, -0.22, 0.28);
    const profile = index % 3 === 0 ? "power" : index % 3 === 1 ? "contact" : "slug";
    const statcast = hitterStatcast(index % 3, profile);
    const market = findMatchingMarket(markets, player?.player_name, blueprint.propType);

    props.push(
      buildHitterProp({
        playerId: Number(player?.player_id || 0) || 100000 + index,
        playerName: String(player?.player_name || "SportsSenseAi Batter"),
        teamAbbr: String(player?.team || "").slice(0, 3).toUpperCase() || game.homeTeam.abbr,
        handedness: player?.bats || "R",
        propType: blueprint.propType,
        line: blueprint.line,
        overProb: probability,
        edge,
        statcast,
        preferredOdds: Number(market?.posted_american || 0) || null
      })
    );
  });

  const homePitcher = simPlayers.find((row) => row?.type === "pitcher" && matchesTeam(row, game.homeTeam));
  const awayPitcher = simPlayers.find((row) => row?.type === "pitcher" && matchesTeam(row, game.awayTeam));

  [awayPitcher, homePitcher].forEach((pitcher, index) => {
    const fallback = index === 0 ? game.probablePitchers.away : game.probablePitchers.home;
    const mean = clamp(Number(pitcher?.k_proj || 5.8 + index * 0.6), 4.5, 10.5);
    const line = Math.max(3.5, Math.round((mean - 0.4) * 2) / 2);
    const overProb = clamp(0.5 + (mean - line) * 0.13, 0.32, 0.72);

    props.push(
      buildPitcherProp({
        playerId: Number(pitcher?.player_id || fallback?.id || 0) || 900000 + index,
        playerName: String(pitcher?.player_name || fallback?.name || "Projected Starter"),
        teamAbbr: index === 0 ? game.awayTeam.abbr : game.homeTeam.abbr,
        handedness: pitcher?.bats || "R",
        line,
        overProb,
        mean,
        preferredOdds: null
      })
    );
  });

  return props.slice(0, 10);
}

function createFallbackProps(game) {
  const awaySeeds = teamPlayers(game.awayTeam.abbr);
  const homeSeeds = teamPlayers(game.homeTeam.abbr);
  const hitters = [
    { player: awaySeeds[0], team: game.awayTeam, seedIndex: 0, line: 0.5, propType: "HITS", overProb: 0.58, edge: 0.1 },
    { player: awaySeeds[1], team: game.awayTeam, seedIndex: 1, line: 1.5, propType: "TB", overProb: 0.55, edge: 0.14 },
    { player: homeSeeds[0], team: game.homeTeam, seedIndex: 2, line: 0.5, propType: "HR", overProb: 0.31, edge: 0.07 },
    { player: homeSeeds[1], team: game.homeTeam, seedIndex: 1, line: 0.5, propType: "HITS", overProb: 0.57, edge: 0.09 }
  ];

  const props = hitters.map((entry, index) =>
    buildHitterProp({
      playerId: 600000 + index + Number(game.gamePk || 0),
      playerName: entry.player.name,
      teamAbbr: entry.team.abbr,
      handedness: entry.player.handedness,
      propType: entry.propType,
      line: entry.line,
      overProb: entry.overProb,
      edge: entry.edge,
      statcast: hitterStatcast(entry.seedIndex, entry.player.profile),
      preferredOdds: null
    })
  );

  props.push(
    buildPitcherProp({
      playerId: Number(game.probablePitchers.home?.id || 0) || Number(game.gamePk || 0) + 700001,
      playerName: game.probablePitchers.home?.name || `${game.homeTeam.abbr} Starter`,
      teamAbbr: game.homeTeam.abbr,
      handedness: "R",
      line: 6.5,
      overProb: 0.54,
      mean: 6.9,
      preferredOdds: null
    }),
    buildPitcherProp({
      playerId: Number(game.probablePitchers.away?.id || 0) || Number(game.gamePk || 0) + 700002,
      playerName: game.probablePitchers.away?.name || `${game.awayTeam.abbr} Starter`,
      teamAbbr: game.awayTeam.abbr,
      handedness: "L",
      line: 5.5,
      overProb: 0.52,
      mean: 5.9,
      preferredOdds: null
    })
  );

  return props;
}

export function buildMlbPropsGames({ bundle, pregameSlate, weatherBoard, includeExampleFallback = false }) {
  const pregameGames = pregameSlate?.games || [];
  const scheduleGames = bundle?.schedule?.games || [];
  const weatherGames = weatherBoard?.games || [];
  const simulationPlayers = bundle?.simulation?.players || [];
  const markets = bundle?.markets || [];

  if (pregameGames.length === 0 && scheduleGames.length === 0) {
    if (!includeExampleFallback) {
      return [];
    }
    return exampleMlbPropsData.games;
  }

  const sourceGames = pregameGames.length > 0 ? pregameGames : scheduleGames;

  return sourceGames.map((game, index) => {
    const weather = weatherGames.find((entry) => String(entry.gameId) === String(game.gameId || game.gamePk)) || null;
    const sourceWeather = pickWeatherSnapshot(game.weatherData, game.gameDate || game.startTime || game.date);
    const weatherHour = weather?.hourly?.[0] || null;
    const contractGame = {
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
          id: Number(game.probablePitchers?.away?.id || game.visitorPitcherId || 0) || 3000 + index,
          name:
            game.probablePitchers?.away?.name ||
            game.probablePitchers?.away?.fullName ||
            `${game.teams?.away?.abbreviation || game.awayTeam?.abbr || game.visitorTeam?.code || "Away"} Starter`
        },
        home: {
          id: Number(game.probablePitchers?.home?.id || game.homePitcherId || 0) || 4000 + index,
          name:
            game.probablePitchers?.home?.name ||
            game.probablePitchers?.home?.fullName ||
            `${game.teams?.home?.abbreviation || game.homeTeam?.abbr || game.homeTeam?.code || "Home"} Starter`
        }
      },
      weather: {
        tempF: Number(sourceWeather?.temp || weatherHour?.tempF || 70),
        windSpeed: Number(sourceWeather?.windSpeed || weatherHour?.windSpeed || 8),
        windDir: Number(sourceWeather?.windDir || weatherHour?.windDirDeg || 225),
        isDome: Boolean(weather?.isDome || /retractable|closed|dome/i.test(String(game?.ballpark?.roofType || ""))),
        conditions: sourceWeather?.conditions || weatherHour?.conditions || null,
        precipProb: Number(sourceWeather?.precipProb ?? weatherHour?.precipProb ?? 0)
      },
      ballpark: {
        name: game?.ballpark?.name || game?.venue?.name || null,
        roofType: game?.ballpark?.roofType || (weather?.isDome ? "Dome" : "Open Air"),
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
      marketCount: Array.isArray(game?.odds) ? game.odds.length : 0,
      sourceShape: game?.visitorTeam ? "propfinder_like" : "ssa"
    };

    const gamePlayers = simulationPlayers.filter((row) => String(row?.game_id || "") === String(contractGame.gameId));
    const props = gamePlayers.length > 0 ? createPropRowsFromSimulation(contractGame, gamePlayers, markets) : createFallbackProps(contractGame);

    return {
      ...contractGame,
      props
    };
  });
}

export { SPORTSBOOKS };
