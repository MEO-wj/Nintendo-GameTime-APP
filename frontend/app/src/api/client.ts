import axios from "axios";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

// Auto-detect the host machine IP from Expo dev server URL.
// In Expo Go, Constants.expoConfig.hostUri tells us which host the app
// connected to (LAN IP for physical devices, localhost for emulators).
function getDevHost(): string {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    // hostUri looks like "192.168.x.x:8081" → extract the IP
    return hostUri.split(":")[0];
  }
  // Fallback for unknown environments
  return "192.168.100.2";
}

export const API_BASE_URL = __DEV__
  ? `http://${getDevHost()}:4000`
  : "https://api.gametime.example.com"; // production URL placeholder

const TOKEN_KEY = "nintendo_gametime_token";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: { "Content-Type": "application/json" },
});

// Attach JWT to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 401 → clear token and reload (will redirect to auth)
api.interceptors.response.use(
  (response) => {
    if (__DEV__) {
      console.log(`[API] ${response.status} ${response.config.method?.toUpperCase()} ${response.config.url}`);
    }
    return response;
  },
  async (error) => {
    if (__DEV__) {
      const status = error.response?.status ?? "NETWORK_ERROR";
      const url = error.config?.url ?? "?";
      console.warn(`[API] ${status} ${error.config?.method?.toUpperCase()} ${url}`);
    }
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
      // The RootNavigator will react to the missing token
    }
    return Promise.reject(error);
  }
);

// ─── Token helpers ─────────────────────────────────────────────

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

// ─── Auth helpers ──────────────────────────────────────────────

export function parseJwt(token: string): { userId: string; email: string } | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    // JWT uses base64url (no padding, - instead of +, _ instead of /)
    // atob/btoa expect standard base64 — fix up the encoding
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(base64));
    if (decoded.userId && decoded.email) {
      return { userId: decoded.userId, email: decoded.email };
    }
    return null;
  } catch {
    return null;
  }
}
