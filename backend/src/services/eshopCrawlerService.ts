import { createHash } from "node:crypto";
import type { AppEnv } from "../config/env.js";
import type { Repository } from "../repositories/types.js";
import type { CatalogLocalizationsRow } from "../types/domain.js";
import type { EshopPriceService } from "./eshopPriceService.js";
import { CATALOG_LOCALIZATION_OVERRIDES } from "./catalogLocalizationOverrides.js";

const DISCOVER_KEYWORDS = [
  "action", "rpg", "adventure", "puzzle", "racing", "sports",
  "strategy", "simulation", "shooter", "fighting", "platformer",
  "horror", "indie", "party", "music", "zelda", "mario", "pokemon",
  "fire emblem", "splatoon", "animal crossing", "xenoblade", "kirby"
];

const CRAWLER_SOURCE = "eshop_crawler";
const STALE_GAME_MS = 24 * 60 * 60 * 1000; // 24h

interface EuropeSearchDoc {
  title: string;
  related_nsuids_txt?: string[];
  price_regular_f?: number;
  price_lowest_f?: number;
  price_has_discount_b?: boolean;
  price_discount_percentage_f?: number;
  image_url_sq_s?: string;
  url?: string;
  publisher?: string;
  excerpt?: string;
  originally_for_t?: string;
}

interface EuropeSearchResponse {
  response: {
    numFound: number;
    docs: EuropeSearchDoc[];
  };
}

interface MockGameTemplate {
  title: string;
  publisher: string;
  priceUsd: number;
}

const MOCK_GAME_TEMPLATES: MockGameTemplate[] = [
  { title: "The Legend of Zelda: Tears of the Kingdom", publisher: "Nintendo", priceUsd: 69.99 },
  { title: "Super Mario Bros. Wonder", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Metroid Dread", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Splatoon 3", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Pokemon Scarlet", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Pokemon Violet", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Fire Emblem Engage", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Kirby and the Forgotten Land", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Xenoblade Chronicles 3", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Bayonetta 3", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Mario Strikers: Battle League", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Nintendo Switch Sports", publisher: "Nintendo", priceUsd: 39.99 },
  { title: "Mario Party Superstars", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "WarioWare: Move It!", publisher: "Nintendo", priceUsd: 49.99 },
  { title: "Pikmin 4", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Super Mario RPG", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Paper Mario: The Thousand-Year Door", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Luigi's Mansion 2 HD", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Princess Peach: Showtime!", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Donkey Kong Country Returns HD", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Mario Kart 8 Deluxe", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Super Smash Bros. Ultimate", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Animal Crossing: New Horizons", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "The Legend of Zelda: Breath of the Wild", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Super Mario Odyssey", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Luigi's Mansion 3", publisher: "Nintendo", priceUsd: 59.99 },
  { title: "Hades", publisher: "Supergiant Games", priceUsd: 24.99 },
  { title: "Hollow Knight", publisher: "Team Cherry", priceUsd: 14.99 },
  { title: "Celeste", publisher: "Maddy Makes Games", priceUsd: 19.99 },
  { title: "Stardew Valley", publisher: "ConcernedApe", priceUsd: 14.99 },
  { title: "Undertale", publisher: "tobyfox", priceUsd: 9.99 },
  { title: "Cuphead", publisher: "Studio MDHR", priceUsd: 19.99 },
  { title: "Ori and the Will of the Wisps", publisher: "Moon Studios", priceUsd: 29.99 },
  { title: "Dead Cells", publisher: "Motion Twin", priceUsd: 24.99 },
  { title: "Return of the Obra Dinn", publisher: "3909", priceUsd: 19.99 },
  { title: "Disco Elysium", publisher: "ZA/UM", priceUsd: 39.99 },
  { title: "Persona 5 Royal", publisher: "Atlus", priceUsd: 59.99 },
  { title: "Monster Hunter Rise", publisher: "Capcom", priceUsd: 39.99 },
  { title: "Dragon Quest XI S", publisher: "Square Enix", priceUsd: 49.99 },
  { title: "Octopath Traveler II", publisher: "Square Enix", priceUsd: 59.99 },
];

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugToWords(slug: string): string[] {
  return slug
    .replace(/-switch$/, "")
    .split("-")
    .filter((w) => (w.length > 1 || /\d/.test(w)) && !["the", "a", "an", "of", "and", "s", "switch"].includes(w));
}

function findLocalizationOverride(title: string): CatalogLocalizationsRow | null {
  const titleNorm = normalizeForMatch(title);
  const titleTokens = new Set(titleNorm.split(" "));
  const ignorable = new Set(["the", "a", "an", "of", "and", "s", "switch", "edition", "deluxe", "hd", "remastered"]);
  const meaningfulTitleTokens = [...titleTokens].filter((t) => !ignorable.has(t));

  let bestMatch: { loc: CatalogLocalizationsRow; score: number } | null = null;

  for (const [slug, loc] of Object.entries(CATALOG_LOCALIZATION_OVERRIDES)) {
    const slugWords = slugToWords(slug);
    const meaningfulSlugWords = slugWords.filter((w) => !ignorable.has(w));
    if (meaningfulSlugWords.length === 0) continue;

    const matchCount = meaningfulSlugWords.filter((w) => titleTokens.has(w)).length;
    const slugCoverage = matchCount / meaningfulSlugWords.length;
    const titleCoverage = matchCount / Math.max(meaningfulTitleTokens.length, 1);

    // Require high coverage on both sides to avoid false positives
    if (slugCoverage >= 0.8 && titleCoverage >= 0.6) {
      const score = slugCoverage + titleCoverage;
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { loc, score };
      }
    }
  }

  return bestMatch?.loc ?? null;
}

function seededShuffle<T>(items: T[], seed: string): T[] {
  const result = [...items];
  const buf = createHash("sha256").update(seed).digest();
  let h = buf.readUInt32LE(0);
  for (let i = result.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    const j = h % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function generateMockNsuid(keyword: string, index: number): string {
  const hash = createHash("sha256").update(`mock:${keyword}:${index}`).digest("hex").slice(0, 16);
  return `7001${hash}`;
}

export interface CrawlerDiscoverResult {
  discovered: number;
  skipped: number;
  errors: number;
}

export interface CrawlerPriceRefreshResult {
  refreshed: number;
  skipped: number;
  errors: number;
}

export interface CrawlerStatus {
  totalCatalogGames: number;
  crawlerGames: number;
  stalePrices: number;
  lastDiscoverRun: string | null;
  lastPriceRefreshRun: string | null;
}

export interface EshopCrawlerService {
  discoverNewGames(): Promise<CrawlerDiscoverResult>;
  refreshStalePrices(): Promise<CrawlerPriceRefreshResult>;
  getCrawlerStatus(): Promise<CrawlerStatus>;
}

export function createEshopCrawlerService(
  env: AppEnv,
  repository: Repository,
  eshopPriceService: EshopPriceService
): EshopCrawlerService {
  let lastDiscoverRun: string | null = null;
  let lastPriceRefreshRun: string | null = null;

  async function discoverNewGames(): Promise<CrawlerDiscoverResult> {
    const result: CrawlerDiscoverResult = { discovered: 0, skipped: 0, errors: 0 };
    const now = new Date().toISOString();

    if (env.NINTENDO_MOCK) {
      return discoverMockGames();
    }

    for (const keyword of DISCOVER_KEYWORDS) {
      try {
        const url = `https://searching.nintendo-europe.com/en/select?q=${encodeURIComponent(keyword)}&fq=type:GAME+AND+originally_for_t:HAC&rows=50&wt=json`;
        const response = await fetch(url, {
          signal: AbortSignal.timeout(15000),
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        });

        if (!response.ok) {
          result.errors++;
          continue;
        }

        const data = (await response.json()) as EuropeSearchResponse;
        if (!data.response?.docs) continue;

        for (const doc of data.response.docs) {
          const nsuids = doc.related_nsuids_txt ?? [];
          const nsuid = nsuids.find((id) => id.startsWith("7001")); // Switch NSUIDs start with 7001
          if (!nsuid) continue;

          try {
            const existing = await repository.getCatalogGameByExternalId(nsuid);
            if (existing) {
              const lastSync = Date.parse(existing.lastSyncedAt);
              const hasLocalizations = existing.localizations && Object.keys(existing.localizations).length > 0;
              if (Date.now() - lastSync < STALE_GAME_MS && hasLocalizations) {
                result.skipped++;
                continue;
              }
            }

            const coverUrl = doc.image_url_sq_s ?? null;
            const storeUrl = doc.url ? `https://www.nintendo.com${doc.url}` : `https://www.nintendo.com/us/store/products/${nsuid}/`;
            const localizations = findLocalizationOverride(doc.title) ?? {};

            await repository.upsertCatalogGame({
              externalId: nsuid,
              sortOrder: Math.floor(Date.now() / 1000),
              title: doc.title,
              coverUrl,
              storeUrl,
              description: doc.excerpt ?? null,
              publisher: doc.publisher ?? null,
              releaseDate: null,
              priceAmount: (doc.price_regular_f && doc.price_regular_f > 0) ? doc.price_regular_f : null,
              priceCurrency: "EUR",
              platform: "Switch",
              region: "GLOBAL",
              source: CRAWLER_SOURCE,
              localizations,
              lastSyncedAt: now
            });

            if (existing) {
              result.skipped++;
            } else {
              result.discovered++;
            }
          } catch {
            result.errors++;
          }
        }

        await new Promise((resolve) => setTimeout(resolve, env.ESHOP_RATE_LIMIT_MS));
      } catch {
        result.errors += 50;
      }
    }

    lastDiscoverRun = now;
    return result;
  }

  async function discoverMockGames(): Promise<CrawlerDiscoverResult> {
    const result: CrawlerDiscoverResult = { discovered: 0, skipped: 0, errors: 0 };
    const now = new Date().toISOString();

    for (const keyword of DISCOVER_KEYWORDS.slice(0, 5)) {
      const shuffled = seededShuffle(MOCK_GAME_TEMPLATES, keyword);
      const selected = shuffled.slice(0, 10);

      for (let i = 0; i < selected.length; i++) {
        const template = selected[i];
        const nsuid = generateMockNsuid(keyword, i);

        try {
          const existing = await repository.getCatalogGameByExternalId(nsuid);
          if (existing) {
            const lastSync = Date.parse(existing.lastSyncedAt);
            if (Date.now() - lastSync < STALE_GAME_MS) {
              result.skipped++;
              continue;
            }
          }

          const coverHash = createHash("sha256").update(nsuid).digest("hex").slice(0, 12);
          const localizations = findLocalizationOverride(template.title) ?? {};
          await repository.upsertCatalogGame({
            externalId: nsuid,
            sortOrder: Math.floor(Date.now() / 1000),
            title: template.title,
            coverUrl: `https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch/${coverHash}`,
            storeUrl: `https://www.nintendo.com/us/store/products/${nsuid}/`,
            description: null,
            publisher: template.publisher,
            releaseDate: null,
            priceAmount: template.priceUsd,
            priceCurrency: "USD",
            platform: "Switch",
            region: "GLOBAL",
            source: CRAWLER_SOURCE,
            localizations,
            lastSyncedAt: now
          });

          if (existing) {
            result.skipped++;
          } else {
            result.discovered++;
          }
        } catch {
          result.errors++;
        }
      }
    }

    lastDiscoverRun = now;
    return result;
  }

  async function refreshStalePrices(): Promise<CrawlerPriceRefreshResult> {
    const result: CrawlerPriceRefreshResult = { refreshed: 0, skipped: 0, errors: 0 };
    const now = new Date().toISOString();
    const staleThreshold = new Date(Date.now() - env.CRAWLER_STALE_PRICE_MS).toISOString();

    // Refresh stale prices
    const staleRows = await repository.listRegionalPricesByStaleness(staleThreshold, env.CRAWLER_BATCH_LIMIT);
    for (const row of staleRows) {
      try {
        const catalogGame = await repository.getCatalogGameByExternalId(row.externalId);
        if (!catalogGame) {
          result.skipped++;
          continue;
        }
        await eshopPriceService.refreshRegionalPrices(row.externalId, catalogGame.title, catalogGame.priceAmount);
        result.refreshed++;
      } catch {
        result.errors++;
      }
    }

    // Fetch prices for crawler games that have no price record yet
    const unpricedGames = await repository.listCatalogGamesWithoutPrices(CRAWLER_SOURCE, env.CRAWLER_BATCH_LIMIT);
    for (const game of unpricedGames) {
      try {
        await eshopPriceService.getRegionalPrices(game.externalId, game.title, game.priceAmount);
        result.refreshed++;
      } catch {
        result.errors++;
      }
    }

    lastPriceRefreshRun = now;
    return result;
  }

  async function getCrawlerStatus(): Promise<CrawlerStatus> {
    const staleThreshold = new Date(Date.now() - env.CRAWLER_STALE_PRICE_MS).toISOString();
    const [totalCatalogGames, crawlerGames, stalePrices] = await Promise.all([
      repository.countCatalogGames(),
      repository.listCatalogGamesBySource(CRAWLER_SOURCE, 10000).then((rows) => rows.length),
      repository.listRegionalPricesByStaleness(staleThreshold, 10000).then((rows) => rows.length)
    ]);

    return {
      totalCatalogGames,
      crawlerGames,
      stalePrices,
      lastDiscoverRun,
      lastPriceRefreshRun
    };
  }

  return {
    discoverNewGames,
    refreshStalePrices,
    getCrawlerStatus
  };
}
