import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import ScreenShell from "../components/ScreenShell";
import { useAsyncResource } from "../hooks/useAsyncResource";
import { getRisk } from "../lib/api";
import { palette } from "../theme/palette";

export default function RiskScreen() {
  const today = new Date().toISOString().slice(0, 10);
  const { loading, data } = useAsyncResource(() => getRisk(today), [today]);

  return (
    <ScreenShell title="Risk" subtitle="Kelly-aware stake sizing and bankroll controls for the current slate.">
      {loading && <ActivityIndicator color={palette.accent} />}
      {data?.summary && (
        <View style={styles.card}>
          <Text style={styles.heading}>Exposure Summary</Text>
          <Text style={styles.line}>Total stake: ${data.summary.total_stake}</Text>
          <Text style={styles.line}>Average edge: {data.summary.avg_edge}</Text>
          <Text style={styles.line}>Max single bet: ${data.summary.max_single_bet}</Text>
        </View>
      )}
      {(data?.recommendations || []).map((item, index) => (
        <View key={`${item.player_name}-${index}`} style={styles.card}>
          <Text style={styles.heading}>{item.player_name}</Text>
          <Text style={styles.line}>{item.prop_type}</Text>
          <Text style={styles.line}>Stake ${item.stake}</Text>
          <Text style={styles.line}>Kelly {item.kelly_fraction}</Text>
        </View>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: 18,
    borderColor: palette.border,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12
  },
  heading: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "700"
  },
  line: {
    color: palette.muted,
    marginTop: 6
  }
});
