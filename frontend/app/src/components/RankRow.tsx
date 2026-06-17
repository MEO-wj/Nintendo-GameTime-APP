import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { theme } from "../theme";
import { formatDuration } from "../utils/format";
import { getProxiedImageUrl } from "../utils/image";
import { ProgressBar } from "./ProgressBar";

type Props = {
  rank: number;
  title: string;
  coverUrl?: string | null;
  minutes: number;
  maxMinutes: number;
  onPress: () => void;
};

const RANK_COLORS = [theme.colors.rankGold, theme.colors.rankSilver, theme.colors.rankBronze];

export function RankRow({ rank, title, coverUrl, minutes, maxMinutes, onPress }: Props) {
  const rankColor = rank <= 3 ? RANK_COLORS[rank - 1] : theme.colors.muted;
  const share = maxMinutes > 0 ? minutes / maxMinutes : 0;

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={onPress}>
      <View style={[styles.rankBadge, { borderColor: rankColor }]}>
        <Text style={[styles.rankText, { color: rankColor }]}>{rank}</Text>
      </View>
      {coverUrl ? (
        <Image source={{ uri: getProxiedImageUrl(coverUrl, 400) }} style={styles.cover} contentFit="cover" />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]} />
      )}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={styles.barRow}>
          <ProgressBar progress={share} color={rankColor} height={4} />
          <Text style={styles.minutes}>{formatDuration(minutes)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.spacing.md,
  },
  rankText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.heavy,
  },
  cover: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.sm,
    marginRight: theme.spacing.md,
    backgroundColor: theme.colors.surfaceHover,
  },
  coverPlaceholder: {
    backgroundColor: theme.colors.surfaceHover,
  },
  info: {
    flex: 1,
  },
  title: {
    color: theme.colors.ink,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
    marginBottom: 4,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  minutes: {
    color: theme.colors.muted,
    fontSize: theme.fontSize.xs,
    minWidth: 40,
    textAlign: "right",
  },
});
