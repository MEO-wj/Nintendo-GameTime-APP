import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { theme } from "../theme";

type Props = {
  icon: React.ReactNode;
  label: string;
  value: string;
  accentColor?: string;
};

export function StatCard({ icon, label, value, accentColor }: Props) {
  return (
    <View style={[styles.card, accentColor ? { borderTopColor: accentColor } : null]}>
      <View style={[styles.iconWrap, accentColor ? { backgroundColor: accentColor + "18" } : null]}>
        {icon}
      </View>
      <Text style={styles.value} numberOfLines={1}>{value}</Text>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: 4,
    alignItems: "center",
    borderTopWidth: 3,
    borderTopColor: "transparent",
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceHover,
    marginBottom: 4,
  },
  value: {
    color: theme.colors.ink,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.heavy,
  },
  label: {
    color: theme.colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
});
