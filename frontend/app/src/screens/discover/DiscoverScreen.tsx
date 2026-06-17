import React, { useEffect, useState } from "react";
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCatalog, CatalogItem } from "../../hooks/useCatalog";
import { GameCard } from "../../components/GameCard";
import { EmptyState } from "../../components/EmptyState";
import { formatDisplayCurrency } from "../../utils/format";
import { theme } from "../../theme";

type Nav = NativeStackNavigationProp<any>;

function getTitle(item: CatalogItem): string {
  return item.localizations?.zhHans?.title || item.title;
}

function getPrice(item: CatalogItem): string {
  if (item.priceAmount == null) return "";
  return formatDisplayCurrency(item.priceAmount, item.priceCurrency ?? "USD", "DOMESTIC");
}

export function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { items, loading, hasMore, query, search, reset } = useCatalog();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => { search("", true); }, []);

  const handleSearch = () => {
    reset();
    search(searchQuery, true);
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) search(query);
  };

  const handlePress = (item: CatalogItem) => {
    nav.navigate("CatalogDetail", { externalId: item.externalId });
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>发现</Text>
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="搜索 Switch 游戏..."
          placeholderTextColor={theme.colors.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Text style={styles.searchBtnText}>搜索</Text>
        </TouchableOpacity>
      </View>

      {/* Grid */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.externalId}
        numColumns={2}
        renderItem={({ item }) => (
          <GameCard
            game={{
              id: item.externalId,
              title: getTitle(item),
              coverUrl: item.coverUrl,
              priceAmount: item.priceAmount,
              priceCurrency: item.priceCurrency,
              displayPrice: getPrice(item),
            }}
            showPrice
            onPress={() => handlePress(item)}
          />
        )}
        columnWrapperStyle={styles.gridRow}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={loading ? null : <EmptyState message="搜索发现新游戏" />}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => { reset(); search(searchQuery, true); }}
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
  searchRow: { flexDirection: "row", paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.sm, gap: theme.spacing.sm },
  searchInput: {
    flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm,
    color: theme.colors.ink, fontSize: theme.fontSize.md, borderWidth: 1, borderColor: theme.colors.border,
  },
  searchBtn: {
    backgroundColor: theme.colors.accent, borderRadius: theme.radius.md,
    justifyContent: "center", paddingHorizontal: theme.spacing.lg,
  },
  searchBtnText: { color: "#fff", fontWeight: theme.fontWeight.semibold, fontSize: theme.fontSize.sm },
  gridRow: { paddingHorizontal: theme.spacing.md, gap: 0 },
  listContent: { paddingBottom: 80 },
});
