import { EXTENDED_CATALOG_SEEDS } from "./catalogSeedData.js";
import { CATALOG_LOCALIZATION_OVERRIDES } from "./catalogLocalizationOverrides.js";
import type { Repository } from "../repositories/types.js";
import type {
  CatalogGameRow,
  CatalogLocalizationsRow,
  CatalogTextLocalizationRow
} from "../types/domain.js";

const DEFAULT_CURRENCY = "USD";
const CACHE_TTL_MS = 1000 * 60 * 60;

export type CatalogTextLocalization = CatalogTextLocalizationRow;
export type CatalogLocalizations = CatalogLocalizationsRow;

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
  localizations: CatalogLocalizations;
}

export interface CatalogSeedEntry {
  externalId: string;
  title: string;
  storeUrl: string;
  fallbackCoverUrl: string | null;
  fallbackPriceAmount: number | null;
}

export interface CatalogRefreshResult {
  importedCount: number;
  totalCount: number;
  refreshedAt: string;
}

const FEATURED_CATALOG_SEEDS: CatalogSeedEntry[] = [
  {
    externalId: "the-legend-of-zelda-breath-of-the-wild-switch",
    title: "The Legend of Zelda: Breath of the Wild",
    storeUrl: "https://www.nintendo.com/us/store/products/the-legend-of-zelda-breath-of-the-wild-switch/",
    fallbackCoverUrl:
      "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch/70010000000025/7137262b5a64d921e193653f8aa0b722925abc5680380ca0e18a5cfd91697f58",
    fallbackPriceAmount: 59.99
  },
  {
    externalId: "super-mario-odyssey-switch",
    title: "Super Mario Odyssey",
    storeUrl: "https://www.nintendo.com/us/store/products/super-mario-odyssey-switch/",
    fallbackCoverUrl:
      "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch/70010000001130/c42553b4fd0312c31e70ec7468c6c9bccd739f340152925b9600631f2d29f8b5",
    fallbackPriceAmount: 59.99
  },
  {
    externalId: "mario-kart-8-deluxe-switch",
    title: "Mario Kart 8 Deluxe",
    storeUrl: "https://www.nintendo.com/us/store/products/mario-kart-8-deluxe-switch/",
    fallbackCoverUrl:
      "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch/70010000000153/de697f487a36d802dd9a5ff0341f717c8486221f2f1219b675af37aca63bc453",
    fallbackPriceAmount: 59.99
  },
  {
    externalId: "luigis-mansion-3-switch",
    title: "Luigi's Mansion 3",
    storeUrl: "https://www.nintendo.com/us/store/products/luigis-mansion-3-switch/",
    fallbackCoverUrl:
      "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch/70010000001620/2b166fb3197dacfde1d939acd6a976b9fbe3b1a32c54f9f0d2c8d23efb22412d",
    fallbackPriceAmount: 59.99
  },
  {
    externalId: "super-mario-3d-world-plus-bowsers-fury-switch",
    title: "Super Mario 3D World + Bowser's Fury",
    storeUrl: "https://www.nintendo.com/us/store/products/super-mario-3d-world-plus-bowsers-fury-switch/",
    fallbackCoverUrl:
      "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch/70010000034439/ccb69a8bf2746b2dc0a9b11a9e48c9893baa1631486326f0d681b7a36385221f",
    fallbackPriceAmount: 59.99
  },
  {
    externalId: "animal-crossing-new-horizons-switch",
    title: "Animal Crossing: New Horizons",
    storeUrl: "https://www.nintendo.com/us/store/products/animal-crossing-new-horizons-switch/",
    fallbackCoverUrl:
      "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch/70010000027619/9989957eae3a6b545194c42fec2071675c34aadacd65e6b33fdfe7b3b6a86c3a",
    fallbackPriceAmount: 59.99
  },
  {
    externalId: "hollow-knight-switch",
    title: "Hollow Knight",
    storeUrl: "https://www.nintendo.com/us/store/products/hollow-knight-switch/",
    fallbackCoverUrl:
      "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch/70010000003208/4643fb058642335c523910f3a7910575f56372f612f7c0c9a497aaae978d3e51",
    fallbackPriceAmount: 15
  },
  {
    externalId: "dead-cells-switch",
    title: "Dead Cells",
    storeUrl: "https://www.nintendo.com/us/store/products/dead-cells-switch/",
    fallbackCoverUrl:
      "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch/70010000007706/bb0e6f620098683ff06d306700a18c945adbcc897aa4cc65f41f97dd69621745",
    fallbackPriceAmount: 24.99
  },
  {
    externalId: "kirby-and-the-forgotten-land-switch",
    title: "Kirby and the Forgotten Land",
    storeUrl: "https://www.nintendo.com/us/store/products/kirby-and-the-forgotten-land-switch/",
    fallbackCoverUrl:
      "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch/70010000046405/d1cf83dea46094b85247f40ca30ea4557730a319be0bfe544a4fa929144cf6c2",
    fallbackPriceAmount: 59.99
  },
  {
    externalId: "splatoon-3-switch",
    title: "Splatoon 3",
    storeUrl: "https://www.nintendo.com/us/store/products/splatoon-3-switch/",
    fallbackCoverUrl:
      "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch/70010000046395/94a4095cda06c4d85c637d1af451979f9933302b6b17174d97c45de7a68584a2",
    fallbackPriceAmount: 59.99
  },
  {
    externalId: "metroid-dread-switch",
    title: "Metroid Dread",
    storeUrl: "https://www.nintendo.com/us/store/products/metroid-dread-switch/",
    fallbackCoverUrl:
      "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch/70010000042924/4f2c683f0196210ec212a2ab8bf6952223c0b88e827b820953407a2ba61c9cb2",
    fallbackPriceAmount: 59.99
  },
  {
    externalId: "pikmin-4-switch",
    title: "Pikmin 4",
    storeUrl: "https://www.nintendo.com/us/store/products/pikmin-4-switch/",
    fallbackCoverUrl:
      "https://assets.nintendo.com/image/upload/q_auto/f_auto/store/software/switch/70010000005308/43af89ed5bd76ac5ec6b367b4b53092f8bf94a1d1312fdfc1d4664329fd5077b",
    fallbackPriceAmount: 59.99
  }
];

const CATALOG_IMPORT_BATCH_SIZE = 8;

const OFFICIAL_PRODUCT_URL_OVERRIDES: Record<string, string> = {
  "cadence-of-hyrule-switch":
    "https://www.nintendo.com/us/store/products/cadence-of-hyrule-crypt-of-the-necrodancer-featuring-the-legend-of-zelda-switch/",
  "super-mario-3d-all-stars-switch":
    "https://www.nintendo.com/fr-fr/fr-fr/Jeux/Jeux-Nintendo-Switch/Super-Mario-3D-All-Stars-1832369.html"
};

function buildLegacyNintendoProductUrl(externalId: string): string {
  return `https://www.nintendo.com/us/store/products/${externalId}/`;
}

function buildNintendoProductSlug(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/#/g, " ")
    .replace(/[!:.,?()[\]/]/g, " ")
    .replace(/™|®/g, " ")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function buildNintendoProductUrlFromTitle(title: string): string {
  return `https://www.nintendo.com/us/store/products/${buildNintendoProductSlug(title)}-switch/`;
}

function getProductCandidateUrls(seed: CatalogSeedEntry): string[] {
  return [
    OFFICIAL_PRODUCT_URL_OVERRIDES[seed.externalId],
    seed.storeUrl,
    buildNintendoProductUrlFromTitle(seed.title),
    buildLegacyNintendoProductUrl(seed.externalId)
  ].filter((value, index, input): value is string => Boolean(value) && input.indexOf(value) === index);
}

function wrapPlaceholderTitle(title: string): string[] {
  const words = title.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 18 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.slice(0, 4);
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildPlaceholderCoverUrl(title: string): string {
  const lines = wrapPlaceholderTitle(title);
  const textNodes = lines
    .map(
      (line, index) =>
        `<text x="52" y="${280 + index * 68}" fill="#fff7ef" font-size="44" font-family="Arial, Helvetica, sans-serif" font-weight="700">${escapeSvgText(line)}</text>`
    )
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800" role="img" aria-label="${escapeSvgText(title)}">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#b24a28" />
          <stop offset="100%" stop-color="#241812" />
        </linearGradient>
      </defs>
      <rect width="600" height="800" rx="42" fill="url(#bg)" />
      <circle cx="486" cy="126" r="118" fill="#ffffff" opacity="0.08" />
      <circle cx="92" cy="694" r="138" fill="#ffffff" opacity="0.08" />
      <text x="52" y="112" fill="#f4d9c7" font-size="28" font-family="Arial, Helvetica, sans-serif" font-weight="700">Nintendo GameTime</text>
      <text x="52" y="164" fill="#fff7ef" font-size="54" font-family="Arial, Helvetica, sans-serif" font-weight="800">Switch</text>
      ${textNodes}
    </svg>
  `.replace(/\s+/g, " ").trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const CATALOG_SEEDS: CatalogSeedEntry[] = [
  ...FEATURED_CATALOG_SEEDS,
  ...EXTENDED_CATALOG_SEEDS.map((entry) => ({
    externalId: entry.externalId,
    title: entry.title,
    storeUrl: OFFICIAL_PRODUCT_URL_OVERRIDES[entry.externalId] ?? buildNintendoProductUrlFromTitle(entry.title),
    fallbackCoverUrl: null,
    fallbackPriceAmount: entry.fallbackPriceAmount
  }))
].slice(0, 300);

const CATALOG_LOCALIZATIONS: Record<string, CatalogLocalizations> = {
  "the-legend-of-zelda-breath-of-the-wild-switch": {
    zhHans: {
      title: "塞尔达传说 旷野之息",
      description:
        "辽阔无垠的海拉鲁世界正等待你去探索。攀登高塔与山峰、挑战巨大敌人、狩猎与采集素材，在冒险中自由决定前进方式。"
    }
  },
  "super-mario-odyssey-switch": {
    zhHans: {
      title: "超级马力欧 奥德赛",
      description:
        "乘上帽子船“奥德赛号”展开环球之旅。活用凯皮附身敌人、物件与动物，收集力量之月，阻止库巴的婚礼计划。"
    }
  },
  "mario-kart-8-deluxe-switch": {
    zhHans: {
      title: "马力欧赛车8 豪华版",
      description:
        "收录《马力欧赛车8》的全部赛道、角色与车辆，并追加新角色和全新对战模式。无论本地还是线上，都能随时来一场热闹竞速。"
    }
  },
  "luigis-mansion-3-switch": {
    zhHans: {
      title: "路易吉洋楼3",
      description:
        "在豪华饭店展开捉鬼冒险。利用升级后的鬼怪吸尘器G-00解决机关与谜题，还能和傀易吉一起探索每一层楼。"
    }
  },
  "super-mario-3d-world-plus-bowsers-fury-switch": {
    zhHans: {
      title: "超级马力欧3D世界 + 狂怒世界",
      description:
        "体验最多四人同乐的《超级马力欧3D世界》，并在《狂怒世界》中面对巨大化的库巴，展开一场更加狂野的全新冒险。"
    }
  },
  "animal-crossing-new-horizons-switch": {
    zhHans: {
      title: "集合啦！动物森友会",
      description:
        "搬到无人岛展开悠闲新生活，钓鱼、采集、布置家园，与动物居民一起打造只属于你的理想岛屿。"
    }
  },
  "hollow-knight-switch": {
    zhHans: {
      title: "空洞骑士",
      description:
        "在错综复杂的地下王国展开史诗般的冒险。探索洞穴、古老城市与荒废废土，对抗被感染的生物，并结识神秘角色。"
    }
  },
  "dead-cells-switch": {
    zhHans: {
      title: "死亡细胞",
      description:
        "将Roguevania与爽快动作结合的2D动作平台游戏。于不断变化的城堡中杀出血路，体验高速战斗与失败重来的成长循环。"
    }
  },
  "kirby-and-the-forgotten-land-switch": {
    zhHans: {
      title: "星之卡比 探索发现",
      description:
        "为了拯救被卷走的瓦豆鲁迪，卡比来到文明与自然交织的新世界，运用复制能力和全新动作展开探索。"
    }
  },
  "splatoon-3-switch": {
    zhHans: {
      title: "斯普拉遁3",
      description:
        "来到蛮颓地区展开4对4喷墨对战。全新武器、动作与单人模式回归，继续把地盘涂上自己的颜色。"
    }
  },
  "metroid-dread-switch": {
    zhHans: {
      title: "密特罗德 生存恐惧",
      description:
        "在行星ZDR调查神秘讯号，萨姆斯将面对前所未有的威胁，以及步步逼近的EMMI机器人，突破恐惧继续前进。"
    }
  },
  "pikmin-4-switch": {
    zhHans: {
      title: "皮克敏4",
      description:
        "派遣皮克敏和伙伴欧庆，在陌生星球上探索、搬运、战斗与解谜，寻找失踪队员，并想办法平安回家。"
    }
  }
};

Object.assign(CATALOG_LOCALIZATIONS, CATALOG_LOCALIZATION_OVERRIDES);

function resolveCatalogLocalizations(
  externalId: string,
  localizations: CatalogLocalizations = {}
): CatalogLocalizations {
  const override = CATALOG_LOCALIZATIONS[externalId];
  if (!override?.zhHans) {
    return localizations;
  }

  return {
    ...localizations,
    ...override,
    zhHans: {
      title: override.zhHans.title ?? localizations.zhHans?.title ?? "",
      description: override.zhHans.description ?? localizations.zhHans?.description ?? null
    }
  };
}

interface CachedCatalogItem {
  expiresAt: number;
  value: CatalogGame;
  hydrated: boolean;
}

const STATIC_CATALOG_SOFT_TIMEOUT_MS = 350;

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
  }): Promise<{ items: CatalogGame[]; nextCursor: string | null; totalCount: number }>;
  getCatalogGame(externalId: string): Promise<CatalogGame | null>;
  ensureCatalogSeeded(): Promise<CatalogRefreshResult>;
  refreshCatalog(): Promise<CatalogRefreshResult>;
  getCatalogStatus(): Promise<{ totalCount: number; lastSyncedAt: string | null }>;
}

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

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function extractMetaContent(html: string, attr: "property" | "name", key: string): string | null {
  const doubleQuoted = new RegExp(
    `<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const reverseDoubleQuoted = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key}["'][^>]*>`,
    "i"
  );
  const match = html.match(doubleQuoted) ?? html.match(reverseDoubleQuoted);
  return match?.[1] ? decodeHtmlEntities(match[1]) : null;
}

function extractCanonicalUrl(html: string): string | null {
  const match = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["'][^>]*>/i);
  return match?.[1] ? decodeHtmlEntities(match[1]) : null;
}

function sanitizeMetaTitle(value: string | null): string | null {
  if (!value) return null;
  const sanitized = value
    .split(" | ")[0]
    .replace(/\s+-\s+Nintendo.*$/i, "")
    .trim();
  return sanitized || value.trim();
}

function parseMetaProduct(html: string, fallbackUrl: string): JsonLdProduct | null {
  const title = sanitizeMetaTitle(extractMetaContent(html, "property", "og:title"));
  const description =
    extractMetaContent(html, "property", "og:description") ?? extractMetaContent(html, "name", "description");
  const coverUrl = extractMetaContent(html, "property", "og:image");
  const storeUrl = extractMetaContent(html, "property", "og:url") ?? extractCanonicalUrl(html) ?? fallbackUrl;
  const publisher =
    extractMetaContent(html, "property", "og:site_name") ??
    (storeUrl.includes("nintendo.com") ? "Nintendo" : null);

  if (!title && !description && !coverUrl) {
    return null;
  }

  return {
    title,
    description,
    coverUrl,
    storeUrl,
    priceAmount: null,
    priceCurrency: null,
    publisher,
    releaseDate: null
  };
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
    coverUrl: seed.fallbackCoverUrl ?? buildPlaceholderCoverUrl(seed.title),
    storeUrl: seed.storeUrl,
    description: null,
    publisher: null,
    releaseDate: null,
    priceAmount: seed.fallbackPriceAmount,
    priceCurrency: DEFAULT_CURRENCY,
    platform: "Switch",
    region: "GLOBAL",
    localizations: CATALOG_LOCALIZATIONS[seed.externalId] ?? {}
  };
}

async function resolveCatalogGame(seed: CatalogSeedEntry): Promise<CatalogGame> {
  const fallback = buildFallbackCatalogGame(seed);
  const candidateUrls = getProductCandidateUrls(seed);

  for (const candidateUrl of candidateUrls) {
    try {
      const response = await fetch(candidateUrl, {
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent": "NintendoGameTime/1.0"
        }
      });
      if (!response.ok) {
        continue;
      }

      const html = await response.text();
      const parsed = parseJsonLdProduct(html) ?? parseMetaProduct(html, candidateUrl);
      if (!parsed) {
        continue;
      }
      const titleMatches = hasTitleSignal(parsed.title, fallback.title);
      if (parsed.title && !titleMatches) {
        continue;
      }

      return {
        externalId: seed.externalId,
        title: titleMatches ? parsed.title ?? fallback.title : fallback.title,
        coverUrl: parsed.coverUrl ?? fallback.coverUrl,
        storeUrl: toAbsoluteUrl(parsed.storeUrl, candidateUrl),
        description: parsed.description ?? fallback.description,
        publisher: parsed.publisher ?? fallback.publisher,
        releaseDate: parsed.releaseDate ?? fallback.releaseDate,
        priceAmount: parsed.priceAmount ?? fallback.priceAmount,
        priceCurrency: parsed.priceCurrency ?? fallback.priceCurrency,
        platform: "Switch",
        region: "GLOBAL",
        localizations: fallback.localizations
      };
    } catch {
      continue;
    }
  }

  return fallback;
}

export function getCatalogSeeds(): CatalogSeedEntry[] {
  return [...CATALOG_SEEDS];
}

function mapCatalogRowToGame(row: CatalogGameRow): CatalogGame {
  return {
    externalId: row.externalId,
    title: row.title,
    coverUrl: row.coverUrl,
    storeUrl: row.storeUrl,
    description: row.description,
    publisher: row.publisher,
    releaseDate: row.releaseDate,
    priceAmount: row.priceAmount,
    priceCurrency: row.priceCurrency,
    platform: row.platform,
    region: row.region,
    localizations: resolveCatalogLocalizations(row.externalId, row.localizations)
  };
}

function createStaticCatalogService(): CatalogService {
  const cache = new Map<string, CachedCatalogItem>();
  const inflight = new Map<string, Promise<CatalogGame>>();
  const queuedRefreshes = new Set<string>();
  const seedByExternalId = new Map(CATALOG_SEEDS.map((seed) => [seed.externalId, seed] as const));

  function getOrCreateFallback(seed: CatalogSeedEntry): CatalogGame {
    const cached = cache.get(seed.externalId);
    if (cached) {
      return cached.value;
    }

    const fallback = buildFallbackCatalogGame(seed);
    cache.set(seed.externalId, {
      value: fallback,
      expiresAt: 0,
      hydrated: false
    });
    return fallback;
  }

  function scheduleSeedRefresh(seed: CatalogSeedEntry): Promise<CatalogGame> {
    const cached = cache.get(seed.externalId);
    if (cached?.hydrated && cached.expiresAt > Date.now()) {
      return Promise.resolve(cached.value);
    }

    const existing = inflight.get(seed.externalId);
    if (existing) {
      return existing;
    }

    const promise = resolveCatalogGame(seed)
      .then((value) => {
        cache.set(seed.externalId, {
          value,
          expiresAt: Date.now() + CACHE_TTL_MS,
          hydrated: true
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

  async function loadSeed(seed: CatalogSeedEntry): Promise<CatalogGame> {
    const cached = cache.get(seed.externalId);
    if (cached?.hydrated && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const fallback = getOrCreateFallback(seed);
    const refreshPromise = scheduleSeedRefresh(seed).catch(() => fallback);

    return Promise.race([
      refreshPromise,
      new Promise<CatalogGame>((resolve) => {
        setTimeout(() => resolve(fallback), STATIC_CATALOG_SOFT_TIMEOUT_MS);
      })
    ]);
  }

  function peekSeed(seed: CatalogSeedEntry): CatalogGame {
    const cached = cache.get(seed.externalId);
    if (cached) {
      if (!cached.hydrated || cached.expiresAt <= Date.now()) {
        enqueueSeedRefresh(seed);
      }
      return cached.value;
    }

    const fallback = getOrCreateFallback(seed);
    enqueueSeedRefresh(seed);
    return fallback;
  }

  async function warmCatalogInBackground(): Promise<void> {
    for (let index = 0; index < CATALOG_SEEDS.length; index += CATALOG_IMPORT_BATCH_SIZE) {
      const batch = CATALOG_SEEDS.slice(index, index + CATALOG_IMPORT_BATCH_SIZE);
      await Promise.all(batch.map((seed) => scheduleSeedRefresh(seed).catch(() => getOrCreateFallback(seed))));
    }
  }

  function enqueueSeedRefresh(seed: CatalogSeedEntry): void {
    const cached = cache.get(seed.externalId);
    if (cached?.hydrated && cached.expiresAt > Date.now()) {
      return;
    }
    if (inflight.has(seed.externalId) || queuedRefreshes.has(seed.externalId)) {
      return;
    }

    queuedRefreshes.add(seed.externalId);
    setTimeout(() => {
      queuedRefreshes.delete(seed.externalId);
      void scheduleSeedRefresh(seed).catch(() => undefined);
    }, 0);
  }

  for (const seed of CATALOG_SEEDS) {
    getOrCreateFallback(seed);
  }

  setTimeout(() => {
    void warmCatalogInBackground().catch(() => undefined);
  }, 0);

  return {
    async listCatalog(input) {
      const query = normalizeText(input?.query ?? "");
      const limit = Math.min(Math.max(input?.limit ?? 12, 1), 24);
      const offset = decodeCursor(input?.cursor);
      const filteredSeeds = query
        ? CATALOG_SEEDS.filter((seed) => {
            const zhHansTitle = CATALOG_LOCALIZATIONS[seed.externalId]?.zhHans?.title ?? "";
            return normalizeText(`${seed.title} ${seed.externalId} ${zhHansTitle}`).includes(query);
          })
        : CATALOG_SEEDS;

      const pageSeeds = filteredSeeds.slice(offset, offset + limit);
      const items = pageSeeds.map((seed) => peekSeed(seed));
      const nextOffset = offset + limit < filteredSeeds.length ? offset + limit : null;

      return {
        items,
        nextCursor: nextOffset === null ? null : encodeCursor(nextOffset),
        totalCount: filteredSeeds.length
      };
    },

    async getCatalogGame(externalId: string) {
      const seed = seedByExternalId.get(externalId);
      if (!seed) return null;
      return loadSeed(seed);
    },

    async ensureCatalogSeeded() {
      return {
        importedCount: 0,
        totalCount: CATALOG_SEEDS.length,
        refreshedAt: new Date().toISOString()
      };
    },

    async refreshCatalog() {
      cache.clear();
      for (const seed of CATALOG_SEEDS) {
        getOrCreateFallback(seed);
      }
      setTimeout(() => {
        void warmCatalogInBackground().catch(() => undefined);
      }, 0);
      return {
        importedCount: 0,
        totalCount: CATALOG_SEEDS.length,
        refreshedAt: new Date().toISOString()
      };
    },

    async getCatalogStatus() {
      return {
        totalCount: CATALOG_SEEDS.length,
        lastSyncedAt: null
      };
    }
  };
}

async function importCatalogSeeds(repository: Repository): Promise<CatalogRefreshResult> {
  const refreshedAt = new Date().toISOString();
  const resolvedGames: CatalogGame[] = [];

  for (let index = 0; index < CATALOG_SEEDS.length; index += CATALOG_IMPORT_BATCH_SIZE) {
    const batch = CATALOG_SEEDS.slice(index, index + CATALOG_IMPORT_BATCH_SIZE);
    const batchResolved = await Promise.all(batch.map((seed) => resolveCatalogGame(seed)));
    resolvedGames.push(...batchResolved);
  }

  for (const [index, catalogGame] of resolvedGames.entries()) {
    await repository.upsertCatalogGame({
      externalId: catalogGame.externalId,
      sortOrder: index,
      title: catalogGame.title,
      coverUrl: catalogGame.coverUrl,
      storeUrl: catalogGame.storeUrl,
      description: catalogGame.description,
      publisher: catalogGame.publisher,
      releaseDate: catalogGame.releaseDate,
      priceAmount: catalogGame.priceAmount,
      priceCurrency: catalogGame.priceCurrency,
      platform: catalogGame.platform,
      region: catalogGame.region,
      source: "seed-import",
      localizations: catalogGame.localizations,
      lastSyncedAt: refreshedAt
    });
  }

  return {
    importedCount: resolvedGames.length,
    totalCount: await repository.countCatalogGames(),
    refreshedAt
  };
}

function createRepositoryCatalogService(repository: Repository): CatalogService {
  return {
    async listCatalog(input) {
      const query = normalizeText(input?.query ?? "");
      const limit = Math.min(Math.max(input?.limit ?? 12, 1), 24);
      const offset = decodeCursor(input?.cursor);
      const rows = await repository.listCatalogGames();
      const filteredRows = query
        ? rows.filter((row) => {
            const zhHansTitle = resolveCatalogLocalizations(row.externalId, row.localizations).zhHans?.title ?? "";
            return normalizeText(`${row.title} ${row.externalId} ${zhHansTitle}`).includes(query);
          })
        : rows;

      const pageRows = filteredRows.slice(offset, offset + limit);
      const nextOffset = offset + limit < filteredRows.length ? offset + limit : null;

      return {
        items: pageRows.map((row) => mapCatalogRowToGame(row)),
        nextCursor: nextOffset === null ? null : encodeCursor(nextOffset),
        totalCount: filteredRows.length
      };
    },

    async getCatalogGame(externalId: string) {
      const existing = await repository.getCatalogGameByExternalId(externalId);
      if (existing) {
        return mapCatalogRowToGame(existing);
      }

      const seed = CATALOG_SEEDS.find((entry) => entry.externalId === externalId);
      if (!seed) return null;

      const resolved = await resolveCatalogGame(seed);
      const stored = await repository.upsertCatalogGame({
        externalId: resolved.externalId,
        sortOrder: CATALOG_SEEDS.findIndex((entry) => entry.externalId === externalId),
        title: resolved.title,
        coverUrl: resolved.coverUrl,
        storeUrl: resolved.storeUrl,
        description: resolved.description,
        publisher: resolved.publisher,
        releaseDate: resolved.releaseDate,
        priceAmount: resolved.priceAmount,
        priceCurrency: resolved.priceCurrency,
        platform: resolved.platform,
        region: resolved.region,
        source: "seed-import",
        localizations: resolved.localizations,
        lastSyncedAt: new Date().toISOString()
      });
      return mapCatalogRowToGame(stored);
    },

    async ensureCatalogSeeded() {
      const existingCount = await repository.countCatalogGames();
      if (existingCount >= CATALOG_SEEDS.length) {
        const rows = await repository.listCatalogGames();
        const lastSyncedAt = rows.reduce<string | null>((latest, row) => {
          if (!latest || Date.parse(row.lastSyncedAt) > Date.parse(latest)) {
            return row.lastSyncedAt;
          }
          return latest;
        }, null);
        return {
          importedCount: 0,
          totalCount: rows.length,
          refreshedAt: lastSyncedAt ?? new Date().toISOString()
        };
      }

      return importCatalogSeeds(repository);
    },

    async refreshCatalog() {
      return importCatalogSeeds(repository);
    },

    async getCatalogStatus() {
      const rows = await repository.listCatalogGames();
      const lastSyncedAt = rows.reduce<string | null>((latest, row) => {
        if (!latest || Date.parse(row.lastSyncedAt) > Date.parse(latest)) {
          return row.lastSyncedAt;
        }
        return latest;
      }, null);

      return {
        totalCount: rows.length,
        lastSyncedAt
      };
    }
  };
}

export function createCatalogService(repository?: Repository): CatalogService {
  if (!repository) {
    return createStaticCatalogService();
  }

  return createRepositoryCatalogService(repository);
}
