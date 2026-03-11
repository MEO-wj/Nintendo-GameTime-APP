const DEFAULT_CURRENCY = "USD";
const CACHE_TTL_MS = 1000 * 60 * 60;

export interface CatalogGame {
  externalId: string;
  title: string;
  coverUrl: string | null;
  storeUrl: string;
  description: string | null;
  publisher: string | null;
  releaseDate: string | null;
  priceAmount: number | null;
  priceCurrency: string;
  platform: "Switch";
  region: "GLOBAL";
}

export interface CatalogSeedEntry {
  externalId: string;
  title: string;
  storeUrl: string;
  fallbackCoverUrl: string | null;
  fallbackPriceAmount: number | null;
}

const CATALOG_SEEDS: CatalogSeedEntry[] = [
  {
    externalId: "the-legend-of-zelda-breath-of-the-wild-switch",
    title: "The Legend of Zelda: Breath of the Wild",
    storeUrl: "https://www.nintendo.com/us/store/products/the-legend-of-zelda-breath-of-the-wild-switch/",
    fallbackCoverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1r7h.jpg",
    fallbackPriceAmount: 59.99
  },
  {
    externalId: "super-mario-odyssey-switch",
    title: "Super Mario Odyssey",
    storeUrl: "https://www.nintendo.com/us/store/products/super-mario-odyssey-switch/",
    fallbackCoverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1mxf.jpg",
    fallbackPriceAmount: 59.99
  },
  {
    externalId: "mario-kart-8-deluxe-switch",
    title: "Mario Kart 8 Deluxe",
    storeUrl: "https://www.nintendo.com/us/store/products/mario-kart-8-deluxe-switch/",
    fallbackCoverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co2lb5.jpg",
    fallbackPriceAmount: 59.99
  },
  {
    externalId: "luigis-mansion-3-switch",
    title: "Luigi's Mansion 3",
    storeUrl: "https://www.nintendo.com/us/store/products/luigis-mansion-3-switch/",
    fallbackCoverUrl: "https://assets.nintendo.com/image/upload/b_auto,c_pad,dpr_2.0,f_auto,q_auto,w_300/b_rgb:ffffff/v1/store/software/switch/70010000001620/2b166fb3197dacfde1d939acd6a976b9fbe3b1a32c54f9f0d2c8d23efb22412d",
    fallbackPriceAmount: 59.99
  },
  {
    externalId: "super-mario-3d-world-plus-bowsers-fury-switch",
    title: "Super Mario 3D World + Bowser's Fury",
    storeUrl: "https://www.nintendo.com/us/store/products/super-mario-3d-world-plus-bowsers-fury-switch/",
    fallbackCoverUrl: "https://assets.nintendo.com/image/upload/b_auto,c_pad,dpr_2.0,f_auto,q_auto,w_300/b_rgb:ffffff/v1/store/software/switch/70010000034439/ccb69a8bf2746b2dc0a9b11a9e48c9893baa1631486326f0d681b7a36385221f",
    fallbackPriceAmount: 59.99
  },
  {
    externalId: "animal-crossing-new-horizons-switch",
    title: "Animal Crossing: New Horizons",
    storeUrl: "https://www.nintendo.com/us/store/products/animal-crossing-new-horizons-switch/",
    fallbackCoverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co5vmg.jpg",
    fallbackPriceAmount: 59.99
  },
  {
    externalId: "hollow-knight-switch",
    title: "Hollow Knight",
    storeUrl: "https://www.nintendo.com/us/store/products/hollow-knight-switch/",
    fallbackCoverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co2x4w.jpg",
    fallbackPriceAmount: 15
  },
  {
    externalId: "dead-cells-switch",
    title: "Dead Cells",
    storeUrl: "https://www.nintendo.com/us/store/products/dead-cells-switch/",
    fallbackCoverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1q7d.jpg",
    fallbackPriceAmount: 24.99
  },
  {
    externalId: "kirby-and-the-forgotten-land-switch",
    title: "Kirby and the Forgotten Land",
    storeUrl: "https://www.nintendo.com/us/store/products/kirby-and-the-forgotten-land-switch/",
    fallbackCoverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co6j0z.jpg",
    fallbackPriceAmount: 59.99
  },
  {
    externalId: "splatoon-3-switch",
    title: "Splatoon 3",
    storeUrl: "https://www.nintendo.com/us/store/products/splatoon-3-switch/",
    fallbackCoverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co6lbc.jpg",
    fallbackPriceAmount: 59.99
  },
  {
    externalId: "metroid-dread-switch",
    title: "Metroid Dread",
    storeUrl: "https://www.nintendo.com/us/store/products/metroid-dread-switch/",
    fallbackCoverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co3xz9.jpg",
    fallbackPriceAmount: 59.99
  },
  {
    externalId: "pikmin-4-switch",
    title: "Pikmin 4",
    storeUrl: "https://www.nintendo.com/us/store/products/pikmin-4-switch/",
    fallbackCoverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/co7b7r.jpg",
    fallbackPriceAmount: 59.99
  }
];

interface CachedCatalogItem {
  expiresAt: number;
  value: CatalogGame;
}

interface JsonLdProduct {
  title: string | null;
  description: string | null;
  coverUrl: string | null;
  storeUrl: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  publisher: string | null;
  releaseDate: string | null;
}

export interface CatalogService {
  listCatalog(input?: {
    query?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ items: CatalogGame[]; nextCursor: string | null }>;
  getCatalogGame(externalId: string): Promise<CatalogGame | null>;
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const value = Number.parseInt(decoded, 10);
    return Number.isFinite(value) && value >= 0 ? value : 0;
  } catch {
    return 0;
  }
}

function toAbsoluteUrl(value: string | null, fallback: string): string {
  if (!value) return fallback;
  try {
    return new URL(value, fallback).toString();
  } catch {
    return fallback;
  }
}

function parseJsonLdProduct(html: string): JsonLdProduct | null {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
  if (!match?.[1]) return null;

  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>;
    const graph = Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed];
    const product = graph.find((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const rawType = (entry as Record<string, unknown>)["@type"];
      const types = Array.isArray(rawType) ? rawType : [rawType];
      return types.includes("Product") || types.includes("VideoGame");
    }) as Record<string, unknown> | undefined;

    if (!product) return null;

    const offers =
      product.offers && typeof product.offers === "object"
        ? (product.offers as Record<string, unknown>)
        : null;
    const publisher =
      product.publisher && typeof product.publisher === "object"
        ? (product.publisher as Record<string, unknown>)
        : null;

    return {
      title: typeof product.name === "string" ? product.name : null,
      description: typeof product.description === "string" ? product.description : null,
      coverUrl: typeof product.image === "string" ? product.image : null,
      storeUrl: typeof product.url === "string" ? product.url : null,
      priceAmount:
        offers && typeof offers.price === "string"
          ? Number.parseFloat(offers.price)
          : offers && typeof offers.price === "number"
            ? offers.price
            : null,
      priceCurrency:
        offers && typeof offers.priceCurrency === "string" ? offers.priceCurrency : null,
      publisher: publisher && typeof publisher.name === "string" ? publisher.name : null,
      releaseDate: typeof product.releaseDate === "string" ? product.releaseDate : null
    };
  } catch {
    return null;
  }
}

function buildFallbackCatalogGame(seed: CatalogSeedEntry): CatalogGame {
  return {
    externalId: seed.externalId,
    title: seed.title,
    coverUrl: seed.fallbackCoverUrl,
    storeUrl: seed.storeUrl,
    description: null,
    publisher: null,
    releaseDate: null,
    priceAmount: seed.fallbackPriceAmount,
    priceCurrency: DEFAULT_CURRENCY,
    platform: "Switch",
    region: "GLOBAL"
  };
}

async function resolveCatalogGame(seed: CatalogSeedEntry): Promise<CatalogGame> {
  const fallback = buildFallbackCatalogGame(seed);

  try {
    const response = await fetch(seed.storeUrl, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "NintendoGameTime/1.0"
      }
    });
    if (!response.ok) {
      return fallback;
    }

    const html = await response.text();
    const parsed = parseJsonLdProduct(html);
    if (!parsed) {
      return fallback;
    }

    return {
      externalId: seed.externalId,
      title: parsed.title ?? fallback.title,
      coverUrl: parsed.coverUrl ?? fallback.coverUrl,
      storeUrl: toAbsoluteUrl(parsed.storeUrl, fallback.storeUrl),
      description: parsed.description ?? fallback.description,
      publisher: parsed.publisher ?? fallback.publisher,
      releaseDate: parsed.releaseDate ?? fallback.releaseDate,
      priceAmount: parsed.priceAmount ?? fallback.priceAmount,
      priceCurrency: parsed.priceCurrency ?? fallback.priceCurrency,
      platform: "Switch",
      region: "GLOBAL"
    };
  } catch {
    return fallback;
  }
}

export function getCatalogSeeds(): CatalogSeedEntry[] {
  return [...CATALOG_SEEDS];
}

export function createCatalogService(): CatalogService {
  const cache = new Map<string, CachedCatalogItem>();
  const inflight = new Map<string, Promise<CatalogGame>>();

  async function loadSeed(seed: CatalogSeedEntry): Promise<CatalogGame> {
    const cached = cache.get(seed.externalId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const existing = inflight.get(seed.externalId);
    if (existing) {
      return existing;
    }

    const promise = resolveCatalogGame(seed)
      .then((value) => {
        cache.set(seed.externalId, {
          value,
          expiresAt: Date.now() + CACHE_TTL_MS
        });
        inflight.delete(seed.externalId);
        return value;
      })
      .catch((error) => {
        inflight.delete(seed.externalId);
        throw error;
      });

    inflight.set(seed.externalId, promise);
    return promise;
  }

  return {
    async listCatalog(input) {
      const query = normalizeText(input?.query ?? "");
      const limit = Math.min(Math.max(input?.limit ?? 12, 1), 24);
      const offset = decodeCursor(input?.cursor);
      const filteredSeeds = query
        ? CATALOG_SEEDS.filter((seed) => normalizeText(`${seed.title} ${seed.externalId}`).includes(query))
        : CATALOG_SEEDS;

      const pageSeeds = filteredSeeds.slice(offset, offset + limit);
      const items = await Promise.all(pageSeeds.map((seed) => loadSeed(seed)));
      const nextOffset = offset + limit < filteredSeeds.length ? offset + limit : null;

      return {
        items,
        nextCursor: nextOffset === null ? null : encodeCursor(nextOffset)
      };
    },

    async getCatalogGame(externalId: string) {
      const seed = CATALOG_SEEDS.find((entry) => entry.externalId === externalId);
      if (!seed) return null;
      return loadSeed(seed);
    }
  };
}
