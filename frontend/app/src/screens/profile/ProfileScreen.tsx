import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  TextInput, ActivityIndicator, Linking,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePreferences } from "../../hooks/usePreferences";
import { useAuth } from "../../hooks/useAuth";
import { api } from "../../api/client";
import { SectionHeader } from "../../components/SectionHeader";
import { getErrorMessage } from "../../utils/format";
import { formatRelativeTime } from "../../utils/date";
import { theme } from "../../theme";

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { pref, nintendo, syncJob, fetchAll, updateMarketMode, bindNintendo } = usePreferences();

  // States
  const [syncing, setSyncing] = useState(false);
  const [unbinding, setUnbinding] = useState(false);
  const [lastSyncLabel, setLastSyncLabel] = useState<string | null>(null);
  const [displayNickname, setDisplayNickname] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [editingNickname, setEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [binding, setBinding] = useState(false);
  const [bindInput, setBindInput] = useState("");
  const [showBindInput, setShowBindInput] = useState(false);

  const emailPrefix = user?.email?.split("@")[0] ?? "玩家";

  // ─── Load data ──────────────────────────────────────────────

  useEffect(() => {
    fetchAll();
    (async () => {
      try {
        const { data } = await api.get("/api/dashboard/summary");
        if (data?.lastSyncAt) setLastSyncLabel(formatRelativeTime(data.lastSyncAt));
      } catch { /* noop */ }
    })();
  }, [fetchAll]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/api/accounts/profile");
        setDisplayNickname(data.nickname || emailPrefix);
        setAvatarUrl(data.avatarUrl || null);
      } catch { /* use default */ }
    })();
  }, []);

  // ─── Avatar & Nickname ──────────────────────────────────────

  const handlePickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("", "需要相册权限"); return; }
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
    });
    if (!r.canceled && r.assets[0]?.base64) {
      const b64 = `data:image/jpeg;base64,${r.assets[0].base64}`;
      setSaving(true);
      try { await api.put("/api/accounts/profile", { avatarUrl: b64 }); setAvatarUrl(b64); }
      catch (e) { Alert.alert("", getErrorMessage(e, "更新失败")); }
      finally { setSaving(false); }
    }
  };

  const handleSaveNickname = async () => {
    const t = nicknameDraft.trim();
    if (!t) { Alert.alert("", "昵称不能为空"); return; }
    setSaving(true);
    try { await api.put("/api/accounts/profile", { nickname: t }); setDisplayNickname(t); setEditingNickname(false); }
    catch (e) { Alert.alert("", getErrorMessage(e, "更新失败")); }
    finally { setSaving(false); }
  };

  // ─── Nintendo Binding ────────────────────────────────────────

  const doBind = useCallback(async (rawUrl: string) => {
    setBinding(true);
    try {
      const codeMatch = rawUrl.match(/session_token_code=([^&\s#]+)/);
      const stateMatch = rawUrl.match(/[?&#]state=([^&\s#]+)/);
      if (!codeMatch) {
        Alert.alert("绑定失败", "未检测到登录令牌。\n请确认复制了浏览器地址栏的完整链接。");
        return;
      }
      await bindNintendo(codeMatch[1], stateMatch ? stateMatch[1] : "");
      Alert.alert("绑定成功", "Nintendo 账号已绑定，可同步游戏数据了！");
      setShowBindInput(false);
      setBindInput("");
      fetchAll();
    } catch (e) {
      Alert.alert("绑定失败", getErrorMessage(e, "绑定失败"));
    } finally { setBinding(false); }
  }, [bindNintendo, fetchAll]);

  const handleOpenLogin = async () => {
    // Fetch login URL from backend and open in system browser.
    // System browser handles the login page correctly (unlike WebView on Android).
    try {
      const { data } = await api.get("/api/auth/nintendo/login-url");
      await Linking.openURL(data.url);
    } catch (e) {
      Alert.alert("", "无法打开浏览器，请稍后重试");
      return;
    }
    // After user returns from browser, check clipboard for the redirect URL
    setTimeout(async () => {
      try {
        const text = await Clipboard.getStringAsync();
        if (text && text.includes("session_token_code=")) {
          Alert.alert("检测到登录链接", "是否完成绑定？", [
            { text: "取消", style: "cancel" },
            { text: "绑定", onPress: () => doBind(text) },
          ]);
        }
      } catch { /* noop */ }
    }, 1200);
  };

  const handlePasteBind = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text && text.includes("session_token_code=")) {
        doBind(text);
      } else {
        setShowBindInput(true);
        Alert.alert("", "剪贴板未检测到链接，请手动粘贴");
      }
    } catch { setShowBindInput(true); }
  };

  const handleManualBind = () => {
    if (!bindInput.trim()) { Alert.alert("", "请先粘贴链接"); return; }
    doBind(bindInput.trim());
  };

  // ─── Sync & Unbind ─────────────────────────────────────────

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try { await api.post("/api/sync/run"); fetchAll(); }
    catch (e) { Alert.alert("", getErrorMessage(e, "同步失败")); }
    finally { setSyncing(false); }
  }, [fetchAll]);

  const handleUnbind = () => {
    Alert.alert("解除绑定", "解除后将无法同步数据，确定继续？", [
      { text: "取消", style: "cancel" },
      { text: "解除", style: "destructive", onPress: async () => {
        setUnbinding(true);
        try { await api.delete("/api/accounts/nintendo"); fetchAll(); }
        catch (e) { Alert.alert("", getErrorMessage(e, "解绑失败")); }
        finally { setUnbinding(false); }
      }},
    ]);
  };

  const handleLogout = () => {
    Alert.alert("退出登录", "确定退出当前账号？", [
      { text: "取消", style: "cancel" },
      { text: "退出", style: "destructive", onPress: logout },
    ]);
  };

  // ─── Render ──────────────────────────────────────────────────

  const isBound = nintendo?.bound;
  const syncSubtitle = isBound
    ? (lastSyncLabel ? `上次同步 ${lastSyncLabel}` : "已绑定，可同步数据")
    : "绑定后可同步 Nintendo 游戏数据";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ═══ Profile Hero ═══ */}
        <View style={styles.hero}>
          <TouchableOpacity onPress={handlePickAvatar} activeOpacity={0.7} disabled={saving}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarLetter}>
                  {displayNickname[0]?.toUpperCase() || emailPrefix[0]?.toUpperCase() || "N"}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {editingNickname ? (
            <View style={styles.nickEditRow}>
              <TextInput style={styles.nickInput} value={nicknameDraft}
                onChangeText={setNicknameDraft} maxLength={32} autoFocus
                onSubmitEditing={handleSaveNickname} placeholder="输入昵称"
                placeholderTextColor={theme.colors.muted} />
              <TouchableOpacity style={styles.nickSave} onPress={handleSaveNickname}>
                <Text style={styles.nickSaveText}>✓</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.nickCancel} onPress={() => setEditingNickname(false)}>
                <Text style={styles.nickCancelText}>✕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.nickRow}
              onPress={() => { setNicknameDraft(displayNickname); setEditingNickname(true); }}>
              <Text style={styles.nickname}>{displayNickname || emailPrefix}</Text>
              <Text style={styles.editIcon}> ✎</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.email}>{user?.email ?? ""}</Text>
        </View>

        {/* ═══ Nintendo Binding ═══ */}
        <SectionHeader title="Nintendo 账号" subtitle={syncSubtitle} />

        {isBound ? (
          <View style={styles.card}>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>
                已绑定 · {nintendo?.region === "JP" ? "日区" : nintendo?.region === "GLOBAL" ? "国际服" : "未知区域"}
              </Text>
            </View>
            {lastSyncLabel && <Text style={styles.syncInfo}>最近同步：{lastSyncLabel}</Text>}
            {syncJob?.status === "RUNNING" && (
              <View style={styles.syncingRow}>
                <ActivityIndicator size="small" color={theme.colors.accent} />
                <Text style={styles.syncingText}>同步中...</Text>
              </View>
            )}
            {syncJob?.errorSummary && <Text style={styles.errorText}>⚠ {syncJob.errorSummary}</Text>}
            <TouchableOpacity style={styles.btnPrimary} onPress={handleSync} disabled={syncing}>
              <Text style={styles.btnPrimaryText}>{syncing ? "同步中..." : "立即同步游戏数据"}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnDanger} onPress={handleUnbind} disabled={unbinding}>
              <Text style={styles.btnDangerText}>{unbinding ? "解绑中..." : "解除 Nintendo 绑定"}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.bindDesc}>
              绑定 Nintendo 账号后，可自动同步游戏时长和游玩记录。
            </Text>
            <TouchableOpacity style={styles.btnPrimary} onPress={handleOpenLogin} disabled={binding}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {binding && <ActivityIndicator size="small" color="#fff" />}
                <Text style={styles.btnPrimaryText}>
                  {binding ? "绑定中..." : "🔗  绑定 Nintendo 账号"}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={styles.stepsBox}>
              <Text style={styles.stepsTitle}>📋 操作步骤：</Text>
              <Text style={styles.step}>1. 点击上方按钮，跳转系统浏览器打开 Nintendo 登录</Text>
              <Text style={styles.step}>2. 输入账号密码，点击登录并选择「此人」授权</Text>
              <Text style={styles.step}>3. 浏览器跳转到空白页后，复制地址栏完整链接</Text>
              <Text style={styles.step}>4. 返回 App，点击下方按钮自动读取剪贴板绑定</Text>
            </View>

            <TouchableOpacity style={styles.btnSecondary} onPress={handlePasteBind}>
              <Text style={styles.btnSecondaryText}>📋 从剪贴板读取并绑定</Text>
            </TouchableOpacity>

            {showBindInput && (
              <View style={styles.manualBind}>
                <TextInput style={styles.bindInput}
                  placeholder="粘贴浏览器地址栏的完整链接..."
                  placeholderTextColor={theme.colors.muted}
                  value={bindInput} onChangeText={setBindInput}
                  multiline autoCapitalize="none" />
                <TouchableOpacity style={styles.btnPrimary} onPress={handleManualBind} disabled={binding}>
                  <Text style={styles.btnPrimaryText}>确认绑定</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* ═══ Preferences ═══ */}
        <SectionHeader title="显示偏好" />
        <View style={styles.card}>
          <Text style={styles.prefLabel}>价格显示</Text>
          <View style={styles.prefRow}>
            {(["DOMESTIC", "GLOBAL"] as const).map((m) => (
              <TouchableOpacity key={m}
                style={[styles.prefBtn, pref?.marketMode === m && styles.prefBtnActive]}
                onPress={() => updateMarketMode(m)}>
                <Text style={[styles.prefText, pref?.marketMode === m && styles.prefTextActive]}>
                  {m === "DOMESTIC" ? "¥ 人民币" : "$ 国际"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ═══ Logout ═══ */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>退出登录</Text>
        </TouchableOpacity>

        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { paddingBottom: 40 },

  hero: { alignItems: "center", paddingTop: 48, paddingBottom: 24 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: theme.colors.surfaceHover, marginBottom: 16 },
  avatarPlaceholder: { width: 88, height: 88, borderRadius: 44, backgroundColor: theme.colors.accent, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  avatarLetter: { color: "#fff", fontSize: 36, fontWeight: "800" },
  nickRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  nickname: { color: theme.colors.ink, fontSize: 22, fontWeight: "700" },
  editIcon: { color: theme.colors.muted, fontSize: 18 },
  nickEditRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  nickInput: { backgroundColor: theme.colors.surface, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.accent, paddingHorizontal: 16, paddingVertical: 8, color: theme.colors.ink, fontSize: 18, fontWeight: "600", minWidth: 140, textAlign: "center" },
  nickSave: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.accent, alignItems: "center", justifyContent: "center" },
  nickSaveText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  nickCancel: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.surfaceHover, alignItems: "center", justifyContent: "center" },
  nickCancelText: { color: theme.colors.muted, fontSize: 16, fontWeight: "600" },
  email: { color: theme.colors.muted, fontSize: 14, marginTop: 2 },

  card: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 20, marginHorizontal: 20, marginBottom: 12 },

  statusRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.success, marginRight: 8 },
  statusText: { color: theme.colors.success, fontSize: 15, fontWeight: "600" },
  syncInfo: { color: theme.colors.muted, fontSize: 13, marginBottom: 4 },
  syncingRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  syncingText: { color: theme.colors.accent, fontSize: 13, marginLeft: 8 },
  errorText: { color: theme.colors.joyRed, fontSize: 12, marginBottom: 8 },

  bindDesc: { color: theme.colors.ink, fontSize: 14, lineHeight: 22, marginBottom: 16 },
  stepsBox: { backgroundColor: theme.colors.surfaceHover, borderRadius: 10, padding: 14, marginBottom: 12 },
  stepsTitle: { color: theme.colors.ink, fontSize: 13, fontWeight: "700", marginBottom: 8 },
  step: { color: theme.colors.muted, fontSize: 12, lineHeight: 20, marginBottom: 2 },
  manualBind: { gap: 10, marginTop: 12 },

  bindInput: { backgroundColor: theme.colors.surfaceHover, borderRadius: 10, borderWidth: 1, borderColor: theme.colors.border, padding: 12, color: theme.colors.ink, fontSize: 12, minHeight: 50, textAlignVertical: "top" },

  btnPrimary: { backgroundColor: theme.colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  btnSecondary: { backgroundColor: theme.colors.surfaceHover, borderRadius: 12, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: theme.colors.border },
  btnSecondaryText: { color: theme.colors.ink, fontSize: 14, fontWeight: "600" },
  btnDanger: { borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 10, borderWidth: 1, borderColor: theme.colors.joyRed },
  btnDangerText: { color: theme.colors.joyRed, fontSize: 14, fontWeight: "600" },

  prefLabel: { color: theme.colors.muted, fontSize: 13, marginBottom: 10 },
  prefRow: { flexDirection: "row", gap: 10 },
  prefBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: theme.colors.surfaceHover },
  prefBtnActive: { backgroundColor: theme.colors.accent },
  prefText: { color: theme.colors.muted, fontSize: 14, fontWeight: "600" },
  prefTextActive: { color: "#fff" },

  logoutBtn: { marginHorizontal: 20, marginTop: 24, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.joyRed, alignItems: "center" },
  logoutText: { color: theme.colors.joyRed, fontSize: 15, fontWeight: "600" },
});
