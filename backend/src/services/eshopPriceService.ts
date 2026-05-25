import { createHash } from "node:crypto";
import type { AppEnv } from "../config/env.js";
import type { Repository } from "../repositories/types.js";
import type { EshopRegion, RegionalPrice, RegionalPriceSet } from "../types/domain.js";
import type { MarketService } from "./marketService.js";

export const ESHOP_REGIONS: EshopRegion[] = [
  { code: "US", country: "US", label: "美国", currency: "USD" },
  { code: "JP", country: "JP", label: "日本", currency: "JPY" },
  { code: "HK", country: "HK", label: "香港", currency: "HKD" },
  { code: "KR", country: "KR", label: "韩国", currency: "KRW" },
  { code: "GB", country: "GB", label: "英国", currency: "GBP" },
  { code: "EU", country: "DE", label: "欧洲", currency: "EUR" },
  { code: "AU", country: "AU", label: "澳大利亚", currency: "AUD" },
  { code: "CA", country: "CA", label: "加拿大", currency: "CAD" }
];

const FX_TO_USD: Record<string, number> = {
  USD: 1,
  JPY: 1 / 150,
  HKD: 1 / 7.8,
  KRW: 1 / 1350,
  GBP: 1.27,
  EUR: 1.1,
  AUD: 0.65,
  CAD: 0.73
};

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ");
}

function hasTitleSignal(candidate: string | null, expected: string): boolean {
  if (!candidate) return false;
  const ignoredTokens = new Set(["the", "a", "an", "of", "and", "edition", "deluxe", "switch"]);
  const candidateTokens = new Set(normalizeText(candidate).split(" ").filter(Boolean));
  const expectedTokens = normalizeText(expected)
    .split(" ")
    .filter((token) => token && !ignoredTokens.has(token));
  const overlap = expectedTokens.filter((token) => candidateTokens.has(token)).length;
  return overlap >= Math.min(2, expectedTokens.length);
}

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

function priceToUsd(price: number, currency: string): number {
  const rate = FX_TO_USD[currency];
  return rate ? price * rate : price;
}

function seededNumber(seed: string, min: number, max: number): number {
  const hash = createHash("sha256").update(seed).digest("hex");
  const value = Number.parseInt(hash.slice(0, 8), 16);
  return min + (value % (max - min + 1));
}

function generateMockRegionalPrices(externalId: string, basePriceUsd: number): RegionalPrice[] {
  const now = new Date().toISOString();
  const mockVariations: Array<{ region: string; country: string; label: string; currency: string; multiplier: number }> = [
    { region: "US", country: "US", label: "美国", currency: "USD", multiplier: 1.0 },
    { region: "JP", country: "JP", label: "日本", currency: "JPY", multiplier: 9600 / 5999 },
    { region: "HK", country: "HK", label: "香港", currency: "HKD", multiplier: 429 / 59.99 },
    { region: "KR", country: "KR", label: "韩国", currency: "KRW", multiplier: 64800 / 5999 },
    { region: "GB", country: "GB", label: "英国", currency: "GBP", multiplier: 49.99 / 59.99 },
    { region: "EU", country: "DE", label: "欧洲", currency: "EUR", multiplier: 59.99 / 59.99 },
    { region: "AU", country: "AU", label: "澳大利亚", currency: "AUD", multiplier: 79.95 / 59.99 },
    { region: "CA", country: "CA", label: "加拿大", currency: "CAD", multiplier: 79.99 / 59.99 }
  ];

  return mockVariations.map((v) => {
    const seed = `${externalId}:${v.region}`;
    const jitter = seededNumber(seed, 85, 115) / 100;
    const price = Math.round(basePriceUsd * v.multiplier * jitter * 100) / 100;
    const saleSeed = seededNumber(`${seed}:sale`, 0, 100);
    const onSale = saleSeed < 20;
    const discountPercent = onSale ? seededNumber(`${seed}:discount`, 15, 50) : null;
    const salePrice = onSale ? Math.round(price * ((100 - discountPercent!) / 100) * 100) / 100 : null;

    return {
      region: v.region,
      country: v.country,
      label: v.label,
      currency: v.currency,
      price,
      salePrice,
      onSale,
      discountPercent,
      fetchedAt: now
    };
  });
}

async function fetchEshopPrices(
  title: string,
  rateLimitMs: number
): Promise<{ regularPrice: number; lowestPrice: number; discount: number } | null> {
  try {
    const url = `https://searching.nintendo-europe.com/en/select?q=${encodeURIComponent(title)}&fq=type:GAME+AND+originally_for_t:HAC&rows=10&wt=json`;
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as EuropeSearchResponse;
    if (!data.response?.docs || data.response.docs.length === 0) {
      return null;
    }

    const bestMatch = data.response.docs.find((doc) => hasTitleSignal(doc.title, title));
    if (!bestMatch) {
      return null;
    }

    const regularPrice = bestMatch.price_regular_f ?? 0;
    const lowestPrice = bestMatch.price_lowest_f ?? regularPrice;
    const discount = bestMatch.price_discount_percentage_f ?? 0;

    if (regularPrice <= 0) {
      return null;
    }

    return { regularPrice, lowestPrice, discount };
  } catch {
    return null;
  }
}

export interface EshopPriceService {
  getRegionalPrices(externalId: string, title: string, basePriceUsd?: number | null): Promise<RegionalPriceSet>;
  refreshRegionalPrices(externalId: string, title: string, basePriceUsd?: number | null): Promise<RegionalPriceSet>;
}

export function createEshopPriceService(
  env: AppEnv,
  repository: Repository,
  marketService: MarketService
): EshopPriceService {
  const memoryCache = new Map<string, { expiresAt: number; value: RegionalPriceSet }>();

  async function fetchAllRegions(
    externalId: string,
    title: string,
    basePriceUsd: number | null
  ): Promise<RegionalPriceSet> {
    const now = new Date().toISOString();

    if (env.NINTENDO_MOCK) {
      const basePrice = basePriceUsd ?? 59.99;
      const prices = generateMockRegionalPrices(externalId, basePrice);
      const cheapest = prices.reduce((min, p) => {
        const minUsd = priceToUsd(min.salePrice ?? min.price, min.currency);
        const curUsd = priceToUsd(p.salePrice ?? p.price, p.currency);
        return curUsd < minUsd ? p : min;
      }, prices[0]);

      const result: RegionalPriceSet = {
        externalId,
        title,
        prices,
        cheapestRegion: cheapest.region,
        fetchedAt: now
      };

      memoryCache.set(externalId, { value: result, expiresAt: Date.now() + env.ESHOP_CACHE_TTL_MS });
      await repository.upsertRegionalPrices({ externalId, prices, fetchedAt: now });
      return result;
    }

    // Use Europe search API which returns EUR prices
    const europePrice = await fetchEshopPrices(title, env.ESHOP_RATE_LIMIT_MS);

    // Build regional prices using EUR as base with FX conversions
    const prices: RegionalPrice[] = [];
    if (europePrice) {
      // EUR price is the base - convert to other currencies
      const eurPrice = europePrice.regularPrice;
      const eurLowest = europePrice.lowestPrice;
      const onSale = eurLowest < eurPrice;
      const discountPercent = onSale ? europePrice.discount : null;

      for (const region of ESHOP_REGIONS) {
        let localPrice: number;
        let localSalePrice: number | null = null;

        if (region.currency === "EUR") {
          localPrice = eurPrice;
          localSalePrice = onSale ? eurLowest : null;
        } else {
          // Convert EUR to local currency
          const eurToLocal = 1 / (FX_TO_USD[region.currency] ?? 1) * (1 / FX_TO_USD["EUR"]);
          localPrice = Math.round(eurPrice * eurToLocal * 100) / 100;
          localSalePrice = onSale ? Math.round(eurLowest * eurToLocal * 100) / 100 : null;
        }

        prices.push({
          region: region.code,
          country: region.country,
          label: region.label,
          currency: region.currency,
          price: localPrice,
          salePrice: onSale ? localSalePrice : null,
          onSale,
          discountPercent,
          fetchedAt: now
        });
      }
    }

    const cheapest = prices.length > 0
      ? prices.reduce((min, p) => {
          const minUsd = priceToUsd(min.salePrice ?? min.price, min.currency);
          const curUsd = priceToUsd(p.salePrice ?? p.price, p.currency);
          return curUsd < minUsd ? p : min;
        }, prices[0])
      : null;

    const result: RegionalPriceSet = {
      externalId,
      title,
      prices,
      cheapestRegion: cheapest?.region ?? null,
      fetchedAt: now
    };

    memoryCache.set(externalId, { value: result, expiresAt: Date.now() + env.ESHOP_CACHE_TTL_MS });
    if (prices.length > 0) {
      await repository.upsertRegionalPrices({ externalId, prices, fetchedAt: now });
    }
    return result;
  }

  return {
    async getRegionalPrices(externalId: string, title: string, basePriceUsd?: number | null) {
      const cached = memoryCache.get(externalId);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
      }

      const stored = await repository.getRegionalPrices(externalId);
      if (stored && Date.now() - new Date(stored.fetchedAt).getTime() < env.ESHOP_CACHE_TTL_MS) {
        const cheapest = stored.prices.length > 0
          ? stored.prices.reduce((min, p) => {
              const minUsd = priceToUsd(min.salePrice ?? min.price, min.currency);
              const curUsd = priceToUsd(p.salePrice ?? p.price, p.currency);
              return curUsd < minUsd ? p : min;
            }, stored.prices[0])
          : null;

        const value: RegionalPriceSet = {
          externalId,
          title,
          prices: stored.prices,
          cheapestRegion: cheapest?.region ?? null,
          fetchedAt: stored.fetchedAt
        };
        memoryCache.set(externalId, { value, expiresAt: Date.now() + env.ESHOP_CACHE_TTL_MS });
        return value;
      }

      return fetchAllRegions(externalId, title, basePriceUsd ?? null);
    },

    async refreshRegionalPrices(externalId: string, title: string, basePriceUsd?: number | null) {
      memoryCache.delete(externalId);
      return fetchAllRegions(externalId, title, basePriceUsd ?? null);
    }
  };
}
