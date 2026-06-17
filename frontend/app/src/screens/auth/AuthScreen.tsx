import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { theme } from "../../theme";
import { getErrorMessage } from "../../utils/format";

export function AuthScreen() {
  const { login, register, sendCode } = useAuth();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [codeCountdown, setCodeCountdown] = useState(0);
  const [devCode, setDevCode] = useState("");

  const handleLogin = async () => {
    if (!email.trim() || !password) { Alert.alert("", "请输入邮箱和密码"); return; }
    setLoading(true);
    try { await login(email.trim(), password); }
    catch (e) { Alert.alert("登录失败", getErrorMessage(e, "登录失败")); }
    finally { setLoading(false); }
  };

  const handleSendCode = async () => {
    if (!email.trim()) { Alert.alert("", "请先输入邮箱"); return; }
    try {
      const { data } = await sendCode(email.trim());
      if (data?.code) setDevCode(data.code);
      setCodeCountdown(60);
      const t = setInterval(() => setCodeCountdown((c) => {
        if (c <= 1) { clearInterval(t); return 0; }
        return c - 1;
      }), 1000);
    } catch (e) {
      Alert.alert("", getErrorMessage(e, "发送验证码失败"));
    }
  };

  const handleRegister = async () => {
    if (!email.trim() || !password) { Alert.alert("", "请输入邮箱和密码"); return; }
    if (!code) { Alert.alert("", "请输入验证码"); return; }
    if (password !== confirmPw) { Alert.alert("", "两次密码不一致"); return; }
    setLoading(true);
    try { await register(email.trim(), code, password); }
    catch (e) { Alert.alert("注册失败", getErrorMessage(e, "注册失败")); }
    finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Brand */}
        <View style={styles.brand}>
          <Text style={styles.brandIcon}>🎮</Text>
          <Text style={styles.brandTitle}>Nintendo GameTime</Text>
          <Text style={styles.brandSub}>Switch 游戏管理 & 时长追踪</Text>
        </View>

        {/* Tab switcher */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, tab === "login" && styles.tabActive]}
            onPress={() => setTab("login")}
          >
            <Text style={[styles.tabText, tab === "login" && styles.tabTextActive]}>登录</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, tab === "register" && styles.tabActive]}
            onPress={() => setTab("register")}
          >
            <Text style={[styles.tabText, tab === "register" && styles.tabTextActive]}>注册</Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="邮箱地址"
            placeholderTextColor={theme.colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />

          {tab === "register" && (
            <View style={styles.codeRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="验证码"
                placeholderTextColor={theme.colors.muted}
                keyboardType="number-pad"
                value={code}
                onChangeText={setCode}
              />
              <TouchableOpacity
                style={[styles.codeBtn, codeCountdown > 0 && { opacity: 0.5 }]}
                onPress={handleSendCode}
                disabled={codeCountdown > 0}
              >
                <Text style={styles.codeBtnText}>
                  {codeCountdown > 0 ? `${codeCountdown}s` : "发送"}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <TextInput
            style={styles.input}
            placeholder="密码"
            placeholderTextColor={theme.colors.muted}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {tab === "register" && (
            <TextInput
              style={styles.input}
              placeholder="确认密码"
              placeholderTextColor={theme.colors.muted}
              secureTextEntry
              value={confirmPw}
              onChangeText={setConfirmPw}
            />
          )}

          {__DEV__ && devCode !== "" && (
            <View style={styles.devCodeBox}>
              <Text style={styles.devCodeText}>🔧 验证码: {devCode}</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submitBtn, loading && { opacity: 0.6 }]}
            onPress={tab === "login" ? handleLogin : handleRegister}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.submitText}>
              {loading ? "处理中..." : tab === "login" ? "登  录" : "注  册"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 28, paddingVertical: 48 },

  // Brand
  brand: { alignItems: "center", marginBottom: 40 },
  brandIcon: { fontSize: 56, marginBottom: 12 },
  brandTitle: { color: theme.colors.ink, fontSize: 26, fontWeight: "800", letterSpacing: 0.5 },
  brandSub: { color: theme.colors.muted, fontSize: 14, marginTop: 6 },

  // Tabs
  tabs: {
    flexDirection: "row", marginBottom: 24, borderRadius: 12, overflow: "hidden",
    backgroundColor: theme.colors.surface,
  },
  tab: { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabActive: { backgroundColor: theme.colors.accent },
  tabText: { color: theme.colors.muted, fontSize: 16, fontWeight: "600" },
  tabTextActive: { color: "#fff" },

  // Form
  form: { gap: 14 },
  input: {
    backgroundColor: theme.colors.surface, borderRadius: 12,
    paddingHorizontal: 18, paddingVertical: 15, color: theme.colors.ink,
    fontSize: 16, borderWidth: 1, borderColor: theme.colors.border,
  },
  codeRow: { flexDirection: "row", gap: 10 },
  codeBtn: {
    backgroundColor: theme.colors.accentStrong, borderRadius: 12,
    justifyContent: "center", paddingHorizontal: 20,
  },
  codeBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  devCodeBox: {
    backgroundColor: theme.colors.surface, borderRadius: 8, paddingVertical: 8,
    alignItems: "center",
  },
  devCodeText: { color: theme.colors.warning, fontSize: 13 },

  // Submit
  submitBtn: {
    backgroundColor: theme.colors.accent, borderRadius: 12,
    paddingVertical: 16, alignItems: "center", marginTop: 8,
  },
  submitText: { color: "#fff", fontSize: 17, fontWeight: "800", letterSpacing: 4 },
});
