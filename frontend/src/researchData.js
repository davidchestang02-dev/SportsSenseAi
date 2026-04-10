import { useEffect, useState } from "react";

import { getResearchPlayer, getResearchSlate, getResearchTeam } from "./api";

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
