const TEAM_BRANDS = {
  "New York Yankees": { abbr: "NYY", colors: ["#132448", "#c4ced4"], officialId: 147 },
  "Boston Red Sox": { abbr: "BOS", colors: ["#bd3039", "#0c2340"], officialId: 111 },
  "Los Angeles Dodgers": { abbr: "LAD", colors: ["#005a9c", "#ffffff"], officialId: 119 },
  "San Diego Padres": { abbr: "SD", colors: ["#2f241d", "#ffc425"], officialId: 135 },
  SportsSenseAi: { abbr: "SSA", colors: ["#0c6f77", "#6cd4c6"], officialId: null }
};

const PLAYER_HEADSHOT_IDS = {
  "Juan Soto": 665742,
  "Aaron Judge": 592450,
  "Jazz Chisholm Jr.": 665862,
  "Gerrit Cole": 543037,
  "Jarren Duran": 680776,
  "Rafael Devers": 646240,
  "Triston Casas": 671213,
  "Brayan Bello": 678394,
  "Mookie Betts": 605141,
  "Shohei Ohtani": 660271,
  "Freddie Freeman": 518692,
  "Tyler Glasnow": 607192,
  "Fernando Tatis Jr.": 665487,
  "Manny Machado": 592518,
  "Jackson Merrill": 701538,
  "Yu Darvish": 506433
};

function teamInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

export function getTeamBrand(team) {
  const brand = TEAM_BRANDS[team];
  if (brand) {
    return brand;
  }

  return {
    abbr: teamInitials(team),
    colors: ["#0e3542", "#6a90a5"],
    officialId: null
  };
}

export function getTeamLogoUrl(team) {
  const brand = getTeamBrand(team);
  if (!brand.officialId) {
    return "";
  }
  return `https://www.mlbstatic.com/team-logos/${brand.officialId}.svg`;
}

export function getPlayerHeadshotUrl(player) {
  const officialId = PLAYER_HEADSHOT_IDS[player.player_name] || player.player_id;
  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_180,q_auto:best/v1/people/${officialId}/headshot/67/current`;
}

export function playerInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
