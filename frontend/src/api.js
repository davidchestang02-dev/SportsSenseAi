export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function buildQuery(params) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    search.set(key, String(value));
  });

  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

async function readJson(path, init) {
  const response = await fetch(path, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

export function getHealth() {
  return readJson("/api/health");
}

export function getSimulation(date) {
  return readJson(`/api/sim/mlb?date=${date}`);
}

export function getSchedule(date) {
  return readJson(`/api/schedule/mlb?date=${date}`);
}

export function getGameOddsHistory(gameId, options = {}) {
  return readJson(`/api/games/mlb/${gameId}/odds/history${buildQuery(options)}`);
}

export function getGameOddsMovement(gameId, options = {}) {
  return readJson(`/api/games/mlb/${gameId}/odds/movement${buildQuery(options)}`);
}

export function getMarkets(date) {
  return readJson(`/api/market/mlb?date=${date}`);
}

export function getRisk(date) {
  return readJson(`/api/risk/mlb?date=${date}`);
}

export function getLineups(date) {
  return readJson(`/api/lineups/mlb?date=${date}`);
}

export function getGameContexts(date) {
  return readJson(`/api/game-context/mlb?date=${date}`);
}

export function getAutoBet(date) {
  return readJson(`/api/autobet/mlb/run?date=${date}`);
}

export function getCalibration(date) {
  return readJson(`/api/admin/mlb/health-data?date=${date}`);
}

export function getDataHealth() {
  return readJson("/api/admin/mlb/data-health");
}

export function getLive(gameId, date, options = {}) {
  return readJson(`/api/live/mlb${buildQuery({ game_id: gameId, date, ...options })}`);
}

export function getResearchSlate(date, season) {
  return readJson(`/api/research/mlb/slate${buildQuery({ date, season })}`);
}

export function getResearchTeam(teamId, date, season) {
  return readJson(`/api/research/mlb/team/${teamId}${buildQuery({ date, season })}`);
}

export function getResearchPlayer(playerId, options = {}) {
  return readJson(`/api/research/mlb/player/${playerId}${buildQuery(options)}`);
}

export function askAi(question, date) {
  return readJson(`/api/mlb/qa?date=${date}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ question })
  });
}
