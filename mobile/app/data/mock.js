export const mockSlate = [
  {
    game_id: "401700001",
    matchup: "New York Yankees @ Boston Red Sox",
    top_play: "Aaron Judge",
    weather: "72F, 10 mph out to left",
    confidence: 78.4
  },
  {
    game_id: "401700002",
    matchup: "Los Angeles Dodgers @ San Diego Padres",
    top_play: "Shohei Ohtani",
    weather: "67F, 7 mph in from center",
    confidence: 74.1
  }
];

export const mockMarkets = [
  {
    player_name: "Aaron Judge",
    team: "New York Yankees",
    prop_type: "H+R+RBI 2+",
    posted_american: -118,
    edge: 0.041,
    best_book: "DraftKings"
  },
  {
    player_name: "Juan Soto",
    team: "New York Yankees",
    prop_type: "Hits 1+",
    posted_american: -132,
    edge: 0.028,
    best_book: "FanDuel"
  },
  {
    player_name: "Shohei Ohtani",
    team: "Los Angeles Dodgers",
    prop_type: "TB 2+",
    posted_american: +124,
    edge: 0.036,
    best_book: "BetMGM"
  }
];

export const mockRisk = {
  recommendations: [
    {
      player_name: "Aaron Judge",
      prop_type: "H+R+RBI 2+",
      stake: 20,
      edge: 0.041,
      kelly_fraction: 0.02
    },
    {
      player_name: "Shohei Ohtani",
      prop_type: "TB 2+",
      stake: 18,
      edge: 0.036,
      kelly_fraction: 0.018
    }
  ],
  summary: {
    total_stake: 38,
    avg_edge: 0.0385,
    max_single_bet: 20
  }
};

export const mockAutoBet = {
  total_slips: 2,
  total_exposure: 38,
  slips: [
    {
      player_name: "Aaron Judge",
      market: "H+R+RBI 2+",
      book: "DraftKings",
      odds: -118,
      stake: 20
    },
    {
      player_name: "Shohei Ohtani",
      market: "TB 2+",
      book: "BetMGM",
      odds: +124,
      stake: 18
    }
  ]
};

export const mockHealth = [
  { prop_type: "hrh_2p", bucket: 0.5, actual_avg: 0.52 },
  { prop_type: "hits_1p", bucket: 0.7, actual_avg: 0.68 }
];
