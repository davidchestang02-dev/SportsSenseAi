const defaultDate = new Date().toISOString().slice(0, 10);

async function readJson(path, init) {
  const response = await fetch(path, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

export function todayIso() {
  return defaultDate;
}

export async function getHealth() {
  return readJson("/api/health");
}

export async function getSimulation(date) {
  return readJson(`/api/sim/mlb?date=${date}`);
}

export async function getMarkets(date) {
  return readJson(`/api/market/mlb?date=${date}`);
}

export async function getRisk(date) {
  return readJson(`/api/risk/mlb?date=${date}`);
}

export async function askAi(question, date) {
  return readJson(`/api/mlb/qa?date=${date}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ question })
  });
}
