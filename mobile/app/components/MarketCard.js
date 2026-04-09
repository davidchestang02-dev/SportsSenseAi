import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { palette } from "../theme/palette";

export default function MarketCard({ market }) {
  return (
    <View style={styles.card}>
      <Text style={styles.player}>{market.player_name}</Text>
      <Text style={styles.team}>{market.team}</Text>
      <Text style={styles.meta}>{market.prop_type}</Text>
      <Text style={styles.meta}>Best book: {market.best_book}</Text>
      <Text style={styles.edge}>Edge {market.edge}</Text>
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
  player: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "700"
  },
  team: {
    color: palette.accent,
    marginTop: 4
  },
  meta: {
    color: palette.muted,
    marginTop: 6
  },
  edge: {
    color: palette.sun,
    marginTop: 10,
    fontWeight: "700"
  }
});
