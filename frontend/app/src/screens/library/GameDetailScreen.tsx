import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  TextInput, ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGameDetail, CorrectionRow } from "../../hooks/useGames";
import { api } from "../../api/client";
import { ProgressBar } from "../../components/ProgressBar";
import { SectionHeader } from "../../components/SectionHeader";
import { LoadingOverlay } from "../../components/LoadingOverlay";
import { getProxiedImageUrl } from "../../utils/image";
import { formatDuration, formatScore, formatDisplayCurrency, getErrorMessage, formatCurrency } from "../../utils/format";
import { formatSimpleDate, formatRelativeTime } from "../../utils/date";
import { theme } from "../../theme";

type RouteParams = { GameDetail: { gameId: string } };

export function GameDetailScreen() {
  const insets = useSafeAreaInsets();
  const route = useRoute<RouteProp<RouteParams, "GameDetail">>();
  const nav = useNavigation();
  const { gameId } = route.params;
  const { game, loading, fetch } = useGameDetail(gameId);
  const [deleting, setDeleting] = useState(false);

  // Correction form state
  const [corrType, setCorrType] = useState<"ADD_DELTA" | "SET_TOTAL">("ADD_DELTA");
  const [corrMinutes, setCorrMinutes] = useState("");
  const [corrReason, setCorrReason] = useState("");
  const [corrSubmitting, setCorrSubmitting] = useState(false);

  // Rating
  const [ratingSubmitting, setRatingSubmitting] = useState(false);

  useEffect(() => { fetch(); }, [fetch]);

  const handleRemove = useCallback(async () => {
    Alert.alert("确认移除", `确定要从库中移除「${game?.title}」吗？`, [
      { text: "取消", style: "cancel" },
      {
        text: "移除", style: "destructive", onPress: async () => {
          setDeleting(true);
          try {
            await api.delete(`/api/games/${gameId}`);
            nav.goBack();
          } catch (e) {
            Alert.alert("", getErrorMessage(e, "移除失败"));
          } finally { setDeleting(false); }
        },
      },
    ]);
  }, [gameId, game?.title]);

  const handleCorrection = useCallback(async () => {
    const mins = parseInt(corrMinutes, 10);
    if (!mins || mins <= 0) { Alert.alert("", "请输入有效分钟数"); return; }
    if (!corrReason.trim()) { Alert.alert("", "请输入修正原因"); return; }
    setCorrSubmitting(true);
    try {
      await api.post("/api/playtime/corrections", {
        gameId, type: corrType, minutes: mins, reason: corrReason.trim(),
      });
      setCorrMinutes(""); setCorrReason("");
      fetch();
    } catch (e) {
      Alert.alert("", getErrorMessage(e, "修正失败"));
    } finally { setCorrSubmitting(false); }
  }, [gameId, corrType, corrMinutes, corrReason, fetch]);

  const handleRevoke = useCallback(async (correctionId: string) => {
    try {
      await api.post(`/api/playtime/corrections/${correctionId}/revoke`);
      fetch();
    } catch (e) {
      Alert.alert("", getErrorMessage(e, "撤销失败"));
    }
  }, [fetch]);

  const handleRate = useCallback(async (score: number) => {
    setRatingSubmitting(true);
    try {
      await api.put(`/api/games/${gameId}/rating`, { score });
      fetch();
      Alert.alert("", `评分成功: ${score.toFixed(1)}`);
    } catch (e) {
      Alert.alert("", getErrorMessage(e, "评分失败"));
    } finally { setRatingSubmitting(false); }
  }, [gameId, fetch]);

  if (loading) return <View style={[styles.root, { paddingTop: insets.top }]}><LoadingOverlay /></View>;
  if (!game) return <View style={[styles.root, { paddingTop: insets.top }]}><Text style={styles.errorText}>游戏不存在</Text></View>;

  const playtime = game.effectivePlaytime;
  const totalMin = playtime?.totalMinutes ?? 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Hero */}
        <Image source={{ uri: getProxiedImageUrl(game.coverUrl, 400) }} style={styles.hero} contentFit="cover" cachePolicy="memory-disk" />
        <View style={styles.heroOverlay}>
          <TouchableOpacity style={styles.backBtn} onPress={() => nav.goBack()}>
            <Text style={styles.backText}>← 返回</Text>
          </TouchableOpacity>
          <Text style={styles.heroTitle}>{game.localizations?.zhHans?.title || game.title}</Text>
          <Text style={styles.heroMeta}>
            {game.publisher ?? ""}{game.publisher && game.releaseDate ? " · " : ""}{formatSimpleDate(game.releaseDate)}
          </Text>
        </View>

        <View style={styles.body}>
          {/* Scores */}
          <View style={styles.scoreRow}>
            {game.criticScore != null && (
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreLabel}>Metacritic</Text>
                <Text style={[styles.scoreVal, { color: game.criticScore >= 75 ? theme.colors.success : theme.colors.warning }]}>
                  {game.criticScore}
                </Text>
              </View>
            )}
            {game.playerRating && (
              <View style={styles.scoreBadge}>
                <Text style={styles.scoreLabel}>玩家评分</Text>
                <Text style={styles.scoreVal}>{formatScore(game.playerRating.userScore)}</Text>
              </View>
            )}
          </View>

          {/* Rating buttons */}
          <View style={styles.rateRow}>
            {[2, 4, 6, 8, 10].map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.rateBtn, game.playerRating?.userScore === s && styles.rateBtnActive]}
                onPress={() => handleRate(s)}
                disabled={ratingSubmitting}
              >
                <Text style={[styles.rateText, game.playerRating?.userScore === s && styles.rateTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Playtime */}
          <SectionHeader title="游玩时长" subtitle={playtime?.source ? `来源: ${playtime.source}` : undefined} />
          <View style={styles.playtimeRow}>
            <Text style={styles.playtimeBig}>{formatDuration(totalMin)}</Text>
            {playtime && playtime.correctionDeltaMinutes !== 0 && (
              <Text style={styles.playtimeDelta}>
                ({playtime.correctionDeltaMinutes > 0 ? "+" : ""}{formatDuration(Math.abs(playtime.correctionDeltaMinutes))} 修正)
              </Text>
            )}
          </View>
          <ProgressBar progress={Math.min(1, totalMin / 6000)} color={theme.colors.accent} />

          {/* Game info */}
          {(game.publisher || game.releaseDate || game.description) && (
            <>
              <SectionHeader title="游戏资料" />
              <View style={styles.infoCard}>
                {game.publisher && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>发行商</Text>
                    <Text style={styles.infoVal}>{game.publisher}</Text>
                  </View>
                )}
                {game.releaseDate && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>发售日</Text>
                    <Text style={styles.infoVal}>{formatSimpleDate(game.releaseDate)}</Text>
                  </View>
                )}
                {(game.localizations?.zhHans?.description || game.description) && (
                  <View style={styles.descBox}>
                    <Text style={styles.descLabel}>简介</Text>
                    <Text style={styles.descText}>{game.localizations?.zhHans?.description || game.description}</Text>
                  </View>
                )}
              </View>
            </>
          )}

          {/* Price */}
          {game.priceAmount != null && (
            <View style={styles.priceLine}>
              <Text style={styles.priceLabel}>价格</Text>
              <Text style={styles.priceVal}>
                {formatDisplayCurrency(game.priceAmount, game.priceCurrency ?? "JPY", "DOMESTIC")}
              </Text>
            </View>
          )}

          {/* Correction form */}
          <SectionHeader title="记录修正" />
          <View style={styles.corrForm}>
            <View style={styles.corrTypeRow}>
              <TouchableOpacity
                style={[styles.corrTypeBtn, corrType === "ADD_DELTA" && styles.corrTypeActive]}
                onPress={() => setCorrType("ADD_DELTA")}
              >
                <Text style={[styles.corrTypeText, corrType === "ADD_DELTA" && styles.corrTypeActiveText]}>追加</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.corrTypeBtn, corrType === "SET_TOTAL" && styles.corrTypeActive]}
                onPress={() => setCorrType("SET_TOTAL")}
              >
                <Text style={[styles.corrTypeText, corrType === "SET_TOTAL" && styles.corrTypeActiveText]}>设定</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={styles.corrInput} placeholder={`${corrType === "ADD_DELTA" ? "追加" : "设定"}分钟数`} placeholderTextColor={theme.colors.muted} keyboardType="number-pad" value={corrMinutes} onChangeText={setCorrMinutes} />
            <TextInput style={[styles.corrInput, styles.corrReason]} placeholder="修正原因" placeholderTextColor={theme.colors.muted} value={corrReason} onChangeText={setCorrReason} />
            <TouchableOpacity style={[styles.corrSubmit, corrSubmitting && { opacity: 0.6 }]} onPress={handleCorrection} disabled={corrSubmitting}>
              <Text style={styles.corrSubmitText}>{corrSubmitting ? "提交中..." : "提交修正"}</Text>
            </TouchableOpacity>
          </View>

          {/* Correction history */}
          {game.corrections?.length > 0 && (
            <>
              <SectionHeader title="修正记录" />
              {game.corrections.map((c: CorrectionRow) => (
                <View key={c.id} style={styles.corrItem}>
                  <View style={styles.corrItemInfo}>
                    <Text style={styles.corrItemType}>{c.type === "ADD_DELTA" ? "追加" : "设定"} {c.minutes}min</Text>
                    <Text style={styles.corrItemReason}>{c.reason}</Text>
                    <Text style={styles.corrItemDate}>
                      {c.date ? formatSimpleDate(c.date) : ""} ({formatRelativeTime(c.createdAt)})
                    </Text>
                  </View>
                  {!c.revokedAt && (
                    <TouchableOpacity onPress={() => handleRevoke(c.id)}>
                      <Text style={styles.revokeBtn}>撤销</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </>
          )}

          {/* Remove button */}
          <TouchableOpacity style={styles.removeBtn} onPress={handleRemove} disabled={deleting}>
            <Text style={styles.removeText}>{deleting ? "移除中..." : "从库中移除"}</Text>
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
    backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end", paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg,
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
  rateRow: { flexDirection: "row", justifyContent: "center", gap: theme.spacing.sm, marginTop: theme.spacing.md },
  rateBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: theme.colors.surface,
    alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "transparent",
  },
  rateBtnActive: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accent + "20" },
  rateText: { color: theme.colors.muted, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
  rateTextActive: { color: theme.colors.accent },
  playtimeRow: { flexDirection: "row", alignItems: "baseline", gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  playtimeBig: { color: theme.colors.ink, fontSize: theme.fontSize.hero, fontWeight: theme.fontWeight.heavy },
  playtimeDelta: { color: theme.colors.warning, fontSize: theme.fontSize.sm },
  // Game info
  infoCard: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    padding: theme.spacing.lg, gap: 4, marginTop: theme.spacing.xs,
  },
  infoRow: {
    flexDirection: "row", justifyContent: "space-between",
    paddingVertical: 6,
  },
  infoLabel: { color: theme.colors.muted, fontSize: theme.fontSize.sm },
  infoVal: { color: theme.colors.ink, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.medium },
  descBox: { marginTop: 8, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.border },
  descLabel: { color: theme.colors.muted, fontSize: theme.fontSize.sm, marginBottom: 6 },
  descText: { color: theme.colors.ink, fontSize: theme.fontSize.md, lineHeight: 22 },

  priceLine: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: theme.spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  priceLabel: { color: theme.colors.muted, fontSize: theme.fontSize.md },
  priceVal: { color: theme.colors.ink, fontSize: theme.fontSize.lg, fontWeight: theme.fontWeight.bold },
  corrForm: { gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  corrTypeRow: { flexDirection: "row", gap: theme.spacing.sm },
  corrTypeBtn: {
    flex: 1, paddingVertical: theme.spacing.sm, borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface, alignItems: "center",
  },
  corrTypeActive: { backgroundColor: theme.colors.accent },
  corrTypeText: { color: theme.colors.muted, fontWeight: theme.fontWeight.semibold },
  corrTypeActiveText: { color: "#fff" },
  corrInput: {
    backgroundColor: theme.colors.surface, borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm,
    color: theme.colors.ink, fontSize: theme.fontSize.md, borderWidth: 1, borderColor: theme.colors.border,
  },
  corrReason: { height: 60, textAlignVertical: "top" },
  corrSubmit: {
    backgroundColor: theme.colors.accent, borderRadius: theme.radius.md,
    paddingVertical: theme.spacing.sm + 2, alignItems: "center",
  },
  corrSubmitText: { color: "#fff", fontWeight: theme.fontWeight.bold, fontSize: theme.fontSize.md },
  corrItem: {
    flexDirection: "row", alignItems: "center", paddingVertical: theme.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border,
  },
  corrItemInfo: { flex: 1 },
  corrItemType: { color: theme.colors.ink, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
  corrItemReason: { color: theme.colors.muted, fontSize: theme.fontSize.xs, marginTop: 2 },
  corrItemDate: { color: theme.colors.muted, fontSize: theme.fontSize.xs },
  revokeBtn: { color: theme.colors.joyRed, fontSize: theme.fontSize.sm, fontWeight: theme.fontWeight.semibold },
  removeBtn: {
    marginTop: theme.spacing.xxl, paddingVertical: theme.spacing.md,
    borderRadius: theme.radius.md, borderWidth: 1, borderColor: theme.colors.joyRed,
    alignItems: "center",
  },
  removeText: { color: theme.colors.joyRed, fontSize: theme.fontSize.md, fontWeight: theme.fontWeight.semibold },
  errorText: { color: theme.colors.muted, fontSize: theme.fontSize.md, textAlign: "center", marginTop: 100 },
});
