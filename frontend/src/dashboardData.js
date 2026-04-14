import { useEffect, useState } from "react";

import { getAutoBet, getCalibration, getDataHealth, getGameContexts, getHealth, getLineups, getLive, getMarkets, getPlayerProps, getRisk, getSchedule, getSimulation, todayIso } from "./api";

const fallbackHealth = {
  ok: false,
  app: "SportsSenseAi",
  db_bound: false,
  latest_calibration: null
};

const initialState = {
  loading: true,
  error: "",
  health: fallbackHealth,
  dataHealth: { routes: [], summary: { verified_routes: 0, partial_routes: 0, blocked_routes: 0, empty_capable_routes: [] } },
  schedule: { date: todayIso(), games: [], ingestion: { odds_snapshots_attempted: 0, odds_snapshots_persisted: 0 } },
  simulation: { players: [], teams: [], games: [], slate: { top_batters: [], top_pitchers: [] } },
  markets: [],
  playerProps: { date: todayIso(), props: [], books: [], propTypes: [], ingestion: null },
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

function minutesUntilStart(startTime) {
  if (!startTime) {
    return null;
  }

  const parsed = new Date(startTime);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return (parsed.getTime() - Date.now()) / (60 * 1000);
}

function getRefreshCadence(schedule, selectedDate) {
  if (selectedDate !== todayIso()) {
    return null;
  }

  const games = schedule?.games || [];
  if (games.some((game) => game.status === "IN_PROGRESS")) {
    return {
      mode: "live",
      scheduleMs: 60000,
      liveMs: 60000
    };
  }

  if (
    games.some((game) => game.status === "SCHEDULED" && minutesUntilStart(game.startTime) !== null && minutesUntilStart(game.startTime) <= 60)
  ) {
    return {
      mode: "pregame_prelock",
      scheduleMs: 60000,
      liveMs: null
    };
  }

  if (games.some((game) => game.status === "SCHEDULED")) {
    return {
      mode: "pregame_daily",
      scheduleMs: 3600000,
      liveMs: null
    };
  }

  if (games.some((game) => game.status === "FINAL")) {
    return {
      mode: "recent_final",
      scheduleMs: 120000,
      liveMs: null
    };
  }

  return null;
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
        getPlayerProps(selectedDate),
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
        .map(({ index }) => ["health", "dataHealth", "schedule", "simulation", "markets", "playerProps", "risk", "lineups", "contexts", "autobet", "calibration"][index])
        .join(", ");

      const nextState = {
        loading: false,
        error: errorMessage,
        health: settledValue(results[0], fallbackHealth),
        dataHealth: settledValue(results[1], initialState.dataHealth),
        schedule: settledValue(results[2], initialState.schedule),
        simulation: settledValue(results[3], initialState.simulation),
        markets: settledValue(results[4], initialState.markets),
        playerProps: settledValue(results[5], initialState.playerProps),
        risk: settledValue(results[6], initialState.risk),
        lineups: settledValue(results[7], initialState.lineups),
        contexts: settledValue(results[8], initialState.contexts),
        autobet: settledValue(results[9], initialState.autobet),
        calibration: settledValue(results[10], initialState.calibration),
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
  const cadence = getRefreshCadence(state.schedule, selectedDate);

  useEffect(() => {
    let active = true;

    if (!cadence) {
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

    const liveTimer =
      cadence.liveMs && liveGameId
        ? setInterval(refreshLive, cadence.liveMs)
        : null;
    const scheduleTimer = setInterval(refreshSchedule, cadence.scheduleMs);

    return () => {
      active = false;
      if (liveTimer) {
        clearInterval(liveTimer);
      }
      clearInterval(scheduleTimer);
    };
  }, [cadence, liveGameId, selectedDate]);

  return state;
}
