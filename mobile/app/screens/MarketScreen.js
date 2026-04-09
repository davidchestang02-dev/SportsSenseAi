import React from "react";
import { ActivityIndicator } from "react-native";

import MarketCard from "../components/MarketCard";
import ScreenShell from "../components/ScreenShell";
import { useAsyncResource } from "../hooks/useAsyncResource";
import { getMarkets } from "../lib/api";
import { palette } from "../theme/palette";

export default function MarketScreen() {
  const today = new Date().toISOString().slice(0, 10);
  const { loading, data } = useAsyncResource(() => getMarkets(today), [today]);

  return (
    <ScreenShell title="Markets" subtitle="SportsSenseAi pricing board with best-book selection and edge visibility.">
      {loading && <ActivityIndicator color={palette.accent} />}
      {(data || []).map((market, index) => (
        <MarketCard key={`${market.player_name}-${market.prop_type}-${index}`} market={market} />
      ))}
    </ScreenShell>
  );
}
