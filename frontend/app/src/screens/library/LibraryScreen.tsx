import React, { useEffect, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useGames, GameItem } from "../../hooks/useGames";
import { GameCard } from "../../components/GameCard";
import { EmptyState } from "../../components/EmptyState";
import { theme } from "../../theme";

type Nav = NativeStackNavigationProp<any>;

function getTitle(item: GameItem): string {
  return item.localizations?.zhHans?.title || item.title;
}

export function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { games, loading, hasMore, fetchOwned, reset } = useGames();
  const [sortTab, setSortTab] = React.useState<"top" | "recent" | "owned">("top");

  useEffect(() => {
    fetchOwned(sortTab, true);
  }, [sortTab]);

  const handleLoadMore = () => {
    if (!loading && hasMore) fetchOwned(sortTab);
  };

  const handleOwnedPress = (game: GameItem) => {
    nav.navigate("GameDetail", { gameId: game.id });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>游戏库</Text>
      </View>

      {/* Sort tabs */}
      <View style={styles.sortRow}>
        {(["top", "recent", "owned"] as const).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.sortTab, sortTab === s && styles.sortTabActive]}
            onPress={() => { reset(); setSortTab(s); }}
          >
            <Text style={[styles.sortText, sortTab === s && styles.sortTextActive]}>
              {s === "top" ? "游玩时长" : s === "recent" ? "最近游玩" : "最近添加"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Game grid */}
      <FlatList
        data={games}
        keyExtractor={(item) => item.id}
        numColumns={2}
        renderItem={({ item }) => (
          <GameCard
            game={{
              id: item.id,
              title: getTitle(item),
              coverUrl: item.coverUrl,
              playtime: item.effectivePlaytime?.totalMinutes,
            }}
            showPlaytime
            onPress={() => handleOwnedPress(item)}
          />
        )}
        columnWrapperStyle={styles.gridRow}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={loading ? null : <EmptyState message="还没有游戏，去发现页添加吧" />}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => { reset(); fetchOwned(sortTab, true); }}
            tintColor={theme.colors.accent}
          />
        }
        contentContainerStyle={styles.listContent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  header: { paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.lg },
  title: { color: theme.colors.ink, fontSize: theme.fontSize.xxl, fontWeight: theme.fontWeight.bold },
  sortRow: { flexDirection: "row", paddingHorizontal: theme.spacing.xl, paddingVertical: theme.spacing.sm, gap: theme.spacing.sm },
  sortTab: {
    paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.xs + 2,
    borderRadius: theme.radius.full, backgroundColor: theme.colors.surface,
  },
  sortTabActive: { backgroundColor: theme.colors.accent + "30" },
  sortText: { color: theme.colors.muted, fontSize: theme.fontSize.xs },
  sortTextActive: { color: theme.colors.accent, fontWeight: theme.fontWeight.semibold },
  gridRow: { paddingHorizontal: theme.spacing.md, gap: 0 },
  listContent: { paddingBottom: 80 },
});
