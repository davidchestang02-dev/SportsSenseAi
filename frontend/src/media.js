const SPORTS_SENSE_BRAND = {
  abbreviation: "SSA",
  color: "#004A99",
  alternateColor: "#7A8BA3",
  logo: "/favicon.svg",
  darkLogo: "/favicon.svg"
};

function initialsFromName(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function mlbHeadshotUrl(playerId) {
  if (!playerId) {
    return "";
  }

  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_360,q_auto:best/v1/people/${playerId}/headshot/67/current`;
}

export function getTeamBrand(team) {
  if (typeof team === "string" && team === "SportsSenseAi") {
    return SPORTS_SENSE_BRAND;
  }

  if (!team) {
    return {
      abbreviation: "MLB",
      color: "#004A99",
      alternateColor: "#7A8BA3",
      logo: "",
      darkLogo: ""
    };
  }

  if (typeof team === "object") {
    const label = team.abbreviation || team.shortName || team.name || team.displayName || "";
    const brand = team.brand || {};

    return {
      abbreviation: brand.abbreviation || label || initialsFromName(team.name || team.displayName),
      color: brand.color || "#004A99",
      alternateColor: brand.alternateColor || "#7A8BA3",
      logo: brand.logo || brand.scoreboardLogo || "",
      darkLogo: brand.darkLogo || brand.logo || ""
    };
  }

  return {
    abbreviation: initialsFromName(team),
    color: "#004A99",
    alternateColor: "#7A8BA3",
    logo: "",
    darkLogo: ""
  };
}

export function getTeamLogoUrl(team) {
  return getTeamBrand(team).logo || "";
}

export function getTeamLabel(team) {
  if (typeof team === "string") {
    return team;
  }

  return team?.name || team?.displayName || team?.shortName || team?.abbreviation || "Team";
}

export function getPlayerHeadshotUrl(player) {
  return player?.headshotUrl || player?.headshot?.href || player?.headshot || mlbHeadshotUrl(player?.id || player?.playerId || player?.player_id);
}

export function playerInitials(name) {
  return String(name || "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
