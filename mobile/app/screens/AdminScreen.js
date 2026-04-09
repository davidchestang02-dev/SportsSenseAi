import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import ScreenShell from "../components/ScreenShell";
import { useAsyncResource } from "../hooks/useAsyncResource";
import { getHealth } from "../lib/api";
import { palette } from "../theme/palette";

export default function AdminScreen() {
  const today = new Date().toISOString().slice(0, 10);
  const { loading, data } = useAsyncResource(() => getHealth(today), [today]);

  return (
    <ScreenShell title="Admin" subtitle="Calibration and launch-health view for operators running SportsSenseAi on game day.">
      {loading && <ActivityIndicator color={palette.accent} />}
      {(data || []).map((item, index) => (
        <View key={`${item.prop_type}-${index}`} style={styles.card}>
          <Text style={styles.heading}>{item.prop_type}</Text>
          <Text style={styles.line}>Bucket {item.bucket}</Text>
          <Text style={styles.line}>Actual {item.actual_avg}</Text>
        </View>
      ))}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  card: {
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
