import { useState, useCallback, useEffect } from "react";
import { api, saveToken, clearToken, getToken, parseJwt } from "../api/client";

export type AuthUser = { userId: string; email: string };

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Check stored token on mount
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        const parsed = parseJwt(token);
        if (parsed) {
          setUser(parsed);
        } else {
          // Token exists but can't be parsed — clear it
          await clearToken();
        }
      }
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    console.log("[AUTH] login called with email:", email);
    const { data } = await api.post("/api/auth/login", { email, password });
    console.log("[AUTH] login response:", JSON.stringify({ token: data.token?.substring(0, 20) + "...", user: data.user }));
    await saveToken(data.token);
    // Use the user object from backend response directly (more reliable than JWT parsing)
    if (data.user) {
      const authUser = { userId: data.user.id, email: data.user.email };
      console.log("[AUTH] setting user:", JSON.stringify(authUser));
      setUser(authUser);
    } else {
      console.warn("[AUTH] login response missing user object!");
    }
    return data;
  }, []);

  const register = useCallback(async (email: string, code: string, password: string) => {
    console.log("[AUTH] register called with email:", email);
    const { data } = await api.post("/api/auth/register", { email, code, password });
    console.log("[AUTH] register response:", JSON.stringify({ token: data.token?.substring(0, 20) + "...", user: data.user }));
    await saveToken(data.token);
    // Use the user object from backend response directly
    if (data.user) {
      const authUser = { userId: data.user.id, email: data.user.email };
      console.log("[AUTH] setting user:", JSON.stringify(authUser));
      setUser(authUser);
    } else {
      console.warn("[AUTH] register response missing user object!");
    }
    return data;
  }, []);

  const sendCode = useCallback(async (email: string) => {
    return api.post("/api/auth/send-code", { email });
  }, []);

  const logout = useCallback(async () => {
    await clearToken();
    setUser(null);
  }, []);

  return { user, loading, login, register, sendCode, logout };
}
