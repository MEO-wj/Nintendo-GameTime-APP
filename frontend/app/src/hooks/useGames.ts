import { useState, useCallback, useRef } from "react";
import { api } from "../api/client";

export type GameItem = {
  id: string;
  externalId: string;
  title: string;
  coverUrl?: string | null;
  ownedAt?: string | null;
  lastPlayedAt?: string | null;
  platform: string;
  region: string;
  priceAmount?: number;
  priceCurrency?: string;
  effectivePlaytime?: {
    totalMinutes: number;
    officialMinutes: number;
    correctionDeltaMinutes: number;
    source: string;
    updatedAt: string;
  };
  localizations?: Record<string, { title?: string; description?: string }>;
};

export type GameDetail = GameItem & {
  description?: string;
  publisher?: string;
  releaseDate?: string;
  storeUrl?: string;
  criticScore?: number;
  playerRating?: { userScore: number; averageScore: number; ratingCount: number };
  corrections: CorrectionRow[];
};

export type CorrectionRow = {
  id: string;
  gameId: string;
  type: "SET_TOTAL" | "ADD_DELTA";
  minutes: number;
  reason: string;
  date?: string | null;
  createdAt: string;
  revokedAt?: string | null;
};

export function useGames() {
  const [games, setGames] = useState<GameItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);

  const fetchOwned = useCallback(async (tab = "owned", reset = false) => {
    // Prevent concurrent fetches
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    try {
      const params: Record<string, string> = { tab, limit: "20" };
      if (!reset && cursorRef.current) {
        params.cursor = cursorRef.current;
      }
      const { data } = await api.get("/api/games", { params });
      setGames(reset ? data.items : (prev) => [...prev, ...data.items]);
      cursorRef.current = data.nextCursor ?? null;
      setHasMore(!!data.nextCursor);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []); // stable — uses refs instead of state for cursor/loading

  const reset = useCallback(() => {
    setGames([]);
    cursorRef.current = null;
    setHasMore(true);
  }, []);

  return { games, loading, hasMore, fetchOwned, reset };
}

export function useGameDetail(gameId: string) {
  const [game, setGame] = useState<GameDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<GameDetail>(`/api/games/${gameId}`);
      setGame(data);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  return { game, loading, fetch };
}
