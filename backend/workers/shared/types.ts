export interface Env {
  AI?: unknown;
  AUTH_SECRET?: string;
  CF_AIG_TOKEN?: string;
  DB?: D1Database;
  MLB_BUCKET?: R2Bucket;
  OPENAI_MODEL?: string;
  SSA_ALLOWED_ORIGINS?: string;
  SSA_BILLING_BYPASS?: string;
  SSA_CF_AIG_TOKEN?: string;
  SSA_CF_AIG_BYOK_ALIAS?: string;
  SSA_DEFAULT_BANKROLL?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}

export type League = "MLB";

export interface NormalizedOddsPoint {
  line: number | null;
  odds: number | null;
}

export interface NormalizedMoneylineSide {
  open: number | null;
  close: number | null;
  current: number | null;
  isFavorite: boolean;
  isUnderdog: boolean;
}

export interface NormalizedBookProvider {
  name: string;
  id: string | null;
  logo: {
    light: string | null;
    dark: string | null;
  };
  deepLink: string | null;
}

export interface NormalizedGameOdds {
  gameId: string;
  provider: NormalizedBookProvider | null;
  moneyline: {
    home: NormalizedMoneylineSide;
    away: NormalizedMoneylineSide;
  };
  spread: {
    home: {
      open: NormalizedOddsPoint;
      close: NormalizedOddsPoint;
      current: NormalizedOddsPoint;
    };
    away: {
      open: NormalizedOddsPoint;
      close: NormalizedOddsPoint;
      current: NormalizedOddsPoint;
    };
  };
  total: {
    over: {
      open: NormalizedOddsPoint;
      close: NormalizedOddsPoint;
      current: NormalizedOddsPoint;
    };
    under: {
      open: NormalizedOddsPoint;
      close: NormalizedOddsPoint;
      current: NormalizedOddsPoint;
    };
  };
  favorite: string | null;
  underdog: string | null;
  lastUpdated: string | null;
}

export interface NormalizedGameStream {
  isLive: boolean;
  isReplayAvailable: boolean;
  requires: {
    espnPlus: boolean;
    cableLogin: boolean;
  };
  links: {
    web: string | null;
    mobile: string | null;
  };
  broadcasts: Array<{
    name: string;
    type: string;
    isNational: boolean;
    slug: string | null;
  }>;
}

export interface NormalizedGameTeam {
  id: string;
  name: string;
  abbreviation: string;
  score: number | null;
  record: string | null;
  logo: string | null;
  logoDark: string | null;
  color: string | null;
  alternateColor: string | null;
}

export interface NormalizedScheduledGame {
  league: League;
  gameId: string;
  status: "SCHEDULED" | "IN_PROGRESS" | "FINAL" | "UNKNOWN";
  startTime: string | null;
  summary: string | null;
  period: number | null;
  location: string | null;
  teams: {
    home: NormalizedGameTeam;
    away: NormalizedGameTeam;
  };
  odds: NormalizedGameOdds | null;
  stream: NormalizedGameStream;
  books?: UnifiedGameOddsBook[];
}

export interface NormalizedProbablePitcher {
  id: string | null;
  name: string | null;
  headshot: string | null;
}

export interface NormalizedPregameGame extends NormalizedScheduledGame {
  season: number | null;
  seasonType: string | null;
  venue: {
    name: string | null;
    city: string | null;
    state: string | null;
  };
  probablePitchers: {
    home: NormalizedProbablePitcher | null;
    away: NormalizedProbablePitcher | null;
  };
  updatedAt: string | null;
  payload?: Record<string, unknown>;
}

export interface NormalizedPitcherSplit {
  season: number;
  playerId: string;
  splitCode: string;
  splitLabel: string | null;
  gp: number | null;
  ip: number | null;
  h: number | null;
  er: number | null;
  hr: number | null;
  bb: number | null;
  k: number | null;
  era: number | null;
  whip: number | null;
  k9: number | null;
  bb9: number | null;
  hr9: number | null;
  kbb: number | null;
  split: Record<string, unknown>;
}

export interface NormalizedPitcherStats {
  season: number;
  espnPlayerId: string;
  name: string;
  teamId: string | null;
  teamAbbr: string | null;
  teamName: string | null;
  pos: string | null;
  jersey: string | null;
  status: string | null;
  headshotUrl: string | null;
  throws: string | null;
  gp: number | null;
  gs: number | null;
  qs: number | null;
  w: number | null;
  l: number | null;
  sv: number | null;
  hld: number | null;
  ip: number | null;
  h: number | null;
  er: number | null;
  hr: number | null;
  bb: number | null;
  k: number | null;
  era: number | null;
  whip: number | null;
  k9: number | null;
  bb9: number | null;
  hr9: number | null;
  kbb: number | null;
  war: number | null;
  model: {
    kPct: number | null;
    bbPct: number | null;
    fip: number | null;
  };
  splits: NormalizedPitcherSplit[];
  raw?: Record<string, unknown>;
}

export interface StatcastHitter {
  playerId: number | null;
  name: string;
  team: string;
  bats: string | null;
  pa: number | null;
  xwOBA: number | null;
  xBA: number | null;
  xSLG: number | null;
  hardHitPct: number | null;
  avgEV: number | null;
  avgLA: number | null;
  barrelPct: number | null;
}

export interface StatcastPitcher {
  playerId: number | null;
  name: string;
  team: string;
  throws: string | null;
  ip: number | null;
  xERA: number | null;
  xwOBA: number | null;
  kPct: number | null;
  bbPct: number | null;
  barrelPctAllowed: number | null;
  avgEVAllowed: number | null;
  pitchMix: Record<string, number>;
}

export interface StatcastPreview {
  gameId: string;
  gamePk: number | null;
  date: string;
  homeTeam: string;
  awayTeam: string;
  hittersHome: StatcastHitter[];
  hittersAway: StatcastHitter[];
  pitcherHome: StatcastPitcher | null;
  pitcherAway: StatcastPitcher | null;
  raw?: Record<string, unknown>;
}

export interface NormalizedWeatherGame {
  gameId: string;
  date: string;
  awayTeam: string;
  homeTeam: string;
  park: string | null;
  city: string | null;
  state: string | null;
  firstPitchLocal: string | null;
  isDome: boolean;
  roofStatus: "open" | "closed" | "unknown";
  stoplight: "green" | "yellow" | "orange" | "red";
  environment: {
    runEnvIndex: number | null;
    hrEnvIndex: number | null;
    evBoostPct: number | null;
    babipBoostPct: number | null;
  };
  hourly: Array<{
    timeLabel: string;
    tempF: number | null;
    conditions: string | null;
    windSpeed: number | null;
    windDirDeg: number | null;
    precipProb: number | null;
    cloudCover: number | null;
    source: string;
  }>;
}

export interface UnifiedGameOddsBook {
  book: string;
  source: string;
  updatedAt: string | null;
  teams: {
    home: string | null;
    away: string | null;
  };
  moneyline: {
    home: number | null;
    away: number | null;
  };
  spread: {
    line: number | null;
    homeOdds: number | null;
    awayOdds: number | null;
  };
  total: {
    line: number | null;
    overOdds: number | null;
    underOdds: number | null;
  };
  payload?: Record<string, unknown>;
}

export interface NormalizedGamecastPlay {
  id: string;
  sequence: number;
  inning: number | null;
  half: string | null;
  outsBefore: number | null;
  outsAfter: number | null;
  ballsBefore: number | null;
  strikesBefore: number | null;
  result: {
    type: string | null;
    description: string | null;
    rbi: number | null;
    runsScored: number | null;
  };
  runners: Array<Record<string, unknown>>;
  winProbability: {
    home: number | null;
    away: number | null;
  };
  timestamp: string | null;
  batter: {
    id: string | null;
    name: string | null;
  } | null;
  pitcher: {
    id: string | null;
    name: string | null;
  } | null;
}

export interface NormalizedGamecast {
  gameId: string;
  league: League;
  status: {
    state: "PRE" | "IN_PROGRESS" | "FINAL";
    detail: string;
    progress: {
      inning: number | null;
      half: string | null;
      outs: number | null;
      balls: number | null;
      strikes: number | null;
      pitchCount: number | null;
    };
  };
  teams: {
    away: NormalizedGameTeam;
    home: NormalizedGameTeam;
  };
  scoreByInning: {
    away: Array<number | null>;
    home: Array<number | null>;
  };
  situation: {
    inning: number | null;
    half: string | null;
    outs: number | null;
    balls: number | null;
    strikes: number | null;
    onBase: {
      first: boolean;
      second: boolean;
      third: boolean;
    };
    description: string | null;
  };
  currentMatchup: {
    batter: Record<string, unknown> | null;
    pitcher: Record<string, unknown> | null;
  };
  plays: NormalizedGamecastPlay[];
  boxscore: {
    away: Record<string, unknown>;
    home: Record<string, unknown>;
  };
  odds: {
    books: UnifiedGameOddsBook[];
    preferredBook: UnifiedGameOddsBook | null;
  };
  meta: {
    venue: string | null;
    city: string | null;
    startTime: string | null;
    tv: string[];
    lastUpdated: string | null;
  };
}

export type ProjectionType = "batter" | "pitcher";

export interface ProjectionRow {
  date: string;
  game_id: string;
  player_id: number;
  player_name: string;
  type: ProjectionType;
  team: string;
  team_id: number;
  opp_team: string;
  opp_team_id: number;
  batting_order: number | null;
  p_single: number;
  p_double: number;
  p_triple: number;
  p_hr: number;
  p_bb: number;
  p_k: number;
  P_hits_1p: number;
  P_tb_2p: number;
  P_runs_1p: number;
  P_rbis_1p: number;
  P_hrh_2p: number;
  k_proj: number | null;
  er_proj: number | null;
  simpleScore: number;
  advancedScore: number;
  compositeScore: number;
  tier: string;
  weather_desc: string;
  wind: number;
  temp: number;
  stadium_lat: number | null;
  stadium_lon: number | null;
  game_confidence: number;
  park_factor: number;
  opp_k_rate: number;
  opp_bb_rate: number;
  opp_hr9: number;
  team_obp7: number;
  team_hh7: number;
  team_runs7: number;
  bats: string;
  opp_throws: string;
  lineup_status: string;
  injury_status: string;
}

export interface LineupRow {
  date: string;
  game_id: string;
  team_id: number;
  team: string;
  player_id: number;
  player_name: string;
  batting_order: number;
  confirmed: boolean;
  status: string;
}

export interface InjuryRow {
  player_id: number;
  player_name: string;
  team_id: number;
  team: string;
  status: string;
  description: string;
  last_updated: string;
}

export interface GameContextRow {
  date: string;
  game_id: string;
  away_team: string;
  away_team_id: number;
  home_team: string;
  home_team_id: number;
  weather_desc: string;
  temp: number;
  wind: number;
  park_name: string;
  park_factor: number;
  umpire_name: string;
  run_environment: number;
  bullpen_edge: number;
  confidence: number;
}

export interface MarketRow {
  date: string;
  game_id: string;
  player_id: number;
  player_name: string;
  team: string;
  prop_type: string;
  fair_probability: number;
  fair_american: number;
  posted_american: number;
  best_book: string;
  edge: number;
  confidence: number;
}

export interface CalibrationRow {
  date: string;
  prop_type: string;
  bucket: number;
  proj_avg: number;
  actual_avg: number;
  count: number;
}

export interface LiveSnapshot {
  game_id: string;
  inning: number;
  inning_half: "Top" | "Bottom";
  home_score: number;
  away_score: number;
  win_probability_home: number;
  last_update: string;
  outs: number;
  balls: number;
  strikes: number;
}

export interface PortfolioBet {
  player_id: number;
  player_name: string;
  prop_type: string;
  fair_probability: number;
  posted_american: number;
  confidence: number;
  correlation_group?: string;
}

export interface PortfolioRecommendation extends PortfolioBet {
  edge: number;
  decimal_odds: number;
  kelly_fraction: number;
  recommended_stake: number;
  capped_stake: number;
}

export interface AutoBetSlip {
  book: string;
  player_name: string;
  prop_type: string;
  odds: number;
  stake: number;
  edge: number;
  confidence?: number;
}
