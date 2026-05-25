import Router from "@koa/router";
import sharp from "sharp";

const ALLOWED_HOSTS = new Set([
  "assets.nintendo.com",
  "www.nintendo.com",
  "images.igdb.com"
]);

const CACHE_MAX = 500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 10000;

interface CacheEntry {
  buffer: Buffer;
  expiresAt: number;
  fetchedAt: number;
}

export function createImageProxyRouter(): Router {
  const router = new Router();
  const cache = new Map<string, CacheEntry>();
  let cacheHits = 0;
  let cacheMisses = 0;

  function evictExpired() {
    const now = Date.now();
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) {
        cache.delete(key);
      }
    }
  }

  function evictOldest() {
    if (cache.size < CACHE_MAX) return;
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of cache) {
      if (entry.fetchedAt < oldestTime) {
        oldestTime = entry.fetchedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

  router.get("/api/proxy/image", async (ctx) => {
    const rawUrl = ctx.query.url as string | undefined;
    if (!rawUrl) {
      ctx.status = 400;
      ctx.body = { message: "Missing url parameter" };
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      ctx.status = 400;
      ctx.body = { message: "Invalid URL" };
      return;
    }

    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      ctx.status = 403;
      ctx.body = { message: "Host not allowed" };
      return;
    }

    const width = ctx.query.w ? Math.min(Math.max(Number(ctx.query.w), 50), 1200) : null;
    const quality = ctx.query.q ? Math.min(Math.max(Number(ctx.query.q), 10), 100) : 80;

    // Periodic cleanup
    if (cache.size > CACHE_MAX * 0.9) {
      evictExpired();
    }

    const cacheKey = rawUrl;
    const cached = cache.get(cacheKey);
    const isCached = cached && cached.expiresAt > Date.now();

    let sourceBuffer: Buffer;

    if (isCached) {
      sourceBuffer = cached.buffer;
      cacheHits++;
      ctx.set("X-Proxy-Cache", "HIT");
    } else {
      cacheMisses++;
      ctx.set("X-Proxy-Cache", "MISS");

      try {
        const response = await fetch(rawUrl, {
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "image/*,*/*"
          }
        });

        if (!response.ok) {
          ctx.status = 502;
          ctx.body = { message: `Upstream returned ${response.status}` };
          return;
        }

        const arrayBuffer = await response.arrayBuffer();
        sourceBuffer = Buffer.from(arrayBuffer);

        evictOldest();
        cache.set(cacheKey, {
          buffer: sourceBuffer,
          expiresAt: Date.now() + CACHE_TTL_MS,
          fetchedAt: Date.now()
        });
      } catch (error) {
        ctx.status = 502;
        ctx.body = { message: "Failed to fetch upstream image" };
        return;
      }
    }

    // Process with sharp: resize + convert to WebP
    try {
      let pipeline = sharp(sourceBuffer);
      if (width) {
        pipeline = pipeline.resize(width, null, {
          fit: "inside",
          withoutEnlargement: true
        });
      }
      const output = await pipeline.webp({ quality }).toBuffer();

      ctx.set("Content-Type", "image/webp");
      ctx.set("Cache-Control", "public, max-age=86400, immutable");
      ctx.set("X-Cache-Size", String(cache.size));
      ctx.body = output;
    } catch {
      // If sharp fails (e.g., not an image), return original
      ctx.set("Cache-Control", "public, max-age=86400");
      ctx.body = sourceBuffer;
    }
  });

  // Cache stats endpoint
  router.get("/api/proxy/image/stats", (ctx) => {
    ctx.body = {
      cacheSize: cache.size,
      cacheMax: CACHE_MAX,
      cacheHits,
      cacheMisses,
      hitRate: cacheHits + cacheMisses > 0
        ? Math.round((cacheHits / (cacheHits + cacheMisses)) * 100)
        : 0
    };
  });

  return router;
}
