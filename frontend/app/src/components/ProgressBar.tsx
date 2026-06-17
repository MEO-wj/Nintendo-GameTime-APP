import React from "react";
import { View, StyleSheet } from "react-native";
import { theme } from "../theme";

type Props = {
  progress: number; // 0–1
  color?: string;
  height?: number;
};

export function ProgressBar({ progress, color = theme.colors.accent, height = 6 }: Props) {
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <View
        style={[
          styles.fill,
          {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            width: `${(clamped * 100).toFixed(1)}%` as any,
            height,
            borderRadius: height / 2,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flex: 1,
    backgroundColor: theme.colors.border,
    overflow: "hidden",
  },
  fill: {
    position: "absolute",
    left: 0,
    top: 0,
  },
});
