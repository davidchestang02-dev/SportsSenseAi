import React from "react";
import { ActivityIndicator } from "react-native";

import GameCard from "../components/GameCard";
import ScreenShell from "../components/ScreenShell";
import { useAsyncResource } from "../hooks/useAsyncResource";
import { getSlate } from "../lib/api";
import { palette } from "../theme/palette";

export default function SlateScreen() {
  const today = new Date().toISOString().slice(0, 10);
  const { loading, data } = useAsyncResource(() => getSlate(today), [today]);

  return (
    <ScreenShell title="Slate" subtitle="Game-level board with matchup confidence, weather, and top-play context.">
      {loading && <ActivityIndicator color={palette.accent} />}
      {(data?.games || []).map((game) => (
        <GameCard key={game.game_id} game={game} />
      ))}
    </ScreenShell>
  );
}
