const ECB_DAILY_XML_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

const FALLBACK_CONTEXT = {
  baseCurrency: "EUR" as const,
  source: ECB_DAILY_XML_URL,
  asOf: "2026-03-11",
  rates: {
    USD: 1.1641,
    HKD: 9.2904,
    CNY: 8.0057
  }
};

export interface FxContext {
  baseCurrency: "EUR";
  source: string;
  asOf: string;
  rates: {
    USD: number;
    HKD: number;
    CNY: number;
  };
}

export interface MarketService {
  getFxContext(): Promise<FxContext>;
}

function parseRate(xml: string, currency: "USD" | "HKD" | "CNY"): number | null {
  const pattern = new RegExp(`currency="${currency}"\\s+rate="([0-9.]+)"`, "i");
  const match = xml.match(pattern);
  if (!match?.[1]) return null;
  const rate = Number.parseFloat(match[1]);
  return Number.isFinite(rate) ? rate : null;
}

function parseAsOf(xml: string): string | null {
  const match = xml.match(/time="(\d{4}-\d{2}-\d{2})"/i);
  return match?.[1] ?? null;
}

async function loadFxContext(): Promise<FxContext> {
  try {
    const response = await fetch(ECB_DAILY_XML_URL, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "NintendoGameTime/1.0"
      }
    });
    if (!response.ok) {
      return FALLBACK_CONTEXT;
    }

    const xml = await response.text();
    const asOf = parseAsOf(xml);
    const usd = parseRate(xml, "USD");
    const hkd = parseRate(xml, "HKD");
    const cny = parseRate(xml, "CNY");

    if (!asOf || usd === null || hkd === null || cny === null) {
      return FALLBACK_CONTEXT;
    }

    return {
      baseCurrency: "EUR",
      source: ECB_DAILY_XML_URL,
      asOf,
      rates: {
        USD: usd,
        HKD: hkd,
        CNY: cny
      }
    };
  } catch {
    return FALLBACK_CONTEXT;
  }
}

export function createMarketService(): MarketService {
  let cached: { expiresAt: number; value: FxContext } | null = null;
  let inflight: Promise<FxContext> | null = null;

  return {
    async getFxContext() {
      if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
      }

      if (inflight) {
        return inflight;
      }

      inflight = loadFxContext()
        .then((value) => {
          cached = {
            value,
            expiresAt: Date.now() + CACHE_TTL_MS
          };
          inflight = null;
          return value;
        })
        .catch((error) => {
          inflight = null;
          throw error;
        });

      return inflight;
    }
  };
}
