CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  tier TEXT NOT NULL,
  status TEXT NOT NULL,
  renews_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mlb_projections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  game_id TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  type TEXT NOT NULL,
  team TEXT NOT NULL,
  team_id INTEGER NOT NULL,
  opp_team TEXT NOT NULL,
  opp_team_id INTEGER NOT NULL,
  batting_order INTEGER,
  p_single REAL DEFAULT 0,
  p_double REAL DEFAULT 0,
  p_triple REAL DEFAULT 0,
  p_hr REAL DEFAULT 0,
  p_bb REAL DEFAULT 0,
  p_k REAL DEFAULT 0,
  P_hits_1p REAL DEFAULT 0,
  P_tb_2p REAL DEFAULT 0,
  P_runs_1p REAL DEFAULT 0,
  P_rbis_1p REAL DEFAULT 0,
  P_hrh_2p REAL DEFAULT 0,
  k_proj REAL DEFAULT 0,
  er_proj REAL DEFAULT 0,
  simpleScore REAL DEFAULT 0,
  advancedScore REAL DEFAULT 0,
  compositeScore REAL DEFAULT 0,
  tier TEXT DEFAULT 'Neutral',
  weather_desc TEXT DEFAULT '',
  wind REAL DEFAULT 0,
  temp REAL DEFAULT 0,
  stadium_lat REAL,
  stadium_lon REAL,
  game_confidence REAL DEFAULT 0,
  park_factor REAL DEFAULT 100,
  opp_k_rate REAL DEFAULT 0.22,
  opp_bb_rate REAL DEFAULT 0.08,
  opp_hr9 REAL DEFAULT 1.1,
  team_obp7 REAL DEFAULT 0.32,
  team_hh7 REAL DEFAULT 0.38,
  team_runs7 REAL DEFAULT 4.5,
  bats TEXT DEFAULT 'R',
  opp_throws TEXT DEFAULT 'R',
  lineup_status TEXT DEFAULT 'Projected',
  injury_status TEXT DEFAULT 'Healthy'
);

CREATE INDEX IF NOT EXISTS idx_mlb_projections_date ON mlb_projections(date);
CREATE INDEX IF NOT EXISTS idx_mlb_projections_game ON mlb_projections(game_id);
CREATE INDEX IF NOT EXISTS idx_mlb_projections_player ON mlb_projections(player_id);

CREATE TABLE IF NOT EXISTS mlb_actuals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  game_id TEXT NOT NULL,
  player_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  hits INTEGER DEFAULT 0,
  total_bases INTEGER DEFAULT 0,
  runs INTEGER DEFAULT 0,
  rbis INTEGER DEFAULT 0,
  hrh INTEGER DEFAULT 0,
  strikeouts INTEGER DEFAULT 0,
  earned_runs INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mlb_calibration (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  prop_type TEXT NOT NULL,
  bucket REAL NOT NULL,
  proj_avg REAL NOT NULL,
  actual_avg REAL NOT NULL,
  count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS mlb_odds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  game_id TEXT,
  player_id TEXT,
  prop_type TEXT,
  dk REAL,
  fd REAL,
  mgm REAL,
  czr REAL,
  espn REAL,
  best_book TEXT,
  best_odds REAL,
  last_updated TEXT
);

CREATE TABLE IF NOT EXISTS mlb_odds_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT,
  date TEXT,
  game_id TEXT,
  player_id TEXT,
  prop_type TEXT,
  dk REAL,
  fd REAL,
  mgm REAL,
  czr REAL,
  espn REAL
);

CREATE TABLE IF NOT EXISTS mlb_lineups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  game_id TEXT,
  team_id INTEGER,
  team TEXT,
  player_id INTEGER,
  player_name TEXT,
  batting_order INTEGER,
  confirmed INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS mlb_injuries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id INTEGER,
  player_name TEXT,
  team_id INTEGER,
  team TEXT,
  status TEXT,
  description TEXT,
  last_updated TEXT
);

CREATE TABLE IF NOT EXISTS mlb_umpires (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  umpire_id INTEGER,
  name TEXT,
  date TEXT,
  game_id TEXT,
  k_boost REAL,
  bb_boost REAL,
  hr_boost REAL,
  run_boost REAL,
  zone_size REAL,
  consistency REAL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS mlb_weather (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  game_id TEXT,
  temp REAL,
  humidity REAL,
  wind_speed REAL,
  wind_dir REAL,
  air_density REAL,
  hr_boost REAL,
  tb_boost REAL,
  run_boost REAL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS mlb_parks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  park_id INTEGER,
  name TEXT,
  hr_factor_l REAL,
  hr_factor_r REAL,
  double_factor REAL,
  triple_factor REAL,
  run_factor REAL,
  babip_factor REAL,
  foul_factor REAL,
  altitude REAL,
  wall_height REAL,
  wall_distance REAL,
  spray_hr_pull REAL,
  spray_hr_oppo REAL,
  spray_hr_center REAL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS mlb_bullpen (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER,
  date TEXT,
  reliever_id INTEGER,
  name TEXT,
  k_rate REAL,
  bb_rate REAL,
  hr9 REAL,
  xfip REAL,
  gb_rate REAL,
  hard_hit REAL,
  leverage REAL,
  rest_days INTEGER,
  pitches_last3 REAL,
  fatigue REAL,
  availability REAL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS mlb_live (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT,
  game_id TEXT,
  inning INTEGER,
  inning_half TEXT,
  outs INTEGER,
  balls INTEGER,
  strikes INTEGER,
  home_score INTEGER,
  away_score INTEGER,
  pitcher_id INTEGER,
  batter_id INTEGER,
  pitch_type TEXT,
  pitch_speed REAL,
  call TEXT,
  is_in_play INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS mlb_game_context (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  game_id TEXT,
  away_team TEXT,
  away_team_id INTEGER,
  home_team TEXT,
  home_team_id INTEGER,
  weather_desc TEXT,
  temp REAL,
  wind REAL,
  park_name TEXT,
  park_factor REAL,
  umpire_name TEXT,
  run_environment REAL,
  bullpen_edge REAL,
  confidence REAL
);

CREATE TABLE IF NOT EXISTS mlb_market_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  game_id TEXT,
  player_id INTEGER,
  player_name TEXT,
  team TEXT,
  prop_type TEXT,
  fair_probability REAL,
  fair_american REAL,
  posted_american REAL,
  best_book TEXT,
  edge REAL,
  confidence REAL
);

CREATE TABLE IF NOT EXISTS mlb_risk_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  bankroll REAL,
  total_stake REAL,
  avg_edge REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mlb_autobet_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  bankroll REAL,
  total_slips INTEGER,
  total_exposure REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_email TEXT,
  action TEXT,
  entity_type TEXT,
  entity_id TEXT,
  payload TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
