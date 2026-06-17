import React, { useRef, useCallback, useState, useEffect } from "react";
import { Modal, View, TouchableOpacity, Text, StyleSheet, ActivityIndicator, Linking, Alert } from "react-native";
import { WebView } from "react-native-webview";
import { api, API_BASE_URL } from "../api/client";
import { theme } from "../theme";
import { getErrorMessage } from "../utils/format";

type Props = {
  visible: boolean;
  onClose: () => void;
  onCaptured: (url: string) => void;
};

const REDIRECT_PREFIX = "npf71b963c1b7b6d119://auth";

export function NintendoLoginModal({ visible, onClose, onCaptured }: Props) {
  const capturedRef = useRef(false);
  const [pageLoaded, setPageLoaded] = useState(false);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState(false);

  // Fetch the Nintendo login URL from backend (includes PKCE params)
  useEffect(() => {
    if (!visible) return;
    setPageLoaded(false);
    setFetchError(false);
    setLoginUrl(null);
    capturedRef.current = false;
    (async () => {
      try {
        const { data } = await api.get("/api/auth/nintendo/login-url");
        setLoginUrl(data.url);
      } catch {
        setFetchError(true);
      }
    })();
  }, [visible]);

  const handleNavigationChange = useCallback(
    (navState: { url: string; loading: boolean }) => {
      if (capturedRef.current) return;

      // Intercept Nintendo's OAuth redirect BEFORE it leaves the WebView
      if (navState.url.startsWith(REDIRECT_PREFIX)) {
        capturedRef.current = true;
        onCaptured(navState.url);
      }
    },
    [onCaptured]
  );

  const handleClose = () => {
    capturedRef.current = false;
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        {/* Header bar */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>✕  取消</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Nintendo 账号登录</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Loading / error state */}
        {fetchError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>网络连接失败</Text>
            <Text style={styles.errorDesc}>
              App 内 WebView 无法访问 Nintendo 官网。{"\n"}
              请使用系统浏览器登录。
            </Text>
            <TouchableOpacity
              style={styles.fallbackBtn}
              onPress={async () => {
                // Open in system browser (which has VPN/proxy if configured)
                try {
                  const { data } = await api.get("/api/auth/nintendo/login-url");
                  await Linking.openURL(data.url);
                  onClose();
                } catch (e) {
                  Alert.alert("", getErrorMessage(e, "无法打开浏览器"));
                }
              }}
            >
              <Text style={styles.fallbackBtnText}>🌐 使用系统浏览器打开</Text>
            </TouchableOpacity>
          </View>
        ) : !loginUrl ? (
          <View style={styles.webviewLoading}>
            <ActivityIndicator size="large" color={theme.colors.accent} />
          </View>
        ) : (
          <WebView
            source={{ uri: loginUrl }}
            onNavigationStateChange={handleNavigationChange}
            onLoadEnd={() => setPageLoaded(true)}
            startInLoadingState
            renderLoading={() => (
              <View style={styles.webviewLoading}>
                <ActivityIndicator size="large" color={theme.colors.accent} />
              </View>
            )}
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            cacheEnabled={false}
            // Fix input detection: ensure keyboard events trigger JS onChange
            keyboardDisplayRequiresUserAction={false}
            // Allow mixed content if Nintendo serves http resources
            mixedContentMode="always"
            onShouldStartLoadWithRequest={(request) => {
              if (request.url.startsWith(REDIRECT_PREFIX)) {
                capturedRef.current = true;
                onCaptured(request.url);
                return false;
              }
              return true;
            }}
            // Intercept the native input value setter so React detects text changes.
            // Must run BEFORE the page's JS to hook into the prototype chain.
            injectedJavaScriptBeforeContentLoaded={`
              (function() {
                var nativeSetter = Object.getOwnPropertyDescriptor(
                  window.HTMLInputElement.prototype, 'value'
                ).set;
                Object.defineProperty(window.HTMLInputElement.prototype, 'value', {
                  set: function(val) {
                    nativeSetter.call(this, val);
                    // Dispatch 'input' event with bubbling — React listens for this
                    this.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                  }
                });
              })();
              true;
            `}
            style={styles.webview}
          />
        )}

        {/* Loading bar — only while WebView is loading */}
        {!fetchError && loginUrl && !pageLoaded && (
          <View style={styles.loadingBar}>
            <ActivityIndicator size="small" color={theme.colors.accent} />
            <Text style={styles.loadingText}>正在连接 Nintendo...</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 54,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  closeBtn: { padding: 8 },
  closeText: { color: theme.colors.accent, fontSize: 16, fontWeight: "600" },
  headerTitle: { color: theme.colors.ink, fontSize: 16, fontWeight: "700" },
  loadingBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 8, backgroundColor: theme.colors.surfaceHover, gap: 8,
  },
  loadingText: { color: theme.colors.muted, fontSize: 12 },
  webview: { flex: 1, backgroundColor: "#fff" },
  errorBox: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 40, gap: 16,
  },
  errorTitle: { color: theme.colors.ink, fontSize: 18, fontWeight: "700" },
  errorDesc: { color: theme.colors.muted, fontSize: 14, textAlign: "center", lineHeight: 22 },
  fallbackBtn: {
    backgroundColor: theme.colors.accent, borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 32, marginTop: 8,
  },
  fallbackBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  webviewLoading: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center", justifyContent: "center",
    backgroundColor: theme.colors.bg,
  },
});
