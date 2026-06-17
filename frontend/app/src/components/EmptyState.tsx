import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { theme } from "../theme";

type Props = { message?: string; icon?: string };

export function EmptyState({ message = "暂无数据", icon = "🎮" }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.xxl * 2,
  },
  icon: { fontSize: 40, marginBottom: theme.spacing.md },
  text: { color: theme.colors.muted, fontSize: theme.fontSize.md },
});
