import { useState, useCallback } from "react";
import { api } from "../api/client";

export type DashboardSummary = {
  totalGames: number;
  totalMinutes: number;
  totalPriceAmount: number;
  priceCurrency: string;
  recent30Minutes: number;
  lastSyncAt: string | null;
  dataSource: { official: number; corrected: number; "manual-only": number };
};

export type ChartItem = { gameId: string; name?: string; zhName?: string; title?: string; zhTitle?: string; value?: number; minutes?: number; coverUrl?: string };

export type DashboardCharts = {
  donut: ChartItem[];
  ranking: ChartItem[];
  treemap?: unknown;
};

export function useDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [charts, setCharts] = useState<DashboardCharts | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, chartRes] = await Promise.all([
        api.get<DashboardSummary>("/api/dashboard/summary"),
        api.get<DashboardCharts>("/api/dashboard/charts", { params: { range: "30d" } }),
      ]);
      setSummary(sumRes.data);
      setCharts(chartRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  const runSync = useCallback(async () => {
    const { data } = await api.post("/api/sync/run");
    return data;
  }, []);

  return { summary, charts, loading, fetchAll, runSync };
}
