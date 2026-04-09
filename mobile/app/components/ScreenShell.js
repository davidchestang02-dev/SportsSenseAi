import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { palette } from "../theme/palette";

export default function ScreenShell({ title, subtitle, children }) {
  return (
    <LinearGradient colors={["#07141f", "#0b1d29", "#102838"]} style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>SportsSenseAi MLB</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {children}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1
  },
  content: {
    padding: 18,
    gap: 14
  },
  hero: {
    backgroundColor: "rgba(12, 34, 48, 0.92)",
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 22,
    padding: 18
  },
  eyebrow: {
    color: palette.accent,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase"
  },
  title: {
    color: palette.text,
    fontSize: 28,
    fontWeight: "700",
    marginTop: 4
  },
  subtitle: {
    color: palette.muted,
    marginTop: 8,
    lineHeight: 20
  }
});
