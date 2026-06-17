import React, { useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useDashboard } from "../../hooks/useDashboard";
import { StatCard } from "../../components/StatCard";
import { RankRow } from "../../components/RankRow";
import { SectionHeader } from "../../components/SectionHeader";
import { EmptyState } from "../../components/EmptyState";
import { IconGamepad, IconClock, IconPrice, IconCalendar } from "../../icons";
import { theme } from "../../theme";
import { formatDuration, formatDisplayCurrency } from "../../utils/format";

type Nav = NativeStackNavigationProp<any>;

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();
  const { summary, charts, loading, fetchAll } = useDashboard();

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchAll} tintColor={theme.colors.accent} />
        }
      >
        {/* ── Title ── */}
        <View style={styles.header}>
          <Text style={styles.eyebrow}>概览</Text>
          <Text style={styles.title}>
            Nintendo <Text style={styles.titleAccent}>GameTime</Text>
          </Text>
        </View>

        {/* ── Stat Cards — single row ── */}
        <View style={styles.statsRow}>
          <StatCard icon={<IconGamepad size={16} color={theme.colors.accent} />} label="已拥有" value={String(summary?.totalGames ?? 0)} accentColor={theme.colors.accent} />
          <StatCard icon={<IconClock size={16} color="#d49d32" />} label="累计时长" value={formatDuration(summary?.totalMinutes ?? 0)} accentColor="#d49d32" />
          <StatCard icon={<IconPrice size={16} color="#3b6fd0" />} label="目录总价" value={formatDisplayCurrency(summary?.totalPriceAmount ?? 0, summary?.priceCurrency ?? "JPY", "DOMESTIC")} accentColor="#3b6fd0" />
          <StatCard icon={<IconCalendar size={16} color="#3d8c7d" />} label="近30天" value={formatDuration(summary?.recent30Minutes ?? 0)} accentColor="#3d8c7d" />
        </View>

        {/* ── Sync info ── */}
        <Text style={styles.syncInfo}>
          {summary?.lastSyncAt
            ? `上次同步 ${summary.lastSyncAt.slice(0, 10)}`
            : "下拉刷新同步数据"}
        </Text>

        {/* ── Data Source ── */}
        {summary?.dataSource && (
          <View style={styles.sourceBar}>
            <Text style={styles.sourceText}>
              🟢 {summary.dataSource.official} 官方  ·  🟡 {summary.dataSource.corrected} 修正  ·  ⚪ {summary.dataSource["manual-only"]} 手动
            </Text>
          </View>
        )}

        {/* ── Ranking ── */}
        <SectionHeader
          title="游玩时长排行"
          subtitle={charts?.ranking?.length ? `${charts.ranking.length} 款` : undefined}
        />
        {charts?.ranking?.length ? (
          charts.ranking.slice(0, 10).map((item, i) => {
            const maxMin = charts.ranking[0]?.minutes ?? 1;
            return (
              <RankRow
                key={item.gameId}
                rank={i + 1}
                title={item.zhTitle || item.zhName || item.title || item.name || ""}
                coverUrl={item.coverUrl}
                minutes={item.minutes ?? item.value ?? 0}
                maxMinutes={maxMin}
                onPress={() => nav.navigate("Library", { screen: "GameDetail", params: { gameId: item.gameId } })}
              />
            );
          })
        ) : (
          <View style={styles.emptyWrap}>
            <EmptyState message={loading ? undefined : "暂无游玩记录"} />
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { paddingBottom: 80 },

  // Header
  header: {
    alignItems: "center", paddingTop: 24, paddingBottom: 18,
    paddingHorizontal: 24,
  },
  eyebrow: { color: theme.colors.muted, fontSize: 12, fontWeight: "600", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6 },
  title: { color: theme.colors.ink, fontSize: 26, fontWeight: "800", textAlign: "center" },
  titleAccent: { color: theme.colors.accent },

  // Stats row
  statsRow: { flexDirection: "row", paddingHorizontal: 16, gap: 6 },
  syncInfo: { color: theme.colors.muted, fontSize: 12, textAlign: "center", marginTop: 12, marginBottom: 4 },

  // Source bar
  sourceBar: {
    marginHorizontal: 24, marginTop: 12,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: theme.colors.surface, borderRadius: 10,
  },
  sourceText: { color: theme.colors.muted, fontSize: 12, textAlign: "center" },

  // Empty
  emptyWrap: { paddingHorizontal: 24, paddingVertical: 16 },
});
