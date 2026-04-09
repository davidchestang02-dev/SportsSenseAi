import Constants from "expo-constants";

import { mockAutoBet, mockHealth, mockMarkets, mockRisk, mockSlate } from "../data/mock";

const BASE =
  process.env.EXPO_PUBLIC_SSA_API_BASE ||
  Constants.expoConfig?.extra?.apiBase ||
  "http://127.0.0.1:8787";

async function fetchJson(path) {
  const response = await fetch(`${BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

export async function getSlate(date) {
  try {
    return await fetchJson(`/sim/mlb?date=${date}`);
  } catch {
    return {
      date,
      games: mockSlate
    };
  }
}

export async function getMarkets(date) {
  try {
    return await fetchJson(`/market/mlb?date=${date}`);
  } catch {
    return mockMarkets;
  }
}

export async function getRisk(date) {
  try {
    return await fetchJson(`/risk/mlb?date=${date}`);
  } catch {
    return mockRisk;
  }
}

export async function getAutoBet(date) {
  try {
    return await fetchJson(`/autobet/mlb/run?date=${date}`);
  } catch {
    return mockAutoBet;
  }
}

export async function getHealth(date) {
  try {
    return await fetchJson(`/admin/mlb/health-data?date=${date}`);
  } catch {
    return mockHealth;
  }
}
