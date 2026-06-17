import { useState, useCallback } from "react";
import { api } from "../api/client";

export type UserPreference = {
  userId: string;
  marketMode: "DOMESTIC" | "GLOBAL";
  createdAt: string;
  updatedAt: string;
};

export type FxRates = {
  base: string;
  rates: Record<string, number>;
};

export type NintendoAccount = {
  bound: boolean;
  region?: string;
  lastSyncAt?: string | null;
  syncFailCount?: number;
};

export type SyncJob = {
  id: string;
  status: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED";
  startedAt?: string;
  finishedAt?: string;
  errorSummary?: string;
};

export function usePreferences() {
  const [pref, setPref] = useState<UserPreference | null>(null);
  const [fx, setFx] = useState<FxRates | null>(null);
  const [nintendo, setNintendo] = useState<NintendoAccount | null>(null);
  const [syncJob, setSyncJob] = useState<SyncJob | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [prefRes, nintRes, syncRes] = await Promise.all([
        api.get("/api/accounts/preferences"),
        api.get("/api/accounts/nintendo"),
        api.get("/api/sync/status"),
      ]);
      setPref(prefRes.data.preference);
      setFx(prefRes.data.fx);
      setNintendo(nintRes.data);
      setSyncJob(syncRes.data.status ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateMarketMode = useCallback(async (marketMode: "DOMESTIC" | "GLOBAL") => {
    const { data } = await api.put("/api/accounts/preferences", { marketMode });
    setPref(data);
  }, []);

  const bindNintendo = useCallback(async (sessionTokenCode?: string, state?: string, sessionToken?: string) => {
    const body: Record<string, string> = {};
    if (sessionTokenCode) { body.sessionTokenCode = sessionTokenCode; body.state = state ?? ""; }
    else if (sessionToken) body.sessionToken = sessionToken;
    const { data } = await api.post("/api/accounts/nintendo/bind", body);
    return data;
  }, []);

  return { pref, fx, nintendo, syncJob, loading, fetchAll, updateMarketMode, bindNintendo };
}
