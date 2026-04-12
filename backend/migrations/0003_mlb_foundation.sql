CREATE TABLE IF NOT EXISTS mlb_pregame_games (
  date TEXT NOT NULL,
  game_id TEXT NOT NULL,
  league TEXT NOT NULL DEFAULT 'MLB',
  start_time TEXT,
  status TEXT,
  summary TEXT,
  season INTEGER,
  season_type TEXT,
  venue_name TEXT,
  venue_city TEXT,
  venue_state TEXT,
  probable_home_pitcher_id TEXT,
  probable_home_pitcher_name TEXT,
  probable_home_pitcher_headshot TEXT,
  probable_away_pitcher_id TEXT,
  probable_away_pitcher_name TEXT,
  probable_away_pitcher_headshot TEXT,
  odds_json TEXT,
  stream_json TEXT,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (date, game_id)
);

CREATE TABLE IF NOT EXISTS mlb_pregame_teams (
  date TEXT NOT NULL,
  game_id TEXT NOT NULL,
  side TEXT NOT NULL,
  team_id TEXT,
  abbreviation TEXT,
  display_name TEXT,
  record_summary TEXT,
  logo TEXT,
  logo_dark TEXT,
  color TEXT,
  alternate_color TEXT,
  score INTEGER,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (date, game_id, side)
);

CREATE TABLE IF NOT EXISTS mlb_pregame_venues (
  date TEXT NOT NULL,
  game_id TEXT NOT NULL,
  venue_name TEXT,
  city TEXT,
  state TEXT,
  roof_type TEXT,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (date, game_id)
);

CREATE INDEX IF NOT EXISTS idx_mlb_pregame_games_date ON mlb_pregame_games(date);
CREATE INDEX IF NOT EXISTS idx_mlb_pregame_teams_date ON mlb_pregame_teams(date);

CREATE TABLE IF NOT EXISTS mlb_pitcher_stats (
  season INTEGER NOT NULL,
  espn_player_id TEXT NOT NULL,
  name TEXT NOT NULL,
  team_id TEXT,
  team_abbr TEXT,
  team_name TEXT,
  pos TEXT,
  jersey TEXT,
  status TEXT,
  headshot_url TEXT,
  throws TEXT,
  gp INTEGER,
  gs INTEGER,
  qs INTEGER,
  w INTEGER,
  l INTEGER,
  sv INTEGER,
  hld INTEGER,
  ip REAL,
  h INTEGER,
  er INTEGER,
  hr INTEGER,
  bb INTEGER,
  k INTEGER,
  era REAL,
  whip REAL,
  k9 REAL,
  bb9 REAL,
  hr9 REAL,
  kbb REAL,
  war REAL,
  splits_json TEXT,
  raw_json TEXT,
  scraped_at TEXT NOT NULL,
  PRIMARY KEY (season, espn_player_id)
);

CREATE TABLE IF NOT EXISTS mlb_pitcher_splits (
  season INTEGER NOT NULL,
  espn_player_id TEXT NOT NULL,
  split_code TEXT NOT NULL,
  split_label TEXT,
  gp INTEGER,
  ip REAL,
  h INTEGER,
  er INTEGER,
  hr INTEGER,
  bb INTEGER,
  k INTEGER,
  era REAL,
  whip REAL,
  k9 REAL,
  bb9 REAL,
  hr9 REAL,
  kbb REAL,
  split_json TEXT NOT NULL,
  scraped_at TEXT NOT NULL,
  PRIMARY KEY (season, espn_player_id, split_code)
);

CREATE INDEX IF NOT EXISTS idx_mlb_pitcher_stats_team ON mlb_pitcher_stats(season, team_abbr);
CREATE INDEX IF NOT EXISTS idx_mlb_pitcher_splits_player ON mlb_pitcher_splits(season, espn_player_id);

CREATE TABLE IF NOT EXISTS mlb_statcast_previews (
  game_id TEXT PRIMARY KEY,
  game_pk INTEGER,
  date TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  summary TEXT,
  preview_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mlb_statcast_previews_date ON mlb_statcast_previews(date);

CREATE TABLE IF NOT EXISTS mlb_game_odds_books (
  date TEXT NOT NULL,
  game_id TEXT NOT NULL,
  book TEXT NOT NULL,
  source TEXT NOT NULL,
  home_team_abbr TEXT,
  away_team_abbr TEXT,
  moneyline_home INTEGER,
  moneyline_away INTEGER,
  spread_line REAL,
  spread_home_odds INTEGER,
  spread_away_odds INTEGER,
  total_line REAL,
  total_over_odds INTEGER,
  total_under_odds INTEGER,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (date, game_id, book)
);

CREATE TABLE IF NOT EXISTS mlb_game_odds_books_history (
  timestamp TEXT NOT NULL,
  date TEXT NOT NULL,
  game_id TEXT NOT NULL,
  book TEXT NOT NULL,
  source TEXT NOT NULL,
  home_team_abbr TEXT,
  away_team_abbr TEXT,
  moneyline_home INTEGER,
  moneyline_away INTEGER,
  spread_line REAL,
  spread_home_odds INTEGER,
  spread_away_odds INTEGER,
  total_line REAL,
  total_over_odds INTEGER,
  total_under_odds INTEGER,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mlb_game_odds_books_date ON mlb_game_odds_books(date, game_id);
CREATE INDEX IF NOT EXISTS idx_mlb_game_odds_books_history_game ON mlb_game_odds_books_history(game_id, timestamp);

CREATE TABLE IF NOT EXISTS mlb_gamecast_state (
  game_id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  status_state TEXT,
  status_detail TEXT,
  period INTEGER,
  half TEXT,
  outs INTEGER,
  balls INTEGER,
  strikes INTEGER,
  home_score INTEGER,
  away_score INTEGER,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mlb_gamecast_plays (
  game_id TEXT NOT NULL,
  play_id TEXT NOT NULL,
  sequence INTEGER,
  inning INTEGER,
  half TEXT,
  description TEXT,
  timestamp TEXT,
  payload_json TEXT NOT NULL,
  PRIMARY KEY (game_id, play_id)
);

CREATE INDEX IF NOT EXISTS idx_mlb_gamecast_state_date ON mlb_gamecast_state(date);
CREATE INDEX IF NOT EXISTS idx_mlb_gamecast_plays_game ON mlb_gamecast_plays(game_id, sequence);
