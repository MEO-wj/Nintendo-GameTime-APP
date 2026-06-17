import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
} from "react-native";
import { Image } from "expo-image";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCatalogDetail } from "../../hooks/useCatalog";
import { getProxiedImageUrl } from "../../utils/image";
import { formatScore, formatDisplayCurrency, getErrorMessage } from "../../utils/format";
import { formatSimpleDate } from "../../utils/date";
import { SectionHeader } from "../../components/SectionHeader";
import { LoadingOverlay } from "../../components/LoadingOverlay";
import { theme } from "../../theme";

type RouteParams = { CatalogDetail: { externalId: string } };

export function CatalogDetailScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RouteParams, "CatalogDetail">>();
  const nav = useNavigation();
  const { externalId } = route.params;
  const { detail, loading, fetch, addToLibrary } = useCatalogDetail(externalId);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => { fetch(); }, [fetch]);

  const isOwned = added || !!detail?.ownedGame;

  const handleAdd = async () => {
    setAdding(true);
    try {
      await addToLibrary();
      setAdded(true);
      Alert.alert("", "已加入游戏库！");
    } catch (e) {
      Alert.alert("", getErrorMessage(e, "加入失败"));
    } finally { setAdding(false); }
  };

  if (loading) return <View style={[styles.root, { paddingTop: insets.top }]}><LoadingOverlay /></View>;
  if (!detail) return <View style={[styles.root, { paddingTop: insets.top }]}><Text style={styles.errorText}>游戏不存在</Text></View>;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero */}
        <Image source={{ uri: getProxiedImageUrl(detail.coverUrl, 400) }} style={styles.hero} contentFit="cover" cachePolicy="memory-disk" />
        <View style={styles.heroOverlay}>
          <TouchableOpacity style={styles.backBtn} onPress={() => nav.goBack()}>
            <Text style={styles.backText}>← 返回</Text>
          </TouchableOpacity>
          <Text style={styles.heroTitle}>{detail.localizations?.zhHans?.title || detail.title}</Text>
          <Text style={styles.heroMeta}>
            {detail.publisher ?? ""}{detail.publisher && detail.releaseDate ? " · " : ""}{formatSimpleDate(detail.releaseDate)}
          </Text>
        </View>

        <View style={styles.body}>
          {/* Scores */}
          <View style={styles.scoreRow}>
            {detail.criticScore != null && (
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreLabel}>Metacritic</Text>
                <Text style={[styles.scoreVal, { color: detail.criticScore >= 75 ? theme.colors.success : theme.colors.warning }]}>
                  {detail.criticScore}
                </Text>
              </View>
            )}
            {detail.playerRating && (
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreLabel}>玩家评分</Text>
                <Text style={styles.scoreVal}>{formatScore(detail.playerRating.averageScore)}</Text>
              </View>
            )}
          </View>

          {/* Game info */}
          {(detail.publisher || detail.releaseDate) && (
            <View style={styles.infoCard}>
              {detail.publisher && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>发行商</Text>
                  <Text style={styles.infoVal}>{detail.publisher}</Text>
                </View>
              )}
              {detail.releaseDate && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>发售日</Text>
                  <Text style={styles.infoVal}>{formatSimpleDate(detail.releaseDate)}</Text>
                </View>
              )}
            </View>
          )}

          {/* Price */}
          {detail.priceAmount != null && (
            <View style={styles.priceLine}>
              <Text style={styles.priceLabel}>价格</Text>
              <Text style={styles.priceVal}>
                {formatDisplayCurrency(detail.priceAmount, detail.priceCurrency ?? "JPY", "DOMESTIC")}
              </Text>
            </View>
          )}

          {/* Description */}
          {(detail.localizations?.zhHans?.description || detail.description) && (
            <>
              <SectionHeader title="简介" />
              <Text style={styles.desc}>{detail.localizations?.zhHans?.description || detail.description}</Text>
            </>
          )}

          {/* Add to library */}
          <TouchableOpacity
            style={[styles.addBtn, isOwned && styles.addBtnDone]}
            onPress={handleAdd}
            disabled={adding || isOwned}
          >
            <Text style={styles.addBtnText}>
              {isOwned ? "✓ 已在游戏库" : adding ? "加入中..." : "加入游戏库"}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 80 }} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: {},
  hero: { width: "100%", height: 240, backgroundColor: theme.colors.surface },
  heroOverlay: {
    position: "absolute", top: 0, left: 0, right: 0, height: 240,
    backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end",
    paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg,
  },
  backBtn: { position: "absolute", top: 50, left: theme.spacing.xl },
  backText: { color: "#fff", fontSize: theme.fontSize.md },
  heroTitle: { color: "#fff", fontSize: theme.fontSize.xxl, fontWeight: theme.fontWeight.bold },
  heroMeta: { color: "rgba(255,255,255,0.7)", fontSize: theme.fontSize.sm, marginTop: 4 },
  body: { paddingHorizontal: theme.spacing.xl },
  scoreRow: { flexDirection: "row", gap: theme.spacing.md, marginTop: theme.spacing.xl },
  scoreBadge: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, alignItems: "center", flex: 1,
  },
  scoreLabel: { color: theme.colors.muted, fontSize: theme.fontSize.xs },
  scoreVal: { color: theme.colors.ink, fontSize: theme.fontSize.xxl, fontWeight: theme.fontWeight.heavy, marginTop: 4 },
  // Game info
  infoCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    padding: theme.spacing.lg, marginTop: theme.spacing.lg,
  },
  infoRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 6,
  },
  infoLabel: { color: theme.colors.muted, fontSize: theme.fontSize.sm },
  infoVal: { color: theme.colors.ink, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },

  priceLine: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: theme.spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border, marginTop: theme.spacing.lg,
  },
  priceLabel: { color: theme.colors.muted, fontSize: theme.fontSize.md },
  priceVal: { color: theme.colors.ink, fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold },
  desc: { color: theme.colors.ink, fontSize: theme.fontSize.md, lineHeight: 24, marginTop: theme.spacing.xs },
  addBtn: {
    backgroundColor: theme.colors.accent, borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.md + 2, alignItems: "center", marginTop: theme.spacing.xxl,
  },
  addBtnDone: { backgroundColor: theme.colors.success },
  addBtnText: { color: "#fff", fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold },
  errorText: { color: theme.colors.muted, fontSize: theme.fontSize.md, textAlign: "center", marginTop: 100 },
});
