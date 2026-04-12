import { useEffect, useState } from "react";

import {
  getGamePreview,
  getPitcher,
  getPitchers,
  getPregame,
  getResearchPlayer,
  getResearchSlate,
  getResearchTeam,
  getWeather
} from "./api";

function useRemoteResource(loader, initialValue, deps) {
  const [state, setState] = useState({
    loading: true,
    error: "",
    data: initialValue
  });

  useEffect(() => {
    let active = true;

    async function load() {
      setState({
        loading: true,
        error: "",
        data: initialValue
      });

      try {
        const data = await loader();
        if (!active) {
          return;
        }

        setState({
          loading: false,
          error: "",
          data
        });
      } catch (error) {
        if (!active) {
          return;
        }

        setState({
          loading: false,
          error: error instanceof Error ? error.message : "Unable to load resource.",
          data: initialValue
        });
      }
    }

    load();

    return () => {
      active = false;
    };
  }, deps);

  return state;
}

const emptySlate = {
  date: "",
  season: "",
  games: []
};

export function useResearchSlate(selectedDate) {
  return useRemoteResource(() => getResearchSlate(selectedDate), emptySlate, [selectedDate]);
}

export function usePregameSlate(selectedDate) {
  return useRemoteResource(() => getPregame(selectedDate), { date: selectedDate, games: [] }, [selectedDate]);
}

export function useWeather(selectedDate) {
  return useRemoteResource(() => getWeather(selectedDate), { date: selectedDate, games: [] }, [selectedDate]);
}

export function usePitcherLeaderboard(selectedDate, options = {}) {
  const season = Number(options.season || selectedDate.slice(0, 4));
  const sort = options.sort || "era";
  return useRemoteResource(
    () => getPitchers({ season, sort, limit: options.limit || 100 }),
    { season, pitchers: [] },
    [season, sort, options.limit]
  );
}

export function usePitcherProfile(playerId, selectedDate) {
  const season = Number(selectedDate.slice(0, 4));
  return useRemoteResource(
    async () => {
      if (!playerId) {
        return null;
      }
      return getPitcher(playerId, { season });
    },
    null,
    [playerId, season]
  );
}

export function useGamePreview(gameId, selectedDate) {
  return useRemoteResource(
    async () => {
      if (!gameId) {
        return null;
      }
      return getGamePreview(gameId, { date: selectedDate });
    },
    null,
    [gameId, selectedDate]
  );
}

export function useTeamResearch(teamId, selectedDate) {
  return useRemoteResource(
    async () => {
      if (!teamId) {
        return null;
      }
      return getResearchTeam(teamId, selectedDate);
    },
    null,
    [teamId, selectedDate]
  );
}

export function usePlayerResearch(playerId, selectedDate, opponentTeamId, opposingPitcherId) {
  return useRemoteResource(
    async () => {
      if (!playerId) {
        return null;
      }

      return getResearchPlayer(playerId, {
        date: selectedDate,
        opponentTeamId,
        opposingPitcherId
      });
    },
    null,
    [playerId, selectedDate, opponentTeamId, opposingPitcherId]
  );
}
