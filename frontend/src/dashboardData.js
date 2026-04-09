import { useEffect, useState } from "react";

import { getAutoBet, getCalibration, getGameContexts, getHealth, getLineups, getLive, getMarkets, getRisk, getSimulation, todayIso } from "./api";

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

export function useSlateBundle(selectedDate) {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    let active = true;

    async function load() {
      setState((current) => ({ ...current, loading: true, error: "" }));

      const results = await Promise.allSettled([
        getHealth(),
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
        .map(({ index }) => ["health", "simulation", "markets", "risk", "lineups", "contexts", "autobet", "calibration"][index])
        .join(", ");

      const nextState = {
        loading: false,
        error: errorMessage,
        health: settledValue(results[0], fallbackHealth),
        simulation: settledValue(results[1], initialState.simulation),
        markets: settledValue(results[2], initialState.markets),
        risk: settledValue(results[3], initialState.risk),
        lineups: settledValue(results[4], initialState.lineups),
        contexts: settledValue(results[5], initialState.contexts),
        autobet: settledValue(results[6], initialState.autobet),
        calibration: settledValue(results[7], initialState.calibration),
        live: null
      };

      setState(nextState);

      const primaryGameId = nextState.simulation?.games?.[0]?.game_id || nextState.contexts?.[0]?.game_id;
      if (!primaryGameId) {
        return;
      }

      try {
        const live = await getLive(primaryGameId, selectedDate);
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

  return state;
}
