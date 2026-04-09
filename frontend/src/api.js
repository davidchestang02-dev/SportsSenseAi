export function todayIso() {
  return new Date().toISOString().slice(0, 10);
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

export function getLive(gameId, date) {
  return readJson(`/api/live/mlb?game_id=${gameId}&date=${date}`);
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
