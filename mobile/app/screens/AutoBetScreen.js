import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import ScreenShell from "../components/ScreenShell";
import { useAsyncResource } from "../hooks/useAsyncResource";
import { getAutoBet } from "../lib/api";
import { palette } from "../theme/palette";

export default function AutoBetScreen() {
  const today = new Date().toISOString().slice(0, 10);
  const { loading, data } = useAsyncResource(() => getAutoBet(today), [today]);

  return (
    <ScreenShell title="AutoBet" subtitle="Execution queue built from the market-maker and filtered through risk controls.">
      {loading && <ActivityIndicator color={palette.accent} />}
      {data && (
        <View style={styles.summary}>
          <Text style={styles.heading}>Slip Queue</Text>
          <Text style={styles.line}>Total slips: {data.total_slips}</Text>
          <Text style={styles.line}>Total exposure: ${data.total_exposure}</Text>
        </View>
      )}
      {(data?.slips || []).map((slip, index) => (
        <View key={`${slip.player_name}-${index}`} style={styles.summary}>
          <Text style={styles.heading}>{slip.player_name}</Text>
          <Text style={styles.line}>{slip.market || slip.prop_type}</Text>
          <Text style={styles.line}>{slip.book} at {slip.odds}</Text>
          <Text style={styles.line}>Stake ${slip.stake}</Text>
        </View>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  summary: {
    backgroundColor: palette.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.border,
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
