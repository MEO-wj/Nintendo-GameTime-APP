import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { theme } from "../theme";

export function LoadingOverlay() {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color={theme.colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.xxl * 3,
  },
});
