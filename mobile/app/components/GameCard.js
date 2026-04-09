import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { palette } from "../theme/palette";

export default function GameCard({ game }) {
  return (
    <View style={styles.card}>
      <Text style={styles.matchup}>{game.matchup}</Text>
      <Text style={styles.meta}>{game.weather}</Text>
      <Text style={styles.meta}>Top play: {game.top_play}</Text>
      <Text style={styles.confidence}>Confidence {game.confidence}</Text>
    </View>
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
  matchup: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "700"
  },
  meta: {
    color: palette.muted,
    marginTop: 6
  },
  confidence: {
    color: palette.accent,
    marginTop: 10,
    fontWeight: "600"
  }
});
