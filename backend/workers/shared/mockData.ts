import type {
  AutoBetSlip,
  CalibrationRow,
  GameContextRow,
  InjuryRow,
  LineupRow,
  LiveSnapshot,
  MarketRow,
  PortfolioBet,
  PortfolioRecommendation,
  ProjectionRow
} from "./types";
import { americanFromProbability, clamp, decimalFromAmerican, pickTop, probabilityFromAmerican, round } from "./utils";

type GameSeed = {
  game_id: string;
  away_team: string;
  away_team_id: number;
  home_team: string;
  home_team_id: number;
  park_name: string;
  park_factor: number;
  weather_desc: string;
  temp: number;
  wind: number;
  stadium_lat: number;
  stadium_lon: number;
  umpire_name: string;
  bullpen_edge: number;
  confidence: number;
};

type PlayerSeed = {
  player_id: number;
  player_name: string;
  type: "batter" | "pitcher";
  team: "away" | "home";
  game_slot: number;
  batting_order: number | null;
  bats: string;
  opp_throws: string;
  talent: number;
  injury_status?: string;
};

const GAME_SEEDS: GameSeed[] = [
  {
    game_id: "401700001",
    away_team: "New York Yankees",
    away_team_id: 10,
    home_team: "Boston Red Sox",
    home_team_id: 2,
    park_name: "Fenway Park",
    park_factor: 104,
    weather_desc: "72F, 10 mph out to left",
    temp: 72,
    wind: 10,
    stadium_lat: 42.3467,
    stadium_lon: -71.0972,
    umpire_name: "Tripp Gibson",
    bullpen_edge: 1.8,
    confidence: 74
  },
  {
    game_id: "401700002",
    away_team: "Los Angeles Dodgers",
    away_team_id: 19,
    home_team: "San Diego Padres",
    home_team_id: 25,
    park_name: "Petco Park",
    park_factor: 97,
    weather_desc: "67F, 7 mph in from center",
    temp: 67,
    wind: 7,
    stadium_lat: 32.7073,
    stadium_lon: -117.1566,
    umpire_name: "Alan Porter",
    bullpen_edge: -0.4,
    confidence: 69
  }
];

const PLAYER_SEEDS: PlayerSeed[] = [
  { player_id: 1001, player_name: "Juan Soto", type: "batter", team: "away", game_slot: 0, batting_order: 2, bats: "L", opp_throws: "R", talent: 0.92 },
  { player_id: 1002, player_name: "Aaron Judge", type: "batter", team: "away", game_slot: 0, batting_order: 3, bats: "R", opp_throws: "R", talent: 0.98 },
  { player_id: 1003, player_name: "Jazz Chisholm Jr.", type: "batter", team: "away", game_slot: 0, batting_order: 5, bats: "L", opp_throws: "R", talent: 0.8 },
  { player_id: 1004, player_name: "Gerrit Cole", type: "pitcher", team: "away", game_slot: 0, batting_order: null, bats: "R", opp_throws: "L", talent: 0.95 },
  { player_id: 2001, player_name: "Jarren Duran", type: "batter", team: "home", game_slot: 0, batting_order: 1, bats: "L", opp_throws: "R", talent: 0.83 },
  { player_id: 2002, player_name: "Rafael Devers", type: "batter", team: "home", game_slot: 0, batting_order: 3, bats: "L", opp_throws: "R", talent: 0.88 },
  { player_id: 2003, player_name: "Triston Casas", type: "batter", team: "home", game_slot: 0, batting_order: 4, bats: "L", opp_throws: "R", talent: 0.79, injury_status: "Questionable" },
  { player_id: 2004, player_name: "Brayan Bello", type: "pitcher", team: "home", game_slot: 0, batting_order: null, bats: "R", opp_throws: "R", talent: 0.74 },
  { player_id: 3001, player_name: "Mookie Betts", type: "batter", team: "away", game_slot: 1, batting_order: 1, bats: "R", opp_throws: "R", talent: 0.9 },
  { player_id: 3002, player_name: "Shohei Ohtani", type: "batter", team: "away", game_slot: 1, batting_order: 2, bats: "L", opp_throws: "R", talent: 0.99 },
  { player_id: 3003, player_name: "Freddie Freeman", type: "batter", team: "away", game_slot: 1, batting_order: 3, bats: "L", opp_throws: "R", talent: 0.91 },
  { player_id: 3004, player_name: "Tyler Glasnow", type: "pitcher", team: "away", game_slot: 1, batting_order: null, bats: "R", opp_throws: "R", talent: 0.89 },
  { player_id: 4001, player_name: "Fernando Tatis Jr.", type: "batter", team: "home", game_slot: 1, batting_order: 1, bats: "R", opp_throws: "R", talent: 0.87 },
  { player_id: 4002, player_name: "Manny Machado", type: "batter", team: "home", game_slot: 1, batting_order: 3, bats: "R", opp_throws: "R", talent: 0.82 },
  { player_id: 4003, player_name: "Jackson Merrill", type: "batter", team: "home", game_slot: 1, batting_order: 5, bats: "L", opp_throws: "R", talent: 0.77 },
  { player_id: 4004, player_name: "Yu Darvish", type: "pitcher", team: "home", game_slot: 1, batting_order: null, bats: "R", opp_throws: "R", talent: 0.84 }
];

function tier(score: number): string {
  if (score >= 90) return "Smash";
  if (score >= 80) return "Strong";
  if (score >= 65) return "Playable";
  if (score >= 50) return "Neutral";
  return "Avoid";
}

export function getMockSlate(date: string): ProjectionRow[] {
  return GAME_SEEDS.flatMap((game, gameIndex) =>
    PLAYER_SEEDS.filter((seed) => seed.game_slot === gameIndex).map((seed, playerIndex) => {
      const isAway = seed.team === "away";
      const team = isAway ? game.away_team : game.home_team;
      const teamId = isAway ? game.away_team_id : game.home_team_id;
      const oppTeam = isAway ? game.home_team : game.away_team;
      const oppTeamId = isAway ? game.home_team_id : game.away_team_id;
      const parkBoost = (game.park_factor - 100) * 0.003;
      const tempBoost = (game.temp - 68) * 0.002;
      const orderBoost = seed.batting_order ? (6 - Math.min(seed.batting_order, 6)) * 0.01 : 0;
      const skill = seed.talent + gameIndex * 0.01 - playerIndex * 0.001;

      if (seed.type === "pitcher") {
        const kProj = round(4.7 + skill * 4.2 + gameIndex * 0.2, 2);
        const erProj = round(clamp(3.8 - skill * 1.6 + gameIndex * 0.15, 1.7, 4.4), 2);
        const simpleScore = round(kProj * 10 - erProj * 5, 1);
        const advancedScore = round(simpleScore + (100 - game.park_factor) * 0.25 + game.bullpen_edge * 2, 1);
        const compositeScore = round(simpleScore * 0.45 + advancedScore * 0.55, 1);

        return {
          date,
          game_id: game.game_id,
          player_id: seed.player_id + gameIndex * 100,
          player_name: seed.player_name,
          type: seed.type,
          team,
          team_id: teamId,
          opp_team: oppTeam,
          opp_team_id: oppTeamId,
          batting_order: null,
          p_single: 0,
          p_double: 0,
          p_triple: 0,
          p_hr: 0,
          p_bb: round(0.06 + (1 - seed.talent) * 0.04, 3),
          p_k: round(0.22 + seed.talent * 0.1, 3),
          P_hits_1p: 0,
          P_tb_2p: 0,
          P_runs_1p: 0,
          P_rbis_1p: 0,
          P_hrh_2p: 0,
          k_proj: kProj,
          er_proj: erProj,
          simpleScore,
          advancedScore,
          compositeScore,
          tier: tier(compositeScore),
          weather_desc: game.weather_desc,
          wind: game.wind,
          temp: game.temp,
          stadium_lat: game.stadium_lat,
          stadium_lon: game.stadium_lon,
          game_confidence: game.confidence,
          park_factor: game.park_factor,
          opp_k_rate: 0.24,
          opp_bb_rate: 0.08,
          opp_hr9: 1.1,
          team_obp7: 0.328,
          team_hh7: 0.388,
          team_runs7: 4.8,
          bats: seed.bats,
          opp_throws: seed.opp_throws,
          lineup_status: "Projected",
          injury_status: seed.injury_status || "Healthy"
        };
      }

      const pSingle = round(clamp(0.12 + skill * 0.08 + orderBoost + parkBoost + tempBoost, 0.11, 0.29), 3);
      const pDouble = round(clamp(0.04 + skill * 0.03 + parkBoost * 0.6, 0.03, 0.09), 3);
      const pTriple = round(clamp(0.004 + skill * 0.005, 0.003, 0.02), 3);
      const pHr = round(clamp(0.025 + skill * 0.04 + parkBoost * 0.7, 0.02, 0.09), 3);
      const pBb = round(clamp(0.07 + skill * 0.02, 0.05, 0.14), 3);
      const pK = round(clamp(0.18 + (1 - skill) * 0.12, 0.13, 0.31), 3);
      const hits1 = round(clamp(0.46 + skill * 0.26 + parkBoost + orderBoost, 0.36, 0.88), 3);
      const tb2 = round(clamp(0.28 + skill * 0.29 + parkBoost + tempBoost, 0.2, 0.78), 3);
      const runs1 = round(clamp(0.24 + skill * 0.18 + orderBoost, 0.18, 0.62), 3);
      const rbis1 = round(clamp(0.22 + skill * 0.18 + orderBoost, 0.18, 0.62), 3);
      const hrh2 = round(clamp(0.36 + skill * 0.28 + parkBoost + tempBoost + orderBoost, 0.24, 0.86), 3);
      const simpleScore = round(hrh2 * 50 + hits1 * 30 + tb2 * 20, 1);
      const advancedScore = round(
        simpleScore +
          (game.temp >= 70 ? 4 : 1) +
          (game.weather_desc.includes("out") ? 3 : -1) +
          (game.park_factor - 100) * 0.4 +
          (seed.batting_order ? (6 - Math.min(seed.batting_order, 6)) * 1.6 : 0),
        1
      );
      const compositeScore = round(simpleScore * 0.45 + advancedScore * 0.55, 1);

      return {
        date,
        game_id: game.game_id,
        player_id: seed.player_id + gameIndex * 100,
        player_name: seed.player_name,
        type: seed.type,
        team,
        team_id: teamId,
        opp_team: oppTeam,
        opp_team_id: oppTeamId,
        batting_order: seed.batting_order,
        p_single: pSingle,
        p_double: pDouble,
        p_triple: pTriple,
        p_hr: pHr,
        p_bb: pBb,
        p_k: pK,
        P_hits_1p: hits1,
        P_tb_2p: tb2,
        P_runs_1p: runs1,
        P_rbis_1p: rbis1,
        P_hrh_2p: hrh2,
        k_proj: null,
        er_proj: null,
        simpleScore,
        advancedScore,
        compositeScore,
        tier: tier(compositeScore),
        weather_desc: game.weather_desc,
        wind: game.wind,
        temp: game.temp,
        stadium_lat: game.stadium_lat,
        stadium_lon: game.stadium_lon,
        game_confidence: game.confidence,
        park_factor: game.park_factor,
        opp_k_rate: 0.24,
        opp_bb_rate: 0.08,
        opp_hr9: 1.1,
        team_obp7: 0.328,
        team_hh7: 0.388,
        team_runs7: 4.8,
        bats: seed.bats,
        opp_throws: seed.opp_throws,
        lineup_status: "Projected",
        injury_status: seed.injury_status || "Healthy"
      };
    })
  );
}

export function getMockLineups(date: string): { lineups: LineupRow[]; injuries: InjuryRow[] } {
  const slate = getMockSlate(date);
  const lineups = slate
    .filter((row) => row.type === "batter" && row.batting_order)
    .map((row) => ({
      date,
      game_id: row.game_id,
      team_id: row.team_id,
      team: row.team,
      player_id: row.player_id,
      player_name: row.player_name,
      batting_order: row.batting_order || 9,
      confirmed: row.batting_order !== null,
      status: row.lineup_status
    }));

  const injuries = slate
    .filter((row) => row.injury_status !== "Healthy")
    .map((row) => ({
      player_id: row.player_id,
      player_name: row.player_name,
      team_id: row.team_id,
      team: row.team,
      status: row.injury_status,
      description: `${row.player_name} is being monitored pregame.`,
      last_updated: `${date}T11:30:00Z`
    }));

  return { lineups, injuries };
}

export function getMockGameContexts(date: string): GameContextRow[] {
  return GAME_SEEDS.map((game) => ({
    date,
    game_id: game.game_id,
    away_team: game.away_team,
    away_team_id: game.away_team_id,
    home_team: game.home_team,
    home_team_id: game.home_team_id,
    weather_desc: game.weather_desc,
    temp: game.temp,
    wind: game.wind,
    park_name: game.park_name,
    park_factor: game.park_factor,
    umpire_name: game.umpire_name,
    run_environment: round((game.park_factor - 100) * 0.25 + (game.temp - 68) * 0.1 + game.bullpen_edge, 2),
    bullpen_edge: game.bullpen_edge,
    confidence: game.confidence
  }));
}

export function getMockLive(gameId: string): LiveSnapshot {
  const index = Number(gameId.slice(-1)) % 2;
  return {
    game_id: gameId,
    inning: 5 + index,
    inning_half: index === 0 ? "Top" : "Bottom",
    home_score: 2 + index,
    away_score: 3,
    win_probability_home: round(index === 0 ? 0.42 : 0.57, 3),
    last_update: new Date().toISOString(),
    outs: 1 + index,
    balls: 2,
    strikes: 1
  };
}

export function getMockCalibration(date: string): CalibrationRow[] {
  return [0.3, 0.4, 0.5, 0.6, 0.7].flatMap((bucket) => [
    {
      date,
      prop_type: "hrh_2p",
      bucket,
      proj_avg: bucket,
      actual_avg: round(bucket - 0.02 + bucket * 0.03, 3),
      count: 48
    },
    {
      date,
      prop_type: "hits_1p",
      bucket,
      proj_avg: bucket,
      actual_avg: round(bucket + 0.01, 3),
      count: 52
    }
  ]);
}

export function getMockMarkets(date: string): MarketRow[] {
  const books = ["DraftKings", "FanDuel", "BetMGM", "ESPN Bet"];
  return getMockSlate(date)
    .filter((row) => row.type === "batter" && row.compositeScore >= 55)
    .flatMap((row, index) => {
      const propMap = [
        { prop_type: "Hits 1+", probability: row.P_hits_1p },
        { prop_type: "TB 2+", probability: row.P_tb_2p },
        { prop_type: "H+R+RBI 2+", probability: row.P_hrh_2p }
      ];

      return propMap.map((prop, propIndex) => {
        const fair = americanFromProbability(prop.probability);
        const marketShade = 6 + (index % 4) * 4 + propIndex * 3;
        const posted = fair > 0 ? fair + marketShade : fair - marketShade;
        const edge = round(prop.probability - probabilityFromAmerican(posted), 4);
        return {
          date,
          game_id: row.game_id,
          player_id: row.player_id,
          player_name: row.player_name,
          team: row.team,
          prop_type: prop.prop_type,
          fair_probability: prop.probability,
          fair_american: fair,
          posted_american: posted,
          best_book: books[(index + propIndex) % books.length],
          edge,
          confidence: row.compositeScore
        };
      });
    })
    .filter((market) => market.edge > 0.01);
}

export function recommendPortfolio(bets: PortfolioBet[], bankroll: number): PortfolioRecommendation[] {
  return bets.map((bet) => {
    const decimalOdds = decimalFromAmerican(bet.posted_american);
    const edge = round(bet.fair_probability - probabilityFromAmerican(bet.posted_american), 4);
    const b = decimalOdds - 1;
    const rawKelly = b <= 0 ? 0 : (bet.fair_probability * b - (1 - bet.fair_probability)) / b;
    const confidenceFactor = clamp(bet.confidence / 100, 0.4, 1);
    const kellyFraction = round(clamp(rawKelly, 0, 0.08) * confidenceFactor, 4);
    const recommendedStake = round(bankroll * kellyFraction, 2);
    const cappedStake = round(Math.min(recommendedStake, bankroll * 0.02), 2);

    return {
      ...bet,
      edge,
      decimal_odds: decimalOdds,
      kelly_fraction: kellyFraction,
      recommended_stake: recommendedStake,
      capped_stake: cappedStake
    };
  });
}

export function getMockPortfolio(date: string, bankroll = 1000): PortfolioRecommendation[] {
  const candidateBets: PortfolioBet[] = getMockMarkets(date)
    .slice(0, 8)
    .map((market) => ({
      player_id: market.player_id,
      player_name: market.player_name,
      prop_type: market.prop_type,
      fair_probability: market.fair_probability,
      posted_american: market.posted_american,
      confidence: market.confidence,
      correlation_group: `${market.game_id}-${market.team}`
    }));

  return pickTop(recommendPortfolio(candidateBets, bankroll), 5, (item) => item.edge * item.confidence);
}

export function getMockAutoBet(date: string, bankroll = 1000): { slips: AutoBetSlip[]; exposure: number } {
  const slips = getMockPortfolio(date, bankroll).map((bet, index) => ({
    book: ["DraftKings", "FanDuel", "BetMGM"][index % 3],
    player_name: bet.player_name,
    prop_type: bet.prop_type,
    odds: bet.posted_american,
    stake: bet.capped_stake,
    edge: bet.edge
  }));

  return {
    slips,
    exposure: round(slips.reduce((total, slip) => total + slip.stake, 0), 2)
  };
}
