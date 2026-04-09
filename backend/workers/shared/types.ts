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
  SSA_FEATURE_MOCK_MODE?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
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
}
