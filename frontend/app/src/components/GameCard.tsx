import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Image } from "expo-image";
import { theme } from "../theme";
import { formatDuration, formatCurrency } from "../utils/format";
import { getProxiedImageUrl } from "../utils/image";

export type GameCardData = {
  id: string;
  title: string;
  coverUrl?: string | null;
  playtime?: number;
  priceAmount?: number;
  priceCurrency?: string;
  displayPrice?: string; // pre-formatted price (e.g. from formatDisplayCurrency)
};

type Props = {
  game: GameCardData;
  showPlaytime?: boolean;
  showPrice?: boolean;
  onPress: () => void;
};

export function GameCard({ game, showPlaytime, showPrice, onPress }: Props) {
  const coverUrl = getProxiedImageUrl(game.coverUrl, 400);
  const hasBadge = showPlaytime && game.playtime != null;
  const badge = hasBadge ? formatDuration(game.playtime!) : null;

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={onPress}>
      <View style={styles.media}>
        <Image
          source={{ uri: coverUrl }}
          style={styles.cover}
          contentFit="cover"
          transition={200}
        />
        {/* Playtime badge — top-left pill */}
        {badge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{game.title}</Text>
        {showPrice && game.priceAmount != null && (
          <Text style={styles.sub}>
            {game.displayPrice || formatCurrency(game.priceAmount, game.priceCurrency ?? "USD")}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    margin: theme.spacing.xs,
    maxWidth: "48%",
  },
  media: {
    borderRadius: theme.radius.md,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceHover,
  },
  cover: {
    width: "100%",
    aspectRatio: 1.55,
  },
  badge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(36, 24, 18, 0.82)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 48,
    minWidth: 48,
    alignItems: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  body: {
    paddingTop: 8,
    paddingHorizontal: 2,
  },
  title: {
    color: theme.colors.ink,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
    lineHeight: 18,
  },
  sub: {
    color: theme.colors.muted,
    fontSize: theme.fontSize.xs,
    marginTop: 2,
  },
});
