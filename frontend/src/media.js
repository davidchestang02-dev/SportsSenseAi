const SPORTS_SENSE_BRAND = {
  abbreviation: "SSA",
  color: "#4DA3FF",
  alternateColor: "#00D4FF",
  logo: "/brand/growth-connectivity-icon.png",
  darkLogo: "/brand/growth-connectivity-icon.png"
};

function uniqueStrings(values) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );
}

function toNumericId(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? String(Math.trunc(number)) : "";
}

function normalizeTeamAbbreviation(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
}

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

function mlbHeadshotPngUrl(playerId) {
  if (!playerId) {
    return "";
  }

  return `https://img.mlbstatic.com/mlb-photos/image/upload/w_360,q_auto:best/v1/people/${playerId}/headshot/67/current.png`;
}

function espnHeadshotUrl(playerId) {
  if (!playerId) {
    return "";
  }

  return `https://a.espncdn.com/i/headshots/mlb/players/full/${playerId}.png`;
}

function espnTeamLogoUrl(abbreviation, dark = false) {
  const normalized = normalizeTeamAbbreviation(abbreviation).toLowerCase();
  if (!normalized) {
    return "";
  }

  const variant = dark ? "500-dark" : "500";
  return `https://a.espncdn.com/i/teamlogos/mlb/${variant}/scoreboard/${normalized}.png`;
}

function firstLogoHref(logos) {
  if (!Array.isArray(logos)) {
    return "";
  }

  return String(logos.find((logo) => logo?.href)?.href || "");
}

export function getTeamLogoCandidates(team) {
  if (!team) {
    return [];
  }

  if (typeof team === "string") {
    const abbreviation = normalizeTeamAbbreviation(team);
    return uniqueStrings([
      espnTeamLogoUrl(abbreviation),
      espnTeamLogoUrl(abbreviation, true)
    ]);
  }

  const abbreviation = normalizeTeamAbbreviation(
    team.abbreviation ||
      team.abbr ||
      team.shortName ||
      team.shortDisplayName ||
      team.team?.abbreviation ||
      team.currentTeam?.abbreviation ||
      team.brand?.abbreviation
  );

  return uniqueStrings([
    team.logo,
    team.logoDark,
    team.darkLogo,
    team.scoreboardLogo,
    team.brand?.logo,
    team.brand?.darkLogo,
    team.brand?.logoDark,
    team.brand?.scoreboardLogo,
    team.team?.logo,
    team.team?.logoDark,
    team.currentTeam?.logo,
    team.currentTeam?.logoDark,
    team.currentTeam?.brand?.logo,
    team.currentTeam?.brand?.darkLogo,
    firstLogoHref(team.logos),
    firstLogoHref(team.team?.logos),
    firstLogoHref(team.currentTeam?.logos),
    espnTeamLogoUrl(abbreviation),
    espnTeamLogoUrl(abbreviation, true)
  ]);
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
    const logoCandidates = getTeamLogoCandidates(team);

    return {
      abbreviation: brand.abbreviation || label || initialsFromName(team.name || team.displayName),
      color: brand.color || team.color || team.currentTeam?.color || "#1F3150",
      alternateColor: brand.alternateColor || team.alternateColor || team.currentTeam?.alternateColor || "#4DA3FF",
      logo: logoCandidates[0] || "",
      darkLogo: logoCandidates[1] || logoCandidates[0] || ""
    };
  }

  const abbreviation = normalizeTeamAbbreviation(team);
  const logoCandidates = getTeamLogoCandidates(team);

  return {
    abbreviation: abbreviation || initialsFromName(team),
    color: "#1F3150",
    alternateColor: "#4DA3FF",
    logo: logoCandidates[0] || "",
    darkLogo: logoCandidates[1] || logoCandidates[0] || ""
  };
}

export function getTeamLogoUrl(team) {
  return getTeamLogoCandidates(team)[0] || getTeamBrand(team).logo || "";
}

export function getTeamLabel(team) {
  if (typeof team === "string") {
    return team;
  }

  return team?.name || team?.displayName || team?.shortName || team?.abbreviation || "Team";
}

export function getPlayerHeadshotCandidates(player) {
  if (!player) {
    return [];
  }

  const mlbIds = uniqueStrings([
    toNumericId(player.id),
    toNumericId(player.playerId),
    toNumericId(player.player_id),
    toNumericId(player.mlbPlayerId),
    toNumericId(player.mlb_player_id),
    toNumericId(player.person?.id)
  ]);

  const espnIds = uniqueStrings([
    toNumericId(player.espnPlayerId),
    toNumericId(player.espn_player_id),
    toNumericId(player.espnId),
    toNumericId(player.espn_id),
    toNumericId(player.id),
    toNumericId(player.playerId),
    toNumericId(player.player_id)
  ]);

  return uniqueStrings([
    player.headshotUrl,
    player.headshot_url,
    player.headshot?.href,
    player.headshot,
    player.image,
    ...mlbIds.flatMap((id) => [mlbHeadshotUrl(id), mlbHeadshotPngUrl(id)]),
    ...espnIds.map((id) => espnHeadshotUrl(id))
  ]);
}

export function getPlayerHeadshotUrl(player) {
  return getPlayerHeadshotCandidates(player)[0] || "";
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
