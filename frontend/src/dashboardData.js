import { useEffect, useState } from "react";

import { getAutoBet, getCalibration, getDataHealth, getGameContexts, getHealth, getLineups, getLive, getMarkets, getRisk, getSchedule, getSimulation, todayIso } from "./api";

const fallbackHealth = {
  ok: true,
  app: "SportsSenseAi",
  db_bound: true,
  latest_calibration: {
    date: todayIso(),
    prop_type: "hrh_2p",
    proj_avg: 0.3,
    actual_avg: 0.289,
    count: 48
  }
};

const initialState = {
  loading: true,
  error: "",
  health: fallbackHealth,
  dataHealth: { routes: [], summary: { verified_routes: 0, partial_routes: 0, blocked_routes: 0, mock_only_routes: [] } },
  schedule: { date: todayIso(), games: [], ingestion: { odds_snapshots_attempted: 0, odds_snapshots_persisted: 0 } },
  simulation: { players: [], teams: [], games: [], slate: { top_batters: [], top_pitchers: [] } },
  markets: [],
  risk: { recommendations: [] },
  lineups: { lineups: [], injuries: [] },
  contexts: [],
  autobet: { slips: [], total_slips: 0, total_exposure: 0 },
  calibration: [],
  live: null
};

function settledValue(result, fallback) {
  return result.status === "fulfilled" ? result.value : fallback;
}

function getPrimaryGameId(schedule, simulation, contexts) {
  return (
    schedule?.games?.find((game) => game.status === "IN_PROGRESS")?.gameId ||
    simulation?.games?.[0]?.game_id ||
    contexts?.[0]?.game_id ||
    null
  );
}

export function useSlateBundle(selectedDate) {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    let active = true;

    async function load() {
      setState((current) => ({ ...current, loading: true, error: "" }));

      const results = await Promise.allSettled([
        getHealth(),
        getDataHealth(),
        getSchedule(selectedDate),
        getSimulation(selectedDate),
        getMarkets(selectedDate),
        getRisk(selectedDate),
        getLineups(selectedDate),
        getGameContexts(selectedDate),
        getAutoBet(selectedDate),
        getCalibration(selectedDate)
      ]);

      if (!active) {
        return;
      }

      const errorMessage = results
        .map((result, index) => ({ result, index }))
        .filter(({ result }) => result.status === "rejected")
        .map(({ index }) => ["health", "dataHealth", "schedule", "simulation", "markets", "risk", "lineups", "contexts", "autobet", "calibration"][index])
        .join(", ");

      const nextState = {
        loading: false,
        error: errorMessage,
        health: settledValue(results[0], fallbackHealth),
        dataHealth: settledValue(results[1], initialState.dataHealth),
        schedule: settledValue(results[2], initialState.schedule),
        simulation: settledValue(results[3], initialState.simulation),
        markets: settledValue(results[4], initialState.markets),
        risk: settledValue(results[5], initialState.risk),
        lineups: settledValue(results[6], initialState.lineups),
        contexts: settledValue(results[7], initialState.contexts),
        autobet: settledValue(results[8], initialState.autobet),
        calibration: settledValue(results[9], initialState.calibration),
        live: null
      };

      setState(nextState);

      const primaryGameId = getPrimaryGameId(nextState.schedule, nextState.simulation, nextState.contexts);
      if (!primaryGameId) {
        return;
      }

      try {
        const live = await getLive(primaryGameId, selectedDate, { refresh: 1 });
        if (active) {
          setState((current) => ({ ...current, live }));
        }
      } catch {
        if (active) {
          setState((current) => ({ ...current, live: null }));
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [selectedDate]);

  const liveGameId = state.schedule?.games?.find((game) => game.status === "IN_PROGRESS")?.gameId || null;

  useEffect(() => {
    let active = true;

    if (selectedDate !== todayIso() || !liveGameId) {
      return () => {
        active = false;
      };
    }

    async function refreshLive() {
      try {
        const live = await getLive(liveGameId, selectedDate, { refresh: 1 });
        if (active) {
          setState((current) => ({ ...current, live }));
        }
      } catch {
        // Keep the previous live payload if a refresh fails.
      }
    }

    async function refreshSchedule() {
      try {
        const schedule = await getSchedule(selectedDate);
        if (active) {
          setState((current) => ({ ...current, schedule }));
        }
      } catch {
        // Keep the previous schedule payload if a refresh fails.
      }
    }

    const liveTimer = setInterval(refreshLive, 15000);
    const scheduleTimer = setInterval(refreshSchedule, 30000);

    return () => {
      active = false;
      clearInterval(liveTimer);
      clearInterval(scheduleTimer);
    };
  }, [liveGameId, selectedDate]);

  return state;
}
