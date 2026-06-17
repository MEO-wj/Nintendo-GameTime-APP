import { useState, useCallback, useRef } from "react";
import { api } from "../api/client";

export type CatalogItem = {
  externalId: string;
  title: string;
  coverUrl?: string | null;
  priceAmount?: number;
  priceCurrency?: string;
  platform: string;
  region: string;
  publisher?: string;
  releaseDate?: string;
  isOwned?: boolean;
  ownedGameId?: string;
  localizations?: Record<string, { title?: string; description?: string }>;
};

export type CatalogDetail = CatalogItem & {
  description?: string;
  storeUrl?: string;
  criticScore?: number;
  playerRating?: { userScore: number; averageScore: number; ratingCount: number };
  ownedGame?: { id: string } | null;
  corrections?: unknown[];
};

export function useCatalog() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [query, setQuery] = useState("");
  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);

  const search = useCallback(async (q: string, reset = false) => {
    // Prevent concurrent fetches
    if (loadingRef.current) return;
    loadingRef.current = true;
    setQuery(q);
    setLoading(true);

    try {
      const params: Record<string, string> = { limit: "20" };
      if (q) params.q = q;
      if (!reset && cursorRef.current) {
        params.cursor = cursorRef.current;
      }
      const { data } = await api.get("/api/catalog/games", { params });
      setItems(reset ? data.items : (prev) => [...prev, ...data.items]);
      cursorRef.current = data.nextCursor ?? null;
      setHasMore(!!data.nextCursor);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []); // stable — uses refs instead of state

  const reset = useCallback(() => {
    setItems([]);
    cursorRef.current = null;
    setHasMore(true);
  }, []);

  return { items, loading, hasMore, query, search, reset };
}

export function useCatalogDetail(externalId: string) {
  const [detail, setDetail] = useState<CatalogDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/api/catalog/games/${externalId}`);
      setDetail(data);
    } finally {
      setLoading(false);
    }
  }, [externalId]);

  const addToLibrary = useCallback(async () => {
    return api.post("/api/games/library", { externalId });
  }, [externalId]);

  return { detail, loading, fetch, addToLibrary };
}
