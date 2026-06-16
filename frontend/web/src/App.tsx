import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Alert, Button, DatePicker, Form, Input, InputNumber, Pagination, Popconfirm, Rate, Select, Spin, message } from "antd";
import dayjs from "dayjs";
import ReactECharts from "echarts-for-react";
import { api, clearToken, getToken, saveToken } from "./api";
import { IconCalendar, IconClock, IconGamepad, IconPrice } from "./icons";
import "./App.css";

type CorrectionType = "SET_TOTAL" | "ADD_DELTA";
type PlaytimeSource = "official" | "corrected" | "manual-only";
type MarketMode = "GLOBAL" | "DOMESTIC";
type GamesTab = "owned" | "recent" | "top";
type LibraryView = {
  page: "library";
  ownedPage: number;
  catalogPage: number;
  query: string;
};
type DetailReturnView = { page: "home" } | LibraryView;
type View =
  | { page: "home" }
  | { page: "ranking" }
  | LibraryView
  | { page: "game"; gameId: string }
  | { page: "catalog"; externalId: string }
  | { page: "account" };

interface User {
  id: string;
  email: string;
}

interface RegionalPrice {
  region: string;
  country: string;
  label: string;
  currency: string;
  price: number;
  salePrice: number | null;
  onSale: boolean;
  discountPercent: number | null;
  fetchedAt: string;
}

interface RegionalPriceSet {
  externalId: string;
  title: string;
  prices: RegionalPrice[];
  cheapestRegion: string | null;
  fetchedAt: string;
}

interface DashboardSummary {
  totalGames: number;
  totalMinutes: number;
  totalPriceAmount: number;
  priceCurrency: string;
  recent30Minutes: number;
  lastSyncAt: string | null;
  dataSource: Record<PlaytimeSource, number>;
}

interface DashboardChartOption {
  title: string;
  option: Record<string, unknown>;
}

interface DashboardCharts {
  donut: Array<{ name: string; value: number; gameId: string }>;
  ranking: Array<{ gameId: string; name: string; minutes: number }>;
  visualizations?: {
    engine: "r-echarts4r" | "typescript-fallback";
    generatedAt: string;
    warning?: string;
    options: {
      playtimeDonut: DashboardChartOption;
      playtimeRanking: DashboardChartOption;
      playtimeTreemap: DashboardChartOption;
    };
  };
}

interface EChartsClickParams {
  data?: {
    gameId?: string;
  };
}

interface EffectivePlaytime {
  totalMinutes: number;
  source: PlaytimeSource;
}

interface GameLocalization {
  title: string;
  description: string | null;
}

interface GameLocalizations {
  zhHans?: GameLocalization;
}

interface OwnedGame {
  id: string;
  externalId: string;
  title: string;
  coverUrl: string | null;
  ownedAt: string | null;
  lastPlayedAt: string | null;
  priceAmount: number | null;
  priceCurrency: string;
  effectivePlaytime: EffectivePlaytime;
  localizations: GameLocalizations;
}

interface CorrectionItem {
  id: string;
  gameId: string;
  type: CorrectionType;
  minutes: number;
  reason: string;
  date: string | null;
  createdAt: string;
  revokedAt: string | null;
}

interface GameDetail extends OwnedGame {
  description: string | null;
  publisher: string | null;
  releaseDate: string | null;
  storeUrl: string | null;
  criticScore: number | null;
  playerRating: PlayerRating;
  platform: "Switch";
  region: "JP" | "GLOBAL" | "UNKNOWN";
  corrections: CorrectionItem[];
}

interface PlayerRating {
  userScore: number | null;
  averageScore: number | null;
  ratingCount: number;
}

interface CatalogItem {
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
  localizations: GameLocalizations;
  isOwned: boolean;
  ownedGameId: string | null;
  ownedAt: string | null;
}

interface CatalogDetail extends Omit<CatalogItem, "isOwned" | "ownedGameId" | "ownedAt"> {
  criticScore: number | null;
  playerRating: PlayerRating;
  ownedGame: (OwnedGame & { priceAmount: number | null; priceCurrency: string }) | null;
  corrections: CorrectionItem[];
}

interface CatalogListResponse {
  items: CatalogItem[];
  nextCursor: string | null;
  totalCount: number;
}

interface OwnedGamesResponse {
  items: OwnedGame[];
  nextCursor: string | null;
}

interface AccountInfo {
  id: string;
  userId: string;
  region: "JP" | "GLOBAL" | "UNKNOWN";
  lastSyncAt: string | null;
  syncFailCount: number;
}

interface SyncStatus {
  status: string;
  startedAt: string;
  finishedAt: string | null;
  errorSummary: string | null;
}

interface DisplayPreference {
  marketMode: MarketMode;
}

interface FxContext {
  baseCurrency: "EUR";
  source: string;
  asOf: string;
  rates: {
    USD: number;
    JPY: number;
    HKD: number;
    KRW: number;
    GBP: number;
    CNY: number;
    AUD: number;
    CAD: number;
  };
}

const FALLBACK_COVERS = [
  "https://images.igdb.com/igdb/image/upload/t_cover_big/co1r7h.jpg",
  "https://images.igdb.com/igdb/image/upload/t_cover_big/co1mxf.jpg",
  "https://images.igdb.com/igdb/image/upload/t_cover_big/co1q7d.jpg",
  "https://images.igdb.com/igdb/image/upload/t_cover_big/co2lb5.jpg",
  "https://images.igdb.com/igdb/image/upload/t_cover_big/co5vmg.jpg",
  "https://images.igdb.com/igdb/image/upload/t_cover_big/co6j0z.jpg"
];

const DEFAULT_FX_CONTEXT: FxContext = {
  baseCurrency: "EUR",
  source: "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml",
  asOf: "2026-03-11",
  rates: {
    USD: 1.1641,
    JPY: 162.5,
    HKD: 9.2904,
    KRW: 1430.0,
    GBP: 0.837,
    CNY: 8.0057,
    AUD: 1.78,
    CAD: 1.58
  }
};

const PLAYTIME_PALETTE = [
  "#d05b3b",
  "#d49d32",
  "#3d8c7d",
  "#3b6fd0",
  "#8753c7",
  "#c0508f"
];
const DASHBOARD_TITLE_OVERRIDES: Record<string, string> = {
  "The Legend of Zelda™: Breath of the Wild": "塞尔达传说 旷野之息",
  "The Legend of Zelda: Breath of the Wild": "塞尔达传说 旷野之息",
  "Super Mario Odyssey": "超级马力欧 奥德赛",
  "Hollow Knight": "空洞骑士",
  "Dead Cells": "死亡细胞",
  "Manual Tracked Game": "手动记录游戏",
  "Uncharted 4: A Thief's End": "神秘海域4 盗贼末路"
};
const DEFAULT_PLAYER_RATING = {
  userScore: null,
  averageScore: null,
  ratingCount: 0
} as const;
const HOME_OWNED_GAMES_LIMIT = 18;
const LIBRARY_OWNED_GAMES_PAGE_SIZE = 18;
const MAX_PLAYER_SCORE = 10;
const STAR_COUNT = 5;
const STAR_INDEXES = Array.from({ length: STAR_COUNT }, (_, index) => index);

function getCatalogPageSize(): number {
  if (typeof window === "undefined") return 15;
  return window.innerWidth <= 900 ? 9 : 15;
}

function parseStoredUser(): User | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const decoded = JSON.parse(window.atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return { id: String(decoded.userId ?? ""), email: String(decoded.email ?? "") };
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) return response.data.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function getNickname(email?: string | null): string {
  if (!email) return "玩家";
  return email.split("@")[0] || "玩家";
}

function formatDuration(minutes: number | null | undefined): string {
  const normalizedMinutes = typeof minutes === "number" ? minutes : Number(minutes ?? 0);
  if (!Number.isFinite(normalizedMinutes) || normalizedMinutes <= 0) return "0h";
  const hours = Math.round((normalizedMinutes / 60) * 10) / 10;
  return `${Number.isInteger(hours) ? hours.toFixed(0) : hours.toFixed(1)}h`;
}

function formatScore(value: number | null | undefined, digits = 1): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function formatPercentScore(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return Math.round(value * 10).toString();
}

function clampPlayerScore(value: number): number {
  if (!Number.isFinite(value)) return 0.1;
  return Math.min(MAX_PLAYER_SCORE, Math.max(0.1, Math.round(value * 10) / 10));
}

function StarGlyph(input: { className?: string }) {
  return (
    <svg className={input.className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.6l2.9 5.87 6.48.94-4.69 4.57 1.11 6.45L12 17.4l-5.8 3.03 1.11-6.45L2.62 9.4l6.48-.94L12 2.6z" />
    </svg>
  );
}

function convertCurrency(amount: number, fromCurrency: string, toCurrency: string, fxContext: FxContext | null): number | null {
  if (fromCurrency === toCurrency) return amount;
  if (!fxContext) return null;

  const rates: Record<string, number> = {
    EUR: 1,
    ...fxContext.rates
  };
  const fromRate = rates[fromCurrency];
  const toRate = rates[toCurrency];
  if (!fromRate || !toRate) return null;
  return (amount / fromRate) * toRate;
}

function formatDisplayCurrency(
  amount: number | null,
  currency: string,
  marketMode: MarketMode,
  fxContext: FxContext | null
): string {
  if (amount === null) return "价格待同步";

  if (marketMode === "DOMESTIC") {
    const convertedAmount = convertCurrency(amount, currency, "CNY", fxContext);
    if (convertedAmount !== null) {
      return new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: "CNY",
        minimumFractionDigits: convertedAmount % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2
      }).format(convertedAmount);
    }
  }

  return formatCurrency(amount, currency);
}

function formatCurrency(amount: number | null, currency = "USD"): string {
  if (amount === null) return "价格待同步";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(amount);
}

function formatSimpleDate(value: string | null): string {
  if (!value) return "暂无记录";
  return new Date(value).toISOString().slice(0, 10);
}

function formatRelativeTime(value: string | null): string {
  if (!value) return "尚未同步";
  const diff = Date.now() - Date.parse(value);
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function formatSourceText(source: PlaytimeSource): string {
  if (source === "official") return "同步时长";
  if (source === "corrected") return "修正时长";
  return "手动时长";
}

function getDisplayTitle(
  input: { title: string; localizations?: GameLocalizations | null },
  marketMode: MarketMode
): string {
  if (marketMode === "DOMESTIC") {
    return input.localizations?.zhHans?.title ?? input.title;
  }
  return input.title;
}

function getDashboardTitle(input: { title: string; localizations?: GameLocalizations | null }, marketMode: MarketMode): string {
  const displayTitle = getDisplayTitle(input, marketMode);
  return DASHBOARD_TITLE_OVERRIDES[displayTitle] ?? DASHBOARD_TITLE_OVERRIDES[input.title] ?? displayTitle;
}

const RANK_COLORS = ["#d05b3b", "#d49d32", "#3d8c7d", "#3b6fd0", "#8753c7", "#c0508f"];

function RankBadge(input: { rank: number; className?: string }) {
  const isTop = input.rank <= 3;
  const color = RANK_COLORS[(input.rank - 1) % RANK_COLORS.length];
  return (
    <span
      className={`rank-badge${input.className ? ` ${input.className}` : ""}`}
      style={isTop ? { background: color, borderColor: color, color: "#fff", boxShadow: `0 2px 10px ${color}55` } : undefined}
      aria-label={`第 ${input.rank} 名`}
    >
      <span>{input.rank}</span>
    </span>
  );
}

function getDisplayDescription(
  input: { description: string | null; localizations?: GameLocalizations | null },
  marketMode: MarketMode
): string | null {
  if (marketMode === "DOMESTIC") {
    return input.localizations?.zhHans?.description ?? null;
  }
  return input.description;
}

function getPlaytimeColor(index: number): string {
  return PLAYTIME_PALETTE[index % PLAYTIME_PALETTE.length];
}

function getHourValue(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

function enhanceChartOption(option: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!option) return null;
  const enhancedOption: Record<string, unknown> = {
    animationDuration: 900,
    animationEasing: "cubicOut",
    animationDurationUpdate: 700,
    animationEasingUpdate: "cubicInOut",
    ...option
  };

  const tooltip =
    typeof option.tooltip === "object" && option.tooltip !== null ? (option.tooltip as Record<string, unknown>) : null;

  if (tooltip) {
    enhancedOption.tooltip = {
      renderMode: "html",
      appendToBody: true,
      transitionDuration: 0.12,
      className: "dashboard-echart-tooltip",
      ...tooltip,
      extraCssText: `z-index: 99999; pointer-events: none; ${
        typeof tooltip.extraCssText === "string" ? tooltip.extraCssText : ""
      }`.trim()
    };
  };

  return enhancedOption;
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createLibraryView(input?: Partial<Omit<LibraryView, "page">>): LibraryView {
  return {
    page: "library",
    ownedPage: input?.ownedPage ?? 1,
    catalogPage: input?.catalogPage ?? 1,
    query: input?.query ?? ""
  };
}

function parseHash(): View {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [path, search = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const params = new URLSearchParams(search);
  if (parts[0] === "ranking") return { page: "ranking" };
  if (parts[0] === "library") {
    return createLibraryView({
      ownedPage: parsePositiveInt(params.get("owned"), 1),
      catalogPage: parsePositiveInt(params.get("catalog"), 1),
      query: params.get("q") ?? ""
    });
  }
  if (parts[0] === "account") return { page: "account" };
  if (parts[0] === "game" && parts[1]) return { page: "game", gameId: decodeURIComponent(parts[1]) };
  if (parts[0] === "catalog" && parts[1]) return { page: "catalog", externalId: decodeURIComponent(parts[1]) };
  return { page: "home" };
}

function toHash(view: View): string {
  if (view.page === "game") return `#/game/${encodeURIComponent(view.gameId)}`;
  if (view.page === "catalog") return `#/catalog/${encodeURIComponent(view.externalId)}`;
  if (view.page === "library") {
    const params = new URLSearchParams();
    if (view.ownedPage > 1) params.set("owned", String(view.ownedPage));
    if (view.catalogPage > 1) params.set("catalog", String(view.catalogPage));
    if (view.query.trim()) params.set("q", view.query.trim());
    const query = params.toString();
    return query ? `#/library?${query}` : "#/library";
  }
  return view.page === "home" ? "#/" : `#/${view.page}`;
}

type CoverVariant = "card" | "hero" | "detail";

function optimizeNintendoAssetUrl(url: string, variant: CoverVariant): string {
  if (!url.startsWith("https://assets.nintendo.com/")) {
    return url;
  }

  try {
    const parsed = new URL(url);
    const assetPathMatch = parsed.pathname.match(/(?:^|\/)(?:v1\/)?(store\/software\/.+)$/);
    if (!assetPathMatch) {
      return url;
    }

    const width = variant === "detail" ? 720 : variant === "hero" ? 420 : 300;
    parsed.pathname = `/image/upload/c_pad,dpr_2.0,f_auto,q_auto,w_${width}/b_rgb:ffffff/v1/${assetPathMatch[1]}`;
    parsed.search = "";
    return parsed.toString();
  } catch {
    return url;
  }
}

function getProxiedImageUrl(url: string | null | undefined, variant: CoverVariant): string {
  const original = url ?? FALLBACK_COVERS[0];
  if (!original || original.startsWith("data:")) return original;

  // For assets.nintendo.com URLs, apply Cloudinary optimization first
  let targetUrl = original;
  if (original.startsWith("https://assets.nintendo.com/")) {
    targetUrl = optimizeNintendoAssetUrl(original, variant);
  }

  const width = variant === "detail" ? 720 : variant === "hero" ? 420 : 300;
  return `/api/proxy/image?url=${encodeURIComponent(targetUrl)}&w=${width}&q=80`;
}

function toBackgroundImage(url: string | null | undefined, variant: CoverVariant = "card"): string {
  const resolved = getProxiedImageUrl(url, variant);
  return `url("${resolved.replace(/"/g, '\\"')}")`;
}

function useLazyRef<T extends HTMLElement>(): [React.RefCallback<T>, boolean] {
  const [visible, setVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref: React.RefCallback<T> = useCallback((node) => {
    observerRef.current?.disconnect();
    if (!node) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    obs.observe(node);
    observerRef.current = obs;
  }, []);

  return [ref, visible];
}

function encodeCursor(offset: number): string | undefined {
  if (offset <= 0) return undefined;
  return window.btoa(String(offset)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function CoverCard(input: {
  title: string;
  coverUrl: string | null;
  badge?: string;
  meta?: string;
  owned?: boolean;
  onClick: () => void;
}) {
  const coverImage = toBackgroundImage(input.coverUrl, "card");
  const [lazyRef, visible] = useLazyRef<HTMLDivElement>();

  return (
    <button type="button" className="cover-card" onClick={input.onClick}>
      <div
        ref={lazyRef}
        className="cover-card-media"
        style={{ backgroundImage: visible ? coverImage : "none" } as CSSProperties}
      >
        {input.badge && <span className="cover-card-badge">{input.badge}</span>}
        {input.owned && <span className="cover-card-owned">已入库</span>}
      </div>
      <div className="cover-card-body">
        <strong>{input.title}</strong>
        {input.meta && <span>{input.meta}</span>}
      </div>
    </button>
  );
}

function HeroWallCover(input: { cover: string; variant: "auth" | "hero"; index: number }) {
  const [lazyRef, visible] = useLazyRef<HTMLDivElement>();
  const className = input.variant === "auth" ? "auth-wall-cover" : "hero-wall-cover";

  return (
    <div
      ref={lazyRef}
      className={className}
      style={{
        backgroundImage: visible ? toBackgroundImage(input.cover, "hero") : "none",
        "--i": input.index,
      } as CSSProperties}
    />
  );
}

function DashboardFeaturedCover(input: { coverUrl: string | null; title: string; playtime: string }) {
  const [lazyRef, visible] = useLazyRef<HTMLDivElement>();
  const bgImage = toBackgroundImage(input.coverUrl, "hero");

  return (
    <div
      ref={lazyRef}
      className="dashboard-featured-cover"
      style={{ backgroundImage: visible ? bgImage : "none" } as CSSProperties}
    >
      <div>
        <span>游玩冠军</span>
        <strong>{input.title}</strong>
        <em>{input.playtime}</em>
      </div>
    </div>
  );
}

const REGION_EMOJI: Record<string, string> = {
  JP: "🇯🇵", US: "🇺🇸", HK: "🇭🇰", KR: "🇰🇷", GB: "🇬🇧", EU: "🇪🇺", AU: "🇦🇺", CA: "🇨🇦", BR: "🇧🇷", MX: "🇲🇽", NZ: "🇳🇿", NO: "🇳🇴"
};

const WARM_BAR_COLORS = [
  { start: "#b24a28", end: "#d06a3e" },
  { start: "#3d8c7d", end: "#5aad9a" },
  { start: "#8f6b3b", end: "#b8944f" },
  { start: "#6b5b8a", end: "#8e7ab0" },
  { start: "#c05050", end: "#d97070" },
  { start: "#4a7a5a", end: "#6a9a7a" },
  { start: "#8c6b3d", end: "#b08f55" },
  { start: "#5a6b8c", end: "#7a8bb0" },
];

function formatCNY(amount: number): string {
  return `¥${Math.round(amount).toLocaleString("zh-CN")}`;
}

function buildRegionalPriceChartOption(prices: RegionalPrice[], fxContext: FxContext | null): Record<string, unknown> {
  const toCny = (amount: number, currency: string): number => {
    if (currency === "CNY") return amount;
    if (!fxContext) {
      const fallback: Record<string, number> = { USD: 7.25, EUR: 7.9, JPY: 0.048, HKD: 0.93, KRW: 0.0053, GBP: 9.2, AUD: 4.7, CAD: 5.3 };
      return amount * (fallback[currency] ?? 1);
    }
    const rates: Record<string, number> = { EUR: 1, ...fxContext.rates };
    const fromRate = rates[currency];
    const toRate = rates["CNY"];
    if (!fromRate || !toRate) return amount * 7.25;
    return (amount / fromRate) * toRate;
  };

  const sorted = [...prices]
    .map((p) => ({
      ...p,
      priceCny: p.onSale && p.salePrice !== null
        ? toCny(p.salePrice, p.currency)
        : toCny(p.price, p.currency),
      originalCny: toCny(p.price, p.currency)
    }))
    .sort((a, b) => a.priceCny - b.priceCny);

  const maxPrice = Math.max(...sorted.map((p) => p.originalCny));

  return {
    backgroundColor: "transparent",
    grid: { left: 8, right: 90, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      backgroundColor: "rgba(36,24,18,0.92)",
      borderColor: "rgba(178,74,40,0.3)",
      borderWidth: 1,
      textStyle: { color: "#f3ece2", fontSize: 13 },
      formatter: (params: Array<{ dataIndex: number }>) => {
        const item = sorted[params[0].dataIndex];
        const displayPrice = item.onSale && item.salePrice !== null ? item.salePrice : item.price;
        const emoji = REGION_EMOJI[item.region] ?? "";
        let html = `<div style="font-weight:700;margin-bottom:4px">${emoji} ${item.label}</div>`;
        html += `<div style="font-size:18px;color:#b24a28;font-weight:800">${formatCNY(item.priceCny)}</div>`;
        html += `<div style="color:#a89880;font-size:12px;margin-top:2px">${formatCurrency(displayPrice, item.currency)}</div>`;
        if (item.onSale && item.discountPercent !== null) {
          html += `<div style="color:#c05050;font-weight:700;margin-top:4px">-${item.discountPercent}% 打折中</div>`;
        }
        if (item.region === sorted[0].region) {
          html += `<div style="color:#3d8c7d;margin-top:4px">最低价区</div>`;
        }
        return html;
      }
    },
    xAxis: {
      type: "value",
      show: false,
      max: maxPrice * 1.15
    },
    yAxis: {
      type: "category",
      data: sorted.map((p) => {
        const emoji = REGION_EMOJI[p.region] ?? "";
        return `${emoji}  ${p.region}`;
      }),
      inverse: true,
      axisLabel: {
        color: "#241812",
        fontSize: 13,
        fontWeight: 600,
        margin: 12
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false }
    },
    series: [
      {
        type: "bar",
        barWidth: 22,
        data: sorted.map((p, i) => ({
          value: Number(p.priceCny.toFixed(0)),
          itemStyle: {
            color: p.onSale
              ? {
                  type: "linear",
                  x: 0, y: 0, x2: 1, y2: 0,
                  colorStops: [
                    { offset: 0, color: "#c05050" },
                    { offset: 1, color: "#d97070" }
                  ]
                }
              : {
                  type: "linear",
                  x: 0, y: 0, x2: 1, y2: 0,
                  colorStops: [
                    { offset: 0, color: WARM_BAR_COLORS[i % WARM_BAR_COLORS.length].start },
                    { offset: 1, color: WARM_BAR_COLORS[i % WARM_BAR_COLORS.length].end }
                  ]
                },
            borderRadius: [0, 6, 6, 0]
          }
        })),
        label: {
          show: true,
          position: "right",
          formatter: (params: { dataIndex: number }) => {
            const item = sorted[params.dataIndex];
            const isCheapest = params.dataIndex === 0;
            const saleTag = item.onSale ? " 打折" : "";
            const crown = isCheapest ? "最低 " : "";
            return `${crown}${formatCNY(item.priceCny)}${saleTag}`;
          },
          color: "#241812",
          fontSize: 12,
          fontWeight: 700
        },
        emphasis: {
          itemStyle: {
            shadowBlur: 12,
            shadowColor: "rgba(178,74,40,0.25)"
          }
        }
      },
      {
        type: "bar",
        barWidth: 22,
        data: sorted.map(() => sorted[0].priceCny),
        itemStyle: {
          color: "rgba(178,74,40,0.06)",
          borderRadius: [0, 6, 6, 0]
        },
        barGap: "-100%",
        silent: true,
        z: 0
      }
    ]
  };
}

function RegionalPriceChart({ prices, loading, cheapestRegion: _cheapestRegion, fxContext, priceMapHtml }: { prices: RegionalPrice[] | null; loading: boolean; cheapestRegion: string | null; fxContext: FxContext | null; priceMapHtml: string | null }) {
  const chartOption = useMemo(
    () => (prices && prices.length > 0 ? buildRegionalPriceChartOption(prices, fxContext) : null),
    [prices, fxContext]
  );

  if (loading) {
    return (
      <section className="panel panel-wide price-chart-panel">
        <span className="eyebrow">跨区价格</span>
        <h2>eShop 各区价格对比</h2>
        <div className="price-chart-loading">
          <Spin />
        </div>
      </section>
    );
  }

  if (!prices || prices.length === 0) {
    return null;
  }

  const toCny = (p: RegionalPrice): number => {
    const raw = p.onSale && p.salePrice !== null ? p.salePrice : p.price;
    return convertCurrency(raw, p.currency, "CNY", fxContext) ?? raw * 7.25;
  };
  const sorted = [...prices].sort((a, b) => toCny(a) - toCny(b));
  const cheapest = sorted[0];

  return (
    <section className="panel panel-wide price-chart-panel">
      <div className="price-chart-header">
        <div>
          <span className="eyebrow">跨区价格</span>
          <h2>eShop 各区价格对比</h2>
        </div>
        {cheapest && (
          <span className="price-chart-cheapest">
            {cheapest.label} 最低价
          </span>
        )}
      </div>
      {priceMapHtml ? (
        <iframe
          srcDoc={priceMapHtml}
          className="price-map-iframe"
          title="eShop 世界价格地图"
          sandbox="allow-scripts"
          style={{ width: "100%", height: 460, border: "none", borderRadius: 12 }}
        />
      ) : (
        <ReactECharts option={chartOption!} className="price-echart" style={{ height: Math.max(200, prices.length * 48 + 16) }} />
      )}
      <span className="price-chart-note">{priceMapHtml ? "交互地图 · 点击标记查看价格详情" : "价格已换算为人民币 (CNY)，打折区域以红色标注"}</span>
    </section>
  );
}

function resolvePointerScore(clientX: number, element: HTMLButtonElement): number {
  const rect = element.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return clampPlayerScore(ratio * MAX_PLAYER_SCORE);
}

export function LegacyPrecisionScoreInput(input: {
  value: number | null;
  disabled: boolean;
  onChange: (score: number) => void;
}) {
  const [hoverScore, setHoverScore] = useState<number | null>(null);
  const displayScore = hoverScore ?? input.value ?? 0;

  function handleMouseMove(event: MouseEvent<HTMLButtonElement>) {
    if (input.disabled) return;
    setHoverScore(resolvePointerScore(event.clientX, event.currentTarget));
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (input.disabled) return;
    input.onChange(resolvePointerScore(event.clientX, event.currentTarget));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (input.disabled) return;

    const baseScore = hoverScore ?? input.value ?? 5;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      setHoverScore(clampPlayerScore(baseScore + 0.1));
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      setHoverScore(clampPlayerScore(baseScore - 0.1));
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setHoverScore(0.1);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setHoverScore(MAX_PLAYER_SCORE);
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && hoverScore !== null) {
      event.preventDefault();
      input.onChange(hoverScore);
    }
  }

  return (
    <div className="precision-score-input">
      <button
        type="button"
        className="precision-score-button"
        disabled={input.disabled}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverScore(null)}
        onBlur={() => setHoverScore(null)}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="slider"
        aria-label="Player score"
        aria-valuemin={1}
        aria-valuemax={100}
        aria-valuenow={Math.round((input.value ?? 0) * 10)}
        aria-valuetext={input.value === null ? "未评分" : `${formatPercentScore(input.value)} 分`}
      >
        <span className="precision-score-stars precision-score-stars-base" aria-hidden="true">
          {"★".repeat(STAR_COUNT)}
        </span>
        <span
          className="precision-score-stars precision-score-stars-fill"
          style={{ width: `${(displayScore / MAX_PLAYER_SCORE) * 100}%` }}
          aria-hidden="true"
        >
          {"★".repeat(STAR_COUNT)}
        </span>
      </button>
    </div>
  );
}

function PrecisionScoreInput(input: {
  value: number | null;
  disabled: boolean;
  onChange: (score: number) => void;
}) {
  const [hoverScore, setHoverScore] = useState<number | null>(null);
  const displayScore = hoverScore ?? input.value ?? 0;
  const previewLabel = hoverScore === null ? null : `${formatPercentScore(hoverScore)} 分`;

  function renderStarRow() {
    return STAR_INDEXES.map((index) => <StarGlyph key={index} className="precision-score-star-icon" />);
  }

  function clearPreview() {
    setHoverScore(null);
  }

  function handleMouseMove(event: MouseEvent<HTMLButtonElement>) {
    if (input.disabled) return;
    setHoverScore(resolvePointerScore(event.clientX, event.currentTarget));
  }

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    if (input.disabled) return;
    input.onChange(resolvePointerScore(event.clientX, event.currentTarget));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (input.disabled) return;

    const baseScore = hoverScore ?? input.value ?? 5;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      setHoverScore(clampPlayerScore(baseScore + 0.1));
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      setHoverScore(clampPlayerScore(baseScore - 0.1));
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      setHoverScore(0.1);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      setHoverScore(MAX_PLAYER_SCORE);
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && hoverScore !== null) {
      event.preventDefault();
      input.onChange(hoverScore);
    }
  }

  return (
    <div className="precision-score-input">
      <button
        type="button"
        className="precision-score-button"
        disabled={input.disabled}
        onMouseMove={handleMouseMove}
        onMouseLeave={clearPreview}
        onBlur={clearPreview}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="slider"
        aria-label="Player score"
        aria-valuemin={1}
        aria-valuemax={100}
        aria-valuenow={Math.round(((hoverScore ?? input.value) ?? 0) * 10)}
        aria-valuetext={(hoverScore ?? input.value) === null ? "未评分" : `${formatPercentScore(hoverScore ?? input.value)} 分`}
      >
        <span className="precision-score-stars precision-score-stars-base" aria-hidden="true">
          <span className="precision-score-star-row">{renderStarRow()}</span>
        </span>
        <span
          className="precision-score-stars precision-score-stars-fill"
          style={{ width: `${(displayScore / MAX_PLAYER_SCORE) * 100}%` }}
          aria-hidden="true"
        >
          <span className="precision-score-star-row">{renderStarRow()}</span>
        </span>
      </button>
      <span
        className={`precision-score-preview${previewLabel ? " precision-score-preview-visible" : ""}`}
        aria-live="polite"
      >
        {previewLabel}
      </span>
    </div>
  );
}

function AvatarMenu(input: { nickname: string; email: string; avatarUrl: string | null; lastSync: string; onAccount: () => void; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const initial = (input.nickname || "?" ).charAt(0).toUpperCase();

  useEffect(() => {
    const handler = (e: Event) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [open]);

  return (
    <div className="avatar-menu" ref={menuRef}>
      <button type="button" className="avatar-btn" onClick={() => setOpen(!open)} aria-label="用户菜单">
        {input.avatarUrl ? (
          <img className="avatar-btn-img" src={input.avatarUrl} alt="" />
        ) : (
          <span className="avatar-chip">{initial}</span>
        )}
      </button>
      {open && (
        <div className="avatar-dropdown">
          <div className="avatar-dropdown-user">
            {input.avatarUrl ? (
              <img className="avatar-dropdown-img" src={input.avatarUrl} alt="" />
            ) : (
              <span className="avatar-chip avatar-chip-lg">{initial}</span>
            )}
            <div>
              <strong>{input.nickname}</strong>
              <span>{input.email}</span>
            </div>
          </div>
          <div className="avatar-dropdown-divider" />
          <button type="button" className="avatar-dropdown-item" onClick={() => { setOpen(false); input.onAccount(); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            个人中心
          </button>
          <button type="button" className="avatar-dropdown-item avatar-dropdown-item-danger" onClick={() => { setOpen(false); input.onLogout(); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const initialView = parseHash();
  const [token, setToken] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<User | null>(() => parseStoredUser());
  const [view, setView] = useState<View>(() => initialView);
  const [bootLoading, setBootLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [dashboardCharts, setDashboardCharts] = useState<DashboardCharts | null>(null);
  const [ownedGames, setOwnedGames] = useState<OwnedGame[]>([]);
  const [topGames, setTopGames] = useState<OwnedGame[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [ownedGamesPage, setOwnedGamesPage] = useState(1);
  const [catalogPage, setCatalogPage] = useState(1);
  const [catalogPageSize, setCatalogPageSize] = useState(() => getCatalogPageSize());
  const [catalogTotalCount, setCatalogTotalCount] = useState(0);
  const [lastLibraryView, setLastLibraryView] = useState<LibraryView>(() =>
    initialView.page === "library" ? initialView : createLibraryView()
  );
  const [catalogReturnView, setCatalogReturnView] = useState<DetailReturnView>(() =>
    initialView.page === "library" ? initialView : { page: "home" }
  );
  const [gameReturnView, setGameReturnView] = useState<DetailReturnView>(() =>
    initialView.page === "library" ? initialView : { page: "home" }
  );
  const [catalogDetail, setCatalogDetail] = useState<CatalogDetail | null>(null);
  const [gameDetail, setGameDetail] = useState<GameDetail | null>(null);
  const [regionalPrices, setRegionalPrices] = useState<RegionalPriceSet | null>(null);
  const [regionalPricesLoading, setRegionalPricesLoading] = useState(false);
  const [priceMapHtml, setPriceMapHtml] = useState<string | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const otpCountdownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [authView, setAuthView] = useState<"login" | "register">("login");
  const [devVerifyCode, setDevVerifyCode] = useState<string | null>(null);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [displayPreference, setDisplayPreference] = useState<DisplayPreference | null>({ marketMode: "DOMESTIC" });
  const [fxContext, setFxContext] = useState<FxContext | null>(DEFAULT_FX_CONTEXT);
  const [pendingMarketMode, setPendingMarketMode] = useState<MarketMode>("DOMESTIC");
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [loginForm] = Form.useForm<{ email: string; password: string }>();
  const [registerForm] = Form.useForm<{ email: string; code: string; password: string; confirmPassword: string }>();
  const [bindForm] = Form.useForm<{ sessionToken: string; region: "JP" | "GLOBAL" | "UNKNOWN" }>();
  const [correctionForm] = Form.useForm<{ type: CorrectionType; hours: number; reason: string; date: dayjs.Dayjs | null }>();
  const hasHandledCatalogPageSizeChange = useRef(false);
  const nickname = getNickname(user?.email);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    try { return localStorage.getItem("nintendo_avatar"); } catch { return null; }
  });
  const marketMode = displayPreference?.marketMode ?? "DOMESTIC";
  const gamePlayerRating = gameDetail?.playerRating ?? DEFAULT_PLAYER_RATING;
  const gameCriticScore = typeof gameDetail?.criticScore === "number" ? gameDetail.criticScore : null;
  const heroCovers = useMemo(() => {
    const dynamic = ownedGames.map((item) => item.coverUrl).filter((entry): entry is string => Boolean(entry));
    return [...dynamic, ...FALLBACK_COVERS].slice(0, 6);
  }, [ownedGames]);
  const featuredOwnedGames = useMemo(() => ownedGames.slice(0, HOME_OWNED_GAMES_LIMIT), [ownedGames]);
  const dashboardGames = useMemo(() => topGames.slice(0, 5), [topGames]);
  const rankingTotalMinutes = useMemo(
    () => topGames.reduce((sum, game) => sum + game.effectivePlaytime.totalMinutes, 0),
    [topGames]
  );
  const rankingMaxMinutes = useMemo(
    () => topGames.reduce((max, game) => Math.max(max, game.effectivePlaytime.totalMinutes), 0),
    [topGames]
  );
  const dashboardTotalMinutes = useMemo(
    () => dashboardGames.reduce((sum, game) => sum + game.effectivePlaytime.totalMinutes, 0),
    [dashboardGames]
  );
  const dashboardMaxMinutes = useMemo(
    () => dashboardGames.reduce((max, game) => Math.max(max, game.effectivePlaytime.totalMinutes), 0),
    [dashboardGames]
  );
  const dashboardRing = useMemo(() => {
    if (dashboardTotalMinutes <= 0 || dashboardGames.length === 0) {
      return "conic-gradient(rgba(49, 36, 22, 0.1) 0% 100%)";
    }

    let start = 0;
    const segments = dashboardGames.map((game, index) => {
      const share = game.effectivePlaytime.totalMinutes / dashboardTotalMinutes;
      const end = index === dashboardGames.length - 1 ? 100 : start + share * 100;
      const segment = `${getPlaytimeColor(index)} ${start}% ${end}%`;
      start = end;
      return segment;
    });
    return `conic-gradient(${segments.join(", ")})`;
  }, [dashboardGames, dashboardTotalMinutes]);
  const dashboardDonutOption = useMemo(() => {
    if (dashboardGames.length === 0) return null;
    const topData = dashboardGames.filter((game) => game.effectivePlaytime.totalMinutes > 0).map((game, index) => {
      const minutes = game.effectivePlaytime.totalMinutes;
      return {
        name: getDashboardTitle(game, marketMode),
        value: minutes,
        gameId: game.id,
        hours: getHourValue(minutes),
        itemStyle: {
          color: getPlaytimeColor(index),
          shadowColor: `${getPlaytimeColor(index)}66`,
          shadowBlur: 18,
          borderColor: "#fff7ef",
          borderWidth: 4
        }
      };
    });

    return enhanceChartOption({
      backgroundColor: "transparent",
      color: PLAYTIME_PALETTE,
      tooltip: {
        trigger: "item",
        borderWidth: 0,
        padding: [10, 12],
        backgroundColor: "rgba(36, 24, 18, 0.88)",
        textStyle: { color: "#fff7ef", fontSize: 13 },
        formatter: (params: { name: string; percent: number; data?: { hours?: number } }) =>
          `${params.name}<br/>游玩 ${params.data?.hours ?? 0} 小时 · 占比 ${Math.round(params.percent)}%`
      },
      legend: {
        data: topData.map((item) => item.name),
        bottom: 4,
        left: "center",
        icon: "roundRect",
        itemWidth: 14,
        itemHeight: 9,
        textStyle: {
          color: "#625347",
          fontSize: 12
        },
        formatter: (name: string) => (name.length > 13 ? `${name.slice(0, 13)}…` : name)
      },
      series: [
        {
          name: "能量外环",
          type: "pie",
          silent: true,
          tooltip: { show: false },
          legendHoverLink: false,
          radius: ["80%", "82%"],
          center: ["50%", "50%"],
          label: { show: false },
          labelLine: { show: false },
          data: [
            {
              value: 100,
              name: "能量外环",
              itemStyle: {
                color: "rgba(178, 74, 40, 0.18)",
                borderColor: "rgba(255, 247, 239, 0.8)",
                borderWidth: 1,
                shadowColor: "rgba(178, 74, 40, 0.18)",
                shadowBlur: 22
              }
            }
          ]
        },
        {
          name: "游玩时长",
          type: "pie",
          radius: ["44%", "68%"],
          center: ["50%", "50%"],
          startAngle: 88,
          minAngle: 6,
          padAngle: 4,
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 16
          },
          label: {
            color: "#2d1e18",
            fontSize: 12,
            formatter: (params: { name: string; percent: number }) =>
              `${params.name.length > 8 ? `${params.name.slice(0, 8)}…` : params.name}\n${Math.round(params.percent)}%`
          },
          labelLine: {
            length: 18,
            length2: 20,
            lineStyle: {
              width: 1.4
            }
          },
          emphasis: {
            scale: true,
            scaleSize: 13,
            itemStyle: {
              shadowBlur: 28,
              shadowColor: "rgba(57, 35, 16, 0.24)"
            }
          },
          data: topData
        },
        {
          name: "中心护盾",
          type: "pie",
          silent: true,
          tooltip: { show: false },
          legendHoverLink: false,
          radius: ["28%", "34%"],
          center: ["50%", "50%"],
          label: { show: false },
          labelLine: { show: false },
          data: [
            {
              value: 100,
              name: "中心护盾",
              itemStyle: {
                color: "rgba(255, 248, 241, 0.9)",
                borderColor: "rgba(178, 74, 40, 0.16)",
                borderWidth: 2,
                shadowBlur: 18,
                shadowColor: "rgba(87, 43, 24, 0.1)"
              }
            }
          ]
        }
      ]
    });
  }, [dashboardGames, marketMode]);
  const dashboardChartEvents = useMemo(
    () => ({
      click: (params: EChartsClickParams) => {
        const gameId = params.data?.gameId;
        if (gameId) {
          openGameDetail(gameId);
        }
      }
    }),
    []
  );

  function getLibraryView(input?: Partial<LibraryView>): LibraryView {
    const base = view.page === "library" ? view : lastLibraryView;
    return createLibraryView({
      ownedPage: input?.ownedPage ?? base.ownedPage,
      catalogPage: input?.catalogPage ?? base.catalogPage,
      query: input?.query ?? base.query
    });
  }

  function resolveDetailReturnView(source: View): DetailReturnView {
    return source.page === "library" ? getLibraryView(source) : { page: "home" };
  }

  function openGameDetail(gameId: string, source: View = view) {
    setGameReturnView(resolveDetailReturnView(source));
    navigate({ page: "game", gameId });
  }

  function openCatalogDetail(externalId: string, source: View = view) {
    setCatalogReturnView(resolveDetailReturnView(source));
    navigate({ page: "catalog", externalId });
  }

  function goBackFromGameDetail() {
    navigate(gameReturnView);
  }

  function goBackFromCatalogDetail() {
    navigate(catalogReturnView);
  }

  function navigate(nextView: View) {
    const hash = toHash(nextView);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
      return;
    }
    setView(nextView);
  }

  function renderDetailHero(input: {
    eyebrow: string;
    title: string;
    coverUrl: string | null;
    badge: string | null;
    description: string | null;
    metaItems: Array<{ label: string; value: string }>;
    criticScore: number | null;
    playerRating: PlayerRating;
    onRate: (score: number) => void;
    actions: ReactNode;
  }) {
    return (
      <section className="panel panel-wide detail-hero">
        <div className="detail-cover">
          <img
            className="detail-cover-art"
            src={getProxiedImageUrl(input.coverUrl, "detail")}
            alt={input.title}
            loading="lazy"
            decoding="async"
          />
          {input.badge && <span className="cover-card-badge">{input.badge}</span>}
        </div>
        <div className="detail-copy">
          <span className="eyebrow">{input.eyebrow}</span>
          <h1>{input.title}</h1>
          <p className="detail-description">{input.description ?? "当前没有同步到商店描述。你仍然可以先查看评分、再决定是否入库。"}</p>
          <div className="detail-meta-grid">
            {input.metaItems.map((item) => (
              <div key={item.label} className="detail-meta-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
          <div className="detail-score-grid">
            <div
              className="detail-score-card detail-score-card-meta"
              data-score={input.criticScore === null ? "--" : Math.round(input.criticScore)}
            >
              <span>Meta 评分</span>
              <strong className="detail-score-placeholder" aria-hidden="true">
                100 分
              </strong>
              <span className="sr-only">{input.criticScore === null ? "待补充" : `${input.criticScore} / 100`}</span>
              <em>{input.criticScore === null ? "当前没有收录到该作品的媒体分" : "使用作品级 Metascore 作为参考"}</em>
            </div>
            <div
              className="detail-score-card detail-score-card-player"
              data-score={formatPercentScore(input.playerRating.averageScore)}
            >
              <span>玩家平均分</span>
              <strong className="detail-score-placeholder" aria-hidden="true">
                100 分
              </strong>
              <span className="sr-only">{input.playerRating.averageScore === null ? "暂无评分" : `${formatPercentScore(input.playerRating.averageScore)} 分`}</span>
              <em>{input.playerRating.ratingCount > 0 ? `${input.playerRating.ratingCount} 位玩家已评分` : "还没有玩家评分"}</em>
            </div>
            <div className="detail-score-card detail-score-card-interactive">
              <span>我的评分</span>
              <PrecisionScoreInput
                value={input.playerRating.userScore}
                disabled={ratingLoading}
                onChange={input.onRate}
              />
            </div>
          </div>
          <div className="row-actions">{input.actions}</div>
        </div>
      </section>
    );
  }

  async function fetchOwnedGames(input?: { limit?: number; tab?: GamesTab; page?: number }) {
    const limit = input?.limit ?? LIBRARY_OWNED_GAMES_PAGE_SIZE;
    const tab = input?.tab ?? "owned";
    const page = input?.page ?? 1;
    const cursor = encodeCursor((page - 1) * limit);
    const response = await api.get<OwnedGamesResponse>("/api/games", { params: { tab, limit, cursor } });
    setOwnedGames(response.data.items);
    if (tab === "owned") {
      setOwnedGamesPage(page);
    }
  }

  async function fetchTopGames() {
    const items: OwnedGame[] = [];
    let cursor: string | null | undefined = undefined;

    do {
      const response: { data: { items: OwnedGame[]; nextCursor: string | null } } = await api.get("/api/games", {
        params: { tab: "top", limit: 100, cursor }
      });
      items.push(...response.data.items);
      cursor = response.data.nextCursor;
    } while (cursor);

    setTopGames(items);
  }

  async function fetchSummary() {
    const response = await api.get<DashboardSummary>("/api/dashboard/summary");
    setSummary(response.data);
  }

  async function fetchRegionalPrices(externalId: string) {
    setRegionalPricesLoading(true);
    try {
      const [pricesRes, mapRes] = await Promise.allSettled([
        api.get<RegionalPriceSet>(`/api/catalog/games/${externalId}/prices`),
        api.get(`/api/catalog/games/${externalId}/pricemap`, { responseType: "text" })
      ]);
      setRegionalPrices(pricesRes.status === "fulfilled" ? pricesRes.value.data : null);
      setPriceMapHtml(mapRes.status === "fulfilled" ? mapRes.value.data : null);
    } catch {
      setRegionalPrices(null);
      setPriceMapHtml(null);
    } finally {
      setRegionalPricesLoading(false);
    }
  }

  async function fetchDashboardCharts() {
    const response = await api.get<DashboardCharts>("/api/dashboard/charts", { params: { range: "30d" } });
    setDashboardCharts(response.data);
  }

  async function fetchSyncStatus() {
    const response = await api.get<{ status: SyncStatus | null }>("/api/sync/status");
    setSyncStatus(response.data.status);
  }

  async function fetchDisplayPreferences() {
    const response = await api.get<{ preference: DisplayPreference; fx: FxContext }>("/api/accounts/preferences");
    setDisplayPreference(response.data.preference);
    setFxContext(response.data.fx);
    setPendingMarketMode(response.data.preference.marketMode);
  }

  async function fetchCatalogPage(input?: { query?: string; page?: number }) {
    const page = input?.page ?? 1;
    const cursor = encodeCursor((page - 1) * catalogPageSize);
    const response = await api.get<CatalogListResponse>("/api/catalog/games", {
      params: { q: input?.query ?? catalogQuery, cursor, limit: catalogPageSize }
    });
    setCatalogItems(response.data.items);
    setCatalogTotalCount(response.data.totalCount);
    setCatalogPage(page);
  }

  async function loadCurrentView(nextView: View = view) {
    setBootLoading(true);
    setErrorText(null);
    try {
      if (nextView.page === "home") {
        await Promise.all([
          fetchSummary(),
          fetchDashboardCharts(),
          fetchOwnedGames({ limit: HOME_OWNED_GAMES_LIMIT, page: 1 }),
          fetchTopGames()
        ]);
        setGameDetail(null);
        setCatalogDetail(null);
      } else if (nextView.page === "ranking") {
        await Promise.all([fetchSummary(), fetchDashboardCharts(), fetchTopGames()]);
        setGameDetail(null);
        setCatalogDetail(null);
      } else if (nextView.page === "library") {
        setCatalogQuery(nextView.query);
        await Promise.all([
          fetchSummary(),
          fetchOwnedGames({ limit: LIBRARY_OWNED_GAMES_PAGE_SIZE, page: nextView.ownedPage }),
          fetchCatalogPage({ query: nextView.query, page: nextView.catalogPage })
        ]);
        setGameDetail(null);
        setCatalogDetail(null);
      } else if (nextView.page === "game") {
        const response = await api.get<GameDetail>(`/api/games/${nextView.gameId}`);
        setGameDetail(response.data);
        setCatalogDetail(null);
        void fetchRegionalPrices(response.data.externalId);
      } else if (nextView.page === "catalog") {
        const response = await api.get<CatalogDetail>(`/api/catalog/games/${nextView.externalId}`);
        setCatalogDetail(response.data);
        setGameDetail(null);
        void fetchRegionalPrices(nextView.externalId);
      } else {
        const [accountResponse] = await Promise.all([
          api.get<{ account: AccountInfo | null }>("/api/accounts/nintendo"),
          fetchSyncStatus()
        ]);
        setAccountInfo(accountResponse.data.account);
        setGameDetail(null);
        setCatalogDetail(null);
        setRegionalPrices(null);
        setPriceMapHtml(null);
      }
    } catch (error) {
      setErrorText(getErrorMessage(error, "页面数据加载失败，请稍后再试"));
    } finally {
      setBootLoading(false);
    }
  }

  useEffect(() => {
    const handleHashChange = () => setView(parseHash());
    window.addEventListener("hashchange", handleHashChange);
    if (!window.location.hash) {
      window.location.hash = "#/";
    }
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (!token) return;
    loadCurrentView(view).catch(() => undefined);
  }, [token, view]);

  useEffect(() => {
    if (!token) return;
    fetchDisplayPreferences().catch(() => undefined);
  }, [token]);

  useEffect(() => {
    if (view.page === "library") {
      setLastLibraryView(view);
    }
  }, [view]);

  useEffect(() => {
    const handleResize = () => {
      const nextPageSize = getCatalogPageSize();
      setCatalogPageSize((current) => (current === nextPageSize ? current : nextPageSize));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!hasHandledCatalogPageSizeChange.current) {
      hasHandledCatalogPageSizeChange.current = true;
      return;
    }
    if (!token || view.page !== "library") return;
    navigate(getLibraryView({ catalogPage: 1, query: catalogQuery }));
  }, [catalogPageSize]);

  useEffect(() => {
    setRemoveConfirmOpen(false);
  }, [view, gameDetail?.id]);

  useEffect(() => {
    if (otpCountdown <= 0) return;
    otpCountdownRef.current = setTimeout(() => {
      setOtpCountdown((prev) => prev - 1);
    }, 1000);
    return () => {
      if (otpCountdownRef.current) clearTimeout(otpCountdownRef.current);
    };
  }, [otpCountdown]);

  function getAuthErrorMessage(error: unknown, fallback: string): string {
    const msg = getErrorMessage(error, "");
    const map: Record<string, string> = {
      "Email already registered": "该邮箱已被注册，请直接登录",
      "Invalid or expired verification code": "验证码错误或已过期，请重新获取",
      "Invalid email or password": "邮箱或密码错误",
      "Invalid payload": "请检查输入内容是否正确",
      "Failed to create user": "注册失败，请稍后再试",
      "Failed to hash password": "注册失败，请稍后再试",
      "Verification failed": "验证码验证失败，请稍后再试",
    };
    return map[msg] ?? fallback ?? msg;
  }

  async function requestRegisterCode() {
    if (otpCountdown > 0) return;
    try {
      setActionLoading(true);
      const emailInput = document.querySelector('.auth-panel input[type="text"], .auth-panel input:not([type])') as HTMLInputElement | null;
      const emailValue = emailInput?.value?.trim() ?? "";
      if (!emailValue || !emailValue.includes("@")) {
        message.error("请输入有效邮箱地址");
        return;
      }
      const response = await api.post<{ devCode?: string; emailSent?: boolean }>("/api/auth/send-code", { email: emailValue });
      setDevVerifyCode(response.data.devCode ?? null);
      message.success(response.data.emailSent ? "验证码已发送到邮箱，请查收" : "验证码已生成，请继续注册");
      setOtpCountdown(60);
    } catch (error) {
      message.error(getAuthErrorMessage(error, "获取验证码失败，请稍后再试"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLogin() {
    try {
      setActionLoading(true);
      const inputs = document.querySelectorAll('.auth-panel input') as NodeListOf<HTMLInputElement>;
      const emailValue = inputs[0]?.value?.trim() ?? "";
      const passwordValue = inputs[1]?.value ?? "";
      if (!emailValue || !emailValue.includes("@")) {
        message.error("请输入有效邮箱地址");
        return;
      }
      if (!passwordValue) {
        message.error("请输入密码");
        return;
      }
      const response = await api.post<{ token: string; user: User }>("/api/auth/login", { email: emailValue, password: passwordValue });
      saveToken(response.data.token);
      setToken(response.data.token);
      setUser(response.data.user);
      setDevVerifyCode(null);
      navigate({ page: "home" });
      message.success("已进入 Nintendo GameTime");
    } catch (error) {
      message.error(getAuthErrorMessage(error, "登录失败，请检查邮箱和密码"));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRegister() {
    try {
      setActionLoading(true);
      const inputs = document.querySelectorAll('.auth-panel input') as NodeListOf<HTMLInputElement>;
      const emailValue = inputs[0]?.value?.trim() ?? "";
      const codeValue = inputs[1]?.value?.trim() ?? "";
      const passwordValue = inputs[2]?.value ?? "";
      const confirmPasswordValue = inputs[3]?.value ?? "";
      if (!emailValue || !emailValue.includes("@")) {
        message.error("请输入有效邮箱地址");
        return;
      }
      if (!codeValue) {
        message.error("请输入验证码");
        return;
      }
      if (passwordValue.length < 6) {
        message.error("密码至少需要 6 位字符");
        return;
      }
      if (passwordValue !== confirmPasswordValue) {
        message.error("两次输入的密码不一致，请重新输入");
        return;
      }
      const response = await api.post<{ token: string; user: User }>("/api/auth/register", {
        email: emailValue,
        code: codeValue,
        password: passwordValue
      });
      saveToken(response.data.token);
      setToken(response.data.token);
      setUser(response.data.user);
      setDevVerifyCode(null);
      setOtpCountdown(0);
      navigate({ page: "home" });
      message.success("注册成功，已自动登录");
    } catch (error) {
      message.error(getAuthErrorMessage(error, "注册失败，请稍后再试"));
    } finally {
      setActionLoading(false);
    }
  }

  async function bindNintendo() {
    try {
      setActionLoading(true);
      const values = await bindForm.validateFields();
      const raw = values.sessionToken || "";

      // Extract session_token_code and state from the Nintendo callback URL.
      // The URL looks like: npf71b963c1b7b6d119://auth#session_token_code=eyJ...&state=XXXX.YYYY
      let sessionTokenCode = "";
      let state = "";

      // Try hash fragment (npf71b963c1b7b6d119://auth#session_token_code=...)
      const hashCodeMatch = raw.match(/session_token_code=([^&\s#]+)/);
      if (hashCodeMatch) sessionTokenCode = hashCodeMatch[1];
      const hashStateMatch = raw.match(/[?&#]state=([^&\s#]+)/);
      if (hashStateMatch) state = hashStateMatch[1];

      // Try query params (if pasted as query string)
      if (!sessionTokenCode) {
        const queryCodeMatch = raw.match(/[?&]session_token_code=([^&\s#]+)/);
        if (queryCodeMatch) sessionTokenCode = queryCodeMatch[1];
      }
      if (!state) {
        const queryStateMatch = raw.match(/[?&]state=([^&\s#]+)/);
        if (queryStateMatch) state = queryStateMatch[1];
      }

      if (sessionTokenCode) {
        // New PKCE flow
        await api.post("/api/accounts/nintendo/bind", {
          sessionTokenCode,
          state,
        });
      } else {
        // Fallback: maybe it's a raw session_token
        const stMatch = raw.match(/session_token=([^&\s#]+)/);
        const st = stMatch ? stMatch[1] : raw.trim();
        await api.post("/api/accounts/nintendo/bind", { sessionToken: st });
      }

      message.success("账号已绑定！点击立即同步获取时长数据");
      bindForm.resetFields(["sessionToken"]);
      await loadCurrentView({ page: "account" });
    } catch (error) {
      message.error(getErrorMessage(error, "绑定账号失败"));
    } finally {
      setActionLoading(false);
    }
  }

  async function saveDisplayPreference() {
    try {
      setActionLoading(true);
      const response = await api.put<{ preference: DisplayPreference; fx: FxContext }>("/api/accounts/preferences", {
        marketMode: pendingMarketMode
      });
      setDisplayPreference(response.data.preference);
      setFxContext(response.data.fx);
      message.success(pendingMarketMode === "DOMESTIC" ? "已切换到国内模式" : "已切换到海外模式");
    } catch (error) {
      message.error(getErrorMessage(error, "显示模式保存失败"));
    } finally {
      setActionLoading(false);
    }
  }

  async function runSync() {
    try {
      setActionLoading(true);
      await api.post("/api/sync/run");
      message.success("同步完成");
      await loadCurrentView(view.page === "account" ? { page: "account" } : { page: "home" });
    } catch (error) {
      message.error(getErrorMessage(error, "同步失败"));
    } finally {
      setActionLoading(false);
    }
  }

  async function addToLibrary(externalId: string) {
    try {
      setActionLoading(true);
      console.log("[addToLibrary] requesting:", externalId, "token:", getToken()?.slice(0, 20));
      const response = await api.post<GameDetail>("/api/games/library", { externalId });
      console.log("[addToLibrary] success:", response.data);
      message.success("已加入我的游戏库");
      const currentLibraryView = getLibraryView();
      await fetchOwnedGames({
        limit: view.page === "home" ? HOME_OWNED_GAMES_LIMIT : LIBRARY_OWNED_GAMES_PAGE_SIZE,
        page: view.page === "home" ? 1 : currentLibraryView.ownedPage
      });
      await fetchSummary();
      openGameDetail(response.data.id, view.page === "catalog" ? catalogReturnView : resolveDetailReturnView(view));
    } catch (error) {
      console.error("[addToLibrary] error:", error);
      message.error(getErrorMessage(error, "入库失败"));
    } finally {
      setActionLoading(false);
    }
  }

  async function removeFromLibrary(gameId: string) {
    try {
      setActionLoading(true);
      await api.delete(`/api/games/${gameId}`);
      setRemoveConfirmOpen(false);
      setGameDetail(null);
      const currentLibraryView = getLibraryView();
      const nextOwnedPage = currentLibraryView.ownedPage > 1 && ownedGames.length === 1 ? currentLibraryView.ownedPage - 1 : currentLibraryView.ownedPage;
      await Promise.all([
        fetchOwnedGames({
          limit: LIBRARY_OWNED_GAMES_PAGE_SIZE,
          page: nextOwnedPage
        }),
        fetchSummary()
      ]);
      message.success("已从我的游戏库移出");
      navigate(getLibraryView({ ownedPage: nextOwnedPage }));
    } catch (error) {
      message.error(getErrorMessage(error, "移出游戏库失败"));
    } finally {
      setActionLoading(false);
    }
  }

  async function submitCorrection(gameId: string) {
    try {
      setActionLoading(true);
      const values = await correctionForm.validateFields();
      await api.post("/api/playtime/corrections", {
        gameId,
        type: values.type,
        minutes: Math.round(values.hours * 60),
        reason: values.reason,
        date: values.date ? values.date.format("YYYY-MM-DD") : null
      });
      correctionForm.resetFields(["reason"]);
      message.success("时长修正已保存");
      await loadCurrentView({ page: "game", gameId });
    } catch (error) {
      message.error(getErrorMessage(error, "保存修正失败"));
    } finally {
      setActionLoading(false);
    }
  }

  async function revokeCorrection(gameId: string, correctionId: string) {
    try {
      setActionLoading(true);
      await api.post(`/api/playtime/corrections/${correctionId}/revoke`);
      message.success("修正已撤销");
      await loadCurrentView({ page: "game", gameId });
    } catch (error) {
      message.error(getErrorMessage(error, "撤销修正失败"));
    } finally {
      setActionLoading(false);
    }
  }

  async function rateGame(externalId: string, score: number) {
    try {
      setRatingLoading(true);
      console.log("[rateGame] externalId:", externalId, "score:", score, "token:", getToken()?.slice(0, 20));
      const response = await api.put<{ rating: PlayerRating }>(`/api/catalog/games/${externalId}/rating`, { score });
      console.log("[rateGame] success:", response.data);
      setGameDetail((current) =>
        current && current.externalId === externalId
          ? {
              ...current,
              playerRating: response.data.rating
            }
          : current
      );
      setCatalogDetail((current) =>
        current && current.externalId === externalId
          ? {
              ...current,
              playerRating: response.data.rating
            }
          : current
      );
      message.success("评分已更新");
    } catch (error) {
      console.error("[rateGame] error:", error);
      message.error(getErrorMessage(error, "评分提交失败"));
    } finally {
      setRatingLoading(false);
    }
  }

  function logout() {
    clearToken();
    setToken(null);
    setUser(null);
    setSummary(null);
    setDashboardCharts(null);
    setOwnedGames([]);
    setTopGames([]);
    setCatalogItems([]);
    setCatalogDetail(null);
    setGameDetail(null);
    setAccountInfo(null);
    setSyncStatus(null);
    setOtpCountdown(0);
    if (otpCountdownRef.current) clearTimeout(otpCountdownRef.current);
    setDevVerifyCode(null);
    setAuthView("login");
    loginForm.resetFields();
    registerForm.resetFields();
    setDisplayPreference({ marketMode: "DOMESTIC" });
    setFxContext(DEFAULT_FX_CONTEXT);
    setPendingMarketMode("DOMESTIC");
    navigate({ page: "home" });
  }

  if (!token) {
    return (
      <div className="auth-shell">
        <div className="auth-wall">
          {heroCovers.map((cover, index) => (
            <HeroWallCover key={`${cover}-${index}`} cover={cover} variant="auth" index={index} />
          ))}
        </div>
        <div className="auth-panel">
          <div className="auth-brand">
            <div className="brand-chip auth-brand-chip">NS</div>
            <h2>Nintendo GameTime</h2>
            <p>管理你的 Switch 游戏库与游玩时长</p>
          </div>

          <div className="auth-tabs">
            <button type="button" className={authView === "login" ? "auth-tab-active" : ""} onClick={() => { setAuthView("login"); loginForm.resetFields(); }}>登录</button>
            <button type="button" className={authView === "register" ? "auth-tab-active" : ""} onClick={() => { setAuthView("register"); registerForm.resetFields(); }}>注册</button>
          </div>

          {authView === "login" ? (
            <Form layout="vertical" form={loginForm} initialValues={{ email: "", password: "" }} style={{marginTop: "1.2rem"}}>
              <Form.Item name="email" rules={[{ required: true, type: "email", message: "请输入有效邮箱" }]}>
                <Input placeholder="邮箱地址" size="large" />
              </Form.Item>
              <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
                <Input.Password placeholder="密码" size="large" />
              </Form.Item>
              <Button type="primary" onClick={handleLogin} loading={actionLoading} block size="large">登录</Button>
            </Form>
          ) : (
            <Form layout="vertical" form={registerForm} initialValues={{ email: "", code: "", password: "", confirmPassword: "" }} style={{marginTop: "1.2rem"}}>
              <Form.Item name="email" rules={[{ required: true, type: "email", message: "请输入有效邮箱" }]}>
                <Input placeholder="邮箱地址" size="large" />
              </Form.Item>
              <Form.Item name="code" rules={[{ required: true, message: "请输入验证码" }]}>
                <Input placeholder="6位验证码" size="large" suffix={
                  <Button type="link" size="small" onClick={requestRegisterCode} loading={actionLoading} disabled={otpCountdown > 0} style={{padding:0,height:"auto"}}>
                    {otpCountdown > 0 ? `${otpCountdown}s` : "获取"}
                  </Button>
                } />
              </Form.Item>
              <Form.Item name="password" rules={[{ required: true, min: 6, message: "密码至少6位" }]}>
                <Input.Password placeholder="密码（至少6位）" size="large" />
              </Form.Item>
              <Form.Item name="confirmPassword" rules={[{ required: true, message: "请再次输入密码" }]}>
                <Input.Password placeholder="确认密码" size="large" />
              </Form.Item>
              <Button type="primary" onClick={handleRegister} loading={actionLoading} block size="large">创建账号</Button>
              {devVerifyCode && <Alert type="info" showIcon message={`开发验证码：${devVerifyCode}`} style={{marginTop:"0.75rem"}} />}
            </Form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="hero-wall">
        {heroCovers.map((cover, index) => (
          <HeroWallCover key={`${cover}-${index}`} cover={cover} variant="hero" index={index} />
        ))}
      </div>
      <div className="hero-mask" />

      <header className="topbar">
        <div className="brand-block">
          <div className="brand-chip">NS</div>
          <div>
            <strong>Nintendo GameTime</strong>
          </div>
        </div>

        <nav className="topnav">
          <button
            type="button"
            className={view.page === "home" || view.page === "ranking" ? "topnav-active" : ""}
            onClick={() => navigate({ page: "home" })}
          >
            概览
          </button>
          <button
            type="button"
            className={view.page === "library" ? "topnav-active" : ""}
            onClick={() => navigate(getLibraryView())}
          >
            游戏库
          </button>
        </nav>

        <div className="account-block">
          <AvatarMenu
            nickname={nickname}
            email={user?.email ?? ""}
            avatarUrl={avatarUrl}
            lastSync={formatRelativeTime(summary?.lastSyncAt ?? accountInfo?.lastSyncAt ?? syncStatus?.finishedAt ?? null)}
            onAccount={() => navigate({ page: "account" })}
            onLogout={logout}
          />
        </div>
      </header>

      <main className="page-shell">
        {errorText && <Alert className="page-alert" type="error" showIcon message={errorText} />}
        <Spin spinning={bootLoading || actionLoading}>
          {view.page === "home" && (
            <div className="page-grid">
              <div className="ambient-particles" aria-hidden="true">
                {Array.from({ length: 12 }, (_, i) => (
                  <span key={i} className={`ambient-particle ambient-particle-${i % 3}`} />
                ))}
              </div>
              <section className="panel hero-panel">
                <span className="joy-deco joy-deco-left" aria-hidden="true" />
                <span className="joy-deco joy-deco-right" aria-hidden="true" />
                <span className="eyebrow">概览</span>
                <h1 className="hero-title hero-title-shimmer">
                  <span>Nintendo</span>
                  <span className="hero-title-switch">Switch</span>
                  <span>GameTime</span>
                </h1>
                <p>账号同步负责抓取已有收藏，游戏目录负责手动入库兜底，时长修正统一收口到游戏详情页。</p>
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-card-icon"><IconGamepad /></div>
                    <div className="stat-card-body">
                      <span>已拥有游戏</span>
                      <strong>{summary?.totalGames ?? 0}</strong>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card-icon"><IconClock /></div>
                    <div className="stat-card-body">
                      <span>累计时长</span>
                      <strong>{formatDuration(summary?.totalMinutes ?? 0)}</strong>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card-icon"><IconPrice /></div>
                    <div className="stat-card-body">
                      <span>目录总价</span>
                      <strong>{formatDisplayCurrency(summary?.totalPriceAmount ?? 0, summary?.priceCurrency ?? "USD", marketMode, fxContext)}</strong>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-card-icon"><IconCalendar /></div>
                    <div className="stat-card-body">
                      <span>近 30 天</span>
                      <strong>{formatDuration(summary?.recent30Minutes ?? 0)}</strong>
                    </div>
                  </div>
                </div>
                <div className="row-actions">
                  <Button type="primary" onClick={() => navigate(getLibraryView())}>浏览游戏目录</Button>
                </div>
              </section>

              <section className="panel home-sync-panel">
                <div className="panel-head"><h2>同步状态</h2><Button onClick={runSync}>立即同步</Button></div>
                <div className="status-list">
                  <div><span>最近同步</span><strong>{formatSimpleDate(syncStatus?.finishedAt ?? summary?.lastSyncAt ?? null)}</strong></div>
                  <div><span>同步结果</span><strong>{syncStatus?.status ?? "IDLE"}</strong></div>
                  <div>
                    <span>时长来源</span>
                    <strong>官方 {summary?.dataSource.official ?? 0} / 修正 {summary?.dataSource.corrected ?? 0} / 手动 {summary?.dataSource["manual-only"] ?? 0}</strong>
                  </div>
                </div>
                {syncStatus?.errorSummary && <Alert type="warning" showIcon message={`最近一次同步异常：${syncStatus.errorSummary}`} />}
              </section>

              <section className="panel panel-wide dashboard-panel">
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">时长仪表盘</span>
                    <h2>按游戏查看时长分布</h2>
                  </div>
                  <div className="row-actions">
                    <div className="subtle-note">右侧只展示前 5 名，点击条目可直接进入详情页。</div>
                    <Button onClick={() => navigate({ page: "ranking" })}>展开排行</Button>
                  </div>
                </div>
                {dashboardGames.length > 0 ? (
                  <div className="dashboard-arcade">
                    <div className="dashboard-stage">
                      <div
                        className="dashboard-chart-card dashboard-orbit-card"
                        onMouseMove={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
                          const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
                          e.currentTarget.style.setProperty("--mx", String(x));
                          e.currentTarget.style.setProperty("--my", String(y));
                        }}
                      >
                        <div className="dashboard-orbit-atmosphere" />
                        <div className="dashboard-orbit-glow" />
                        {dashboardDonutOption ? (
                          <ReactECharts
                            option={dashboardDonutOption}
                            className="dashboard-echart dashboard-echart-donut"
                            onEvents={dashboardChartEvents}
                          />
                        ) : (
                          <div className="dashboard-ring" style={{ background: dashboardRing }}>
                            <div className="dashboard-ring-core">
                              <span>累计时长</span>
                              <strong>{formatDuration(dashboardTotalMinutes)}</strong>
                              <em>当前展示 {dashboardGames.length} 款</em>
                            </div>
                          </div>
                        )}
                        <div className="dashboard-core-readout">
                          <span>时长核心</span>
                          <strong>{formatDuration(dashboardTotalMinutes)}</strong>
                          <em>{dashboardCharts?.visualizations?.engine === "r-echarts4r" ? "R 生成图表" : "交互图表"}</em>
                        </div>
                      </div>

                      <div className="dashboard-command-panel">
                        <DashboardFeaturedCover coverUrl={dashboardGames[0].coverUrl} title={getDashboardTitle(dashboardGames[0], marketMode)} playtime={formatDuration(dashboardGames[0].effectivePlaytime.totalMinutes)} />
                        <div className="dashboard-mini-grid dashboard-mini-grid-premium">
                          <div className="dashboard-mini-card">
                            <span>近 30 天</span>
                            <strong>{formatDuration(summary?.recent30Minutes ?? 0)}</strong>
                          </div>
                          <div className="dashboard-mini-card">
                            <span>最近同步</span>
                            <strong>{formatSimpleDate(summary?.lastSyncAt ?? null)}</strong>
                          </div>
                          <div className="dashboard-mini-card">
                            <span>官方来源</span>
                            <strong>{summary?.dataSource.official ?? 0}</strong>
                          </div>
                          <div className="dashboard-mini-card">
                            <span>修正 / 手动</span>
                            <strong>{(summary?.dataSource.corrected ?? 0) + (summary?.dataSource["manual-only"] ?? 0)}</strong>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="dashboard-list dashboard-boss-list">
                      {dashboardGames.map((game, index) => {
                        const minutes = game.effectivePlaytime.totalMinutes;
                        const share = dashboardTotalMinutes > 0 ? Math.round((minutes / dashboardTotalMinutes) * 100) : 0;
                        const width = dashboardMaxMinutes > 0 ? (minutes / dashboardMaxMinutes) * 100 : 0;
                        const color = getPlaytimeColor(index);
                        return (
                          <button
                            key={game.id}
                            type="button"
                            className="dashboard-row boss-card"
                            onClick={() => openGameDetail(game.id)}
                            style={{ "--row-color": color } as CSSProperties}
                          >
                            <img
                              className="boss-card-cover"
                              src={getProxiedImageUrl(game.coverUrl, "hero")}
                              alt=""
                              loading="lazy"
                            />
                            <div className="boss-card-body">
                              <div className="boss-card-meta">
                                <strong>{getDashboardTitle(game, marketMode)}</strong>
                                <span>{formatDuration(minutes)}</span>
                              </div>
                              <div className="boss-card-bar-wrap">
                                <div className="dashboard-bar-track">
                                  <div
                                    className="dashboard-bar-fill"
                                    style={{
                                      width: `${width}%`,
                                      background: `linear-gradient(90deg, ${color}, ${color}cc)`
                                    }}
                                  />
                                </div>
                                <span className="boss-card-pct">{share}%</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                  </div>
                ) : (
                  <div className="empty-block">游戏入库后，这里会用彩色仪表盘展示每款游戏的时长占比。</div>
                )}
              </section>

              <section className="panel panel-wide">
                <div className="panel-head"><h2>我的收藏</h2><Button onClick={() => navigate(getLibraryView())}>查看完整游戏库</Button></div>
                {featuredOwnedGames.length > 0 ? (
                  <div className="card-grid">
                    {featuredOwnedGames.map((game) => (
                      <CoverCard
                        key={game.id}
                        title={getDisplayTitle(game, marketMode)}
                        coverUrl={game.coverUrl}
                        badge={formatDuration(game.effectivePlaytime.totalMinutes)}
                        meta={`${formatSimpleDate(game.ownedAt)} 入库`}
                        onClick={() => openGameDetail(game.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="empty-block">还没有同步到任何游戏。你可以先进入游戏库，从目录里点击封面入库。</div>
                )}
              </section>
            </div>
          )}

          {view.page === "ranking" && (
            <div className="page-grid">
              <section className="panel panel-wide ranking-panel">
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">全库排行</span>
                    <h2>所有入库游戏时长排名</h2>
                  </div>
                  <div className="row-actions">
                    <div className="subtle-note">
                      共 {topGames.length} 款，累计 {formatDuration(rankingTotalMinutes)}
                    </div>
                    <Button onClick={() => navigate({ page: "home" })}>返回概览</Button>
                  </div>
                </div>

                {topGames.length > 0 ? (
                  <div className="ranking-list">
                    {topGames.map((game, index) => {
                      const minutes = game.effectivePlaytime.totalMinutes;
                      const share = rankingTotalMinutes > 0 ? Math.round((minutes / rankingTotalMinutes) * 100) : 0;
                      const width = rankingMaxMinutes > 0 ? (minutes / rankingMaxMinutes) * 100 : 0;
                      const color = getPlaytimeColor(index);

                      return (
                        <button
                          key={game.id}
                          type="button"
                          className="dashboard-row boss-card"
                          onClick={() => openGameDetail(game.id)}
                          style={{ "--row-color": color } as CSSProperties}
                        >
                          <img
                            className="boss-card-cover"
                            src={getProxiedImageUrl(game.coverUrl, "hero")}
                            alt=""
                            loading="lazy"
                          />
                          <div className="boss-card-body">
                            <div className="boss-card-meta">
                              <RankBadge rank={index + 1} />
                              <strong>{getDisplayTitle(game, marketMode)}</strong>
                              <span>{formatDuration(minutes)}</span>
                            </div>
                            <div className="boss-card-bar-wrap">
                              <div className="dashboard-bar-track">
                                <div
                                  className="dashboard-bar-fill"
                                  style={{
                                    width: `${width}%`,
                                    background: `linear-gradient(90deg, ${color}, ${color}cc)`
                                  }}
                                />
                              </div>
                              <span className="boss-card-pct">{share}%</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-block">当前还没有已入库游戏，入库后这里会展示完整的时长排行。</div>
                )}
              </section>
            </div>
          )}

          {view.page === "library" && (
            <div className="page-grid">
              <section className="panel panel-wide">
                <div className="panel-head">
                  <div><span className="eyebrow">我的游戏库</span><h2>已拥有的游戏</h2></div>
                  <div className="subtle-note">
                    共 {summary?.totalGames ?? 0} 款，目录总价 {formatDisplayCurrency(summary?.totalPriceAmount ?? 0, summary?.priceCurrency ?? "USD", marketMode, fxContext)}
                  </div>
                </div>
                {ownedGames.length > 0 ? (
                  <>
                    <div className="card-grid">
                      {ownedGames.map((game) => (
                      <CoverCard
                        key={game.id}
                        title={getDisplayTitle(game, marketMode)}
                        coverUrl={game.coverUrl}
                        badge={formatDuration(game.effectivePlaytime.totalMinutes)}
                        meta={`${formatSourceText(game.effectivePlaytime.source)} / ${formatSimpleDate(game.lastPlayedAt)}`}
                        onClick={() => openGameDetail(game.id)}
                      />
                      ))}
                    </div>
                    {(summary?.totalGames ?? 0) > LIBRARY_OWNED_GAMES_PAGE_SIZE && (
                      <div className="catalog-pagination">
                        <Pagination
                          current={ownedGamesPage}
                          total={summary?.totalGames ?? 0}
                          pageSize={LIBRARY_OWNED_GAMES_PAGE_SIZE}
                          showSizeChanger={false}
                          onChange={(page) => {
                            navigate(getLibraryView({ ownedPage: page }));
                          }}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="empty-block">你的游戏库还是空的，下面的目录可以直接手动入库。</div>
                )}
              </section>

              <section className="panel panel-wide">
                <div className="panel-head">
                  <div><span className="eyebrow">目录浏览</span><h2>任天堂目录素材</h2></div>
                  <div className="search-row">
                    <Input
                      value={catalogQuery}
                      onChange={(event) => setCatalogQuery(event.target.value)}
                      placeholder="搜索 Mario、Zelda、Kirby..."
                      onPressEnter={() => navigate(getLibraryView({ catalogPage: 1, query: catalogQuery }))}
                    />
                    <Button type="primary" onClick={() => navigate(getLibraryView({ catalogPage: 1, query: catalogQuery }))}>搜索</Button>
                  </div>
                </div>
                <div className="catalog-grid">
                  {catalogItems.map((item) => (
                    <CoverCard
                      key={item.externalId}
                      title={getDisplayTitle(item, marketMode)}
                      coverUrl={item.coverUrl}
                      badge={formatDisplayCurrency(item.priceAmount, item.priceCurrency, marketMode, fxContext)}
                      meta={item.isOwned ? "已在我的游戏库" : "点击查看详情后入库"}
                      owned={item.isOwned}
                      onClick={() => openCatalogDetail(item.externalId)}
                    />
                  ))}
                </div>
                {catalogTotalCount > catalogPageSize && (
                  <div className="catalog-pagination">
                    <Pagination
                      current={catalogPage}
                      total={catalogTotalCount}
                      pageSize={catalogPageSize}
                      showSizeChanger={false}
                      onChange={(page) => {
                        navigate(getLibraryView({ catalogPage: page }));
                      }}
                    />
                  </div>
                )}
              </section>
            </div>
          )}

          {view.page === "catalog" && catalogDetail && (
            <div className="page-grid">
              {renderDetailHero({
                eyebrow: "目录详情",
                title: getDisplayTitle(catalogDetail!, marketMode),
                coverUrl: catalogDetail!.coverUrl,
                badge: catalogDetail!.ownedGame ? formatDuration(catalogDetail!.ownedGame!.effectivePlaytime.totalMinutes) : null,
                description:
                  getDisplayDescription(catalogDetail!, marketMode) ?? "该目录条目暂未拉取到完整描述，你仍然可以先查看评分，再决定是否入库。",
                metaItems: [
                  { label: "价格", value: formatDisplayCurrency(catalogDetail!.priceAmount, catalogDetail!.priceCurrency, marketMode, fxContext) },
                  { label: "平台", value: catalogDetail!.platform },
                  { label: "发行日期", value: formatSimpleDate(catalogDetail!.releaseDate) },
                  { label: "发行商", value: catalogDetail!.publisher ?? "待补充" },
                  { label: "收藏状态", value: catalogDetail!.ownedGame ? "已在我的游戏库" : "尚未入库" },
                  { label: "入库时间", value: catalogDetail!.ownedGame ? formatSimpleDate(catalogDetail!.ownedGame!.ownedAt) : "未入库" }
                ],
                criticScore: catalogDetail!.criticScore,
                playerRating: catalogDetail!.playerRating,
                onRate: (score) => {
                  void rateGame(catalogDetail!.externalId, score);
                },
                actions: (
                  <>
                    {catalogDetail!.ownedGame ? (
                      <Button type="primary" onClick={() => openGameDetail(catalogDetail!.ownedGame!.id, catalogReturnView)}>
                        查看我的记录
                      </Button>
                    ) : (
                      <Button type="primary" onClick={() => addToLibrary(catalogDetail!.externalId)}>
                        加入我的游戏库
                      </Button>
                    )}
                    <a className="link-button" href={catalogDetail!.storeUrl} target="_blank" rel="noreferrer">打开商店页</a>
                    <Button onClick={goBackFromCatalogDetail}>返回上一级</Button>
                  </>
                )
              })}
              <RegionalPriceChart
                prices={regionalPrices?.prices ?? null}
                loading={regionalPricesLoading}
                cheapestRegion={regionalPrices?.cheapestRegion ?? null}
                fxContext={fxContext}
                priceMapHtml={priceMapHtml}
              />
            </div>
          )}

          {false && view.page === "catalog" && catalogDetail && (
            <div className="page-grid">
              <section className="panel panel-wide detail-hero">
                <div className="detail-cover" style={{ backgroundImage: toBackgroundImage(catalogDetail!.coverUrl, "detail") }} />
                <div className="detail-copy">
                  <span className="eyebrow">目录详情</span>
                  <h1>{getDisplayTitle(catalogDetail!, marketMode)}</h1>
                  <div className="detail-meta-grid">
                    <span>价格：{formatDisplayCurrency(catalogDetail!.priceAmount, catalogDetail!.priceCurrency, marketMode, fxContext)}</span>
                    <span>平台：{catalogDetail!.platform}</span>
                    <span>发行：{formatSimpleDate(catalogDetail!.releaseDate)}</span>
                    <span>发行商：{catalogDetail!.publisher ?? "待补充"}</span>
                  </div>
                  <p>{getDisplayDescription(catalogDetail!, marketMode) ?? "该目录条目暂未拉到详情描述。你仍然可以先入库。"}</p>
                  <div className="row-actions">
                    {catalogDetail!.ownedGame ? (
                      <Button type="primary" onClick={() => openGameDetail(catalogDetail!.ownedGame!.id, catalogReturnView)}>查看我的记录</Button>
                    ) : (
                      <Button type="primary" onClick={() => addToLibrary(catalogDetail!.externalId)}>加入我的游戏库</Button>
                    )}
                    <a className="link-button" href={catalogDetail!.storeUrl} target="_blank" rel="noreferrer">打开商店页</a>
                    <Button onClick={() => navigate(getLibraryView())}>返回游戏库</Button>
                  </div>
                </div>
              </section>
            </div>
          )}

          {view.page === "game" && gameDetail && (
            <div className="page-grid">
              {renderDetailHero({
                eyebrow: "游戏详情",
                title: getDisplayTitle(gameDetail!, marketMode),
                coverUrl: gameDetail!.coverUrl,
                badge: formatDuration(gameDetail!.effectivePlaytime.totalMinutes),
                description:
                  getDisplayDescription(gameDetail!, marketMode) ?? "当前没有同步到商店描述。你仍然可以在这里管理评分和时长修正。",
                metaItems: [
                  { label: "价格", value: formatDisplayCurrency(gameDetail!.priceAmount, gameDetail!.priceCurrency, marketMode, fxContext) },
                  { label: "已入库", value: formatSimpleDate(gameDetail!.ownedAt) },
                  { label: "最近游玩", value: formatSimpleDate(gameDetail!.lastPlayedAt) },
                  { label: "时长来源", value: formatSourceText(gameDetail!.effectivePlaytime.source) },
                  { label: "平台", value: gameDetail!.platform },
                  { label: "发行日期", value: formatSimpleDate(gameDetail!.releaseDate) },
                  { label: "发行商", value: gameDetail!.publisher ?? "待补充" }
                ],
                criticScore: gameDetail!.criticScore,
                playerRating: gameDetail!.playerRating,
                onRate: (score) => {
                  void rateGame(gameDetail!.externalId, score);
                },
                actions: (
                  <>
                    {gameDetail!.storeUrl && <a className="link-button" href={gameDetail!.storeUrl ?? undefined} target="_blank" rel="noreferrer">打开商店页</a>}
                    <Popconfirm
                      placement="bottomLeft"
                      overlayClassName="game-remove-popconfirm"
                      onOpenChange={setRemoveConfirmOpen}
                      title="移出我的游戏库？"
                      description="移出后会从当前游戏库消失；如果后续账号同步再次识别到它，仍可能重新加入。"
                      okText="确认移出"
                      cancelText="取消"
                      okButtonProps={{ danger: true, className: "game-remove-popconfirm-ok" }}
                      cancelButtonProps={{ className: "game-remove-popconfirm-cancel" }}
                      onConfirm={() => removeFromLibrary(gameDetail!.id)}
                    >
                      <Button danger className={removeConfirmOpen ? "remove-trigger-active" : undefined}>
                        {removeConfirmOpen ? "确认移出" : "移出游戏库"}
                      </Button>
                    </Popconfirm>
                    <Button onClick={goBackFromGameDetail}>返回上一级</Button>
                  </>
                )
              })}
              <RegionalPriceChart
                prices={regionalPrices?.prices ?? null}
                loading={regionalPricesLoading}
                cheapestRegion={regionalPrices?.cheapestRegion ?? null}
                fxContext={fxContext}
                priceMapHtml={priceMapHtml}
              />
              {false && (
              <section className="panel panel-wide detail-hero">
                <div className="detail-cover" style={{ backgroundImage: toBackgroundImage(gameDetail!.coverUrl, "detail") }}>
                  <span className="cover-card-badge">{formatDuration(gameDetail!.effectivePlaytime.totalMinutes)}</span>
                </div>
                <div className="detail-copy">
                  <span className="eyebrow">游戏详情</span>
                  <h1>{getDisplayTitle(gameDetail!, marketMode)}</h1>
                  <div className="detail-meta-grid">
                    <span>价格：{formatDisplayCurrency(gameDetail!.priceAmount, gameDetail!.priceCurrency, marketMode, fxContext)}</span>
                    <span>已入库：{formatSimpleDate(gameDetail!.ownedAt)}</span>
                    <span>最近游玩：{formatSimpleDate(gameDetail!.lastPlayedAt)}</span>
                    <span>时长来源：{formatSourceText(gameDetail!.effectivePlaytime.source)}</span>
                    <span>平台：{gameDetail!.platform}</span>
                    <span>发行：{formatSimpleDate(gameDetail!.releaseDate)}</span>
                    <span>发行商：{gameDetail!.publisher ?? "待补充"}</span>
                  </div>
                  <div className="detail-score-grid">
                    <div className="detail-score-card">
                      <span>Meta 评分</span>
                      <strong>{gameCriticScore === null ? "待补充" : `${gameCriticScore}/100`}</strong>
                      <em>{gameCriticScore === null ? "当前没有收录到该作品的媒体分" : "使用作品级 Metascore 作为参考"}</em>
                    </div>
                    <div className="detail-score-card">
                      <span>玩家平均分</span>
                      <strong>{gamePlayerRating.averageScore === null ? "--" : `${formatScore(gamePlayerRating.averageScore)} / 5`}</strong>
                      <em>{gamePlayerRating.ratingCount > 0 ? `${gamePlayerRating.ratingCount} 位玩家已评分` : "还没有玩家评分"}</em>
                    </div>
                    <div className="detail-score-card detail-score-card-interactive">
                      <span>我的评分</span>
                      <Rate
                        value={gamePlayerRating.userScore ?? 0}
                        count={5}
                        disabled={ratingLoading}
                        onChange={(value) => {
                          if (value > 0) {
                            void rateGame(gameDetail!.id, value);
                          }
                        }}
                      />
                      <em>评分结果会实时并入全站平均分</em>
                    </div>
                  </div>
                  <p>{getDisplayDescription(gameDetail!, marketMode) ?? "当前没有同步到商店描述。你仍然可以在这里管理时长修正。"}</p>
                  <div className="row-actions">
                    {gameDetail!.storeUrl && <a className="link-button" href={gameDetail!.storeUrl ?? undefined} target="_blank" rel="noreferrer">打开商店页</a>}
                    <Popconfirm
                      placement="bottomLeft"
                      overlayClassName="game-remove-popconfirm"
                      onOpenChange={setRemoveConfirmOpen}
                      title="移出我的游戏库？"
                      description="移出后会从当前游戏库消失；如果后续账号同步再次识别到它，仍可能重新加入。"
                      okText="确认移出"
                      cancelText="取消"
                      okButtonProps={{ danger: true, className: "game-remove-popconfirm-ok" }}
                      cancelButtonProps={{ className: "game-remove-popconfirm-cancel" }}
                      onConfirm={() => removeFromLibrary(gameDetail!.id)}
                    >
                      <Button danger className={removeConfirmOpen ? "remove-trigger-active" : undefined}>
                        {removeConfirmOpen ? "确认移出" : "移出游戏库"}
                      </Button>
                    </Popconfirm>
                    <Button onClick={() => navigate(getLibraryView())}>返回游戏库</Button>
                  </div>
                </div>
              </section>
              )}

              <section className="panel">
                <div className="panel-head"><div><span className="eyebrow">时长修正</span><h2>在详情页里直接修正</h2></div></div>
                <Form
                  layout="vertical"
                  form={correctionForm}
                  initialValues={{ type: "ADD_DELTA" as const, hours: 0.5, reason: "", date: dayjs() }}
                  onFinish={() => submitCorrection(gameDetail!.id)}
                >
                  <Form.Item name="date" label="游玩日期" rules={[{ required: true, message: "请选择日期" }]}>
                    <DatePicker style={{ width: "100%" }} />
                  </Form.Item>
                  <div className="form-split">
                    <Form.Item name="type" label="修正方式" rules={[{ required: true, message: "请选择修正方式" }]}>
                      <Select
                        options={[
                          { value: "SET_TOTAL", label: "SET_TOTAL 设定总时长" },
                          { value: "ADD_DELTA", label: "ADD_DELTA 增减时长" }
                        ]}
                      />
                    </Form.Item>
                    <Form.Item name="hours" label="小时数" rules={[{ required: true, message: "请输入小时数" }]}>
                      <InputNumber style={{ width: "100%" }} step={0.1} precision={1} />
                    </Form.Item>
                  </div>
                  <Form.Item name="reason" label="修正说明" rules={[{ required: true, min: 2, message: "请填写修正说明" }]}>
                    <Input.TextArea rows={4} placeholder="例如：同步漏掉了本周游玩时长，手动补录。" />
                  </Form.Item>
                  <Button htmlType="submit" type="primary" block>保存修正</Button>
                </Form>
              </section>

              <section className="panel">
                <div className="panel-head"><div><span className="eyebrow">修正记录</span><h2>当前游戏的时长历史</h2></div></div>
                {gameDetail!.corrections.length > 0 ? (
                  <div className="stack-list">
                    {Array.from(
                      gameDetail!.corrections.reduce((map, item) => {
                        const dateKey = item.date || item.createdAt.slice(0, 10);
                        const group = map.get(dateKey) || [];
                        group.push(item);
                        map.set(dateKey, group);
                        return map;
                      }, new Map<string, CorrectionItem[]>()).entries()
                    )
                      .sort(([a], [b]) => b.localeCompare(a))
                      .map(([dateKey, items]) => (
                        <div key={dateKey} style={{ marginBottom: 16 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#726459", marginBottom: 6, borderBottom: "1px solid rgba(49,36,22,0.12)", paddingBottom: 4 }}>
                            {dateKey}
                          </div>
                          {items.map((item) => (
                            <div key={item.id} className="stack-item">
                              <div>
                                <strong>{item.type === "SET_TOTAL" ? "设定总时长" : "增减时长"}</strong>
                                <p>{item.reason}</p>
                                <span>{formatDuration(item.minutes)}</span>
                              </div>
                              {!item.revokedAt ? (
                                <Button onClick={() => revokeCorrection(gameDetail!.id, item.id)}>撤销</Button>
                              ) : (
                                <span className="subtle-note">已撤销</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                  </div>
                ) : (
                  <div className="empty-block">这款游戏还没有时长修正记录。</div>
                )}
              </section>
            </div>
          )}

          {view.page === "account" && (
            <div className="page-grid account-page">
              {/* ── Profile hero ── */}
              <section className="panel panel-wide account-hero">
                <label className="account-avatar-upload" title="点击更换头像">
                  <input type="file" accept="image/*" style={{display:"none"}} onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const url = reader.result as string;
                      setAvatarUrl(url);
                      try { localStorage.setItem("nintendo_avatar", url); } catch {}
                    };
                    reader.readAsDataURL(file);
                  }} />
                  {avatarUrl ? (
                    <img className="account-avatar-img" src={avatarUrl} alt="" />
                  ) : (
                    <span className="avatar-chip avatar-chip-xl">{nickname.charAt(0).toUpperCase()}</span>
                  )}
                  <span className="account-avatar-hint">点击更换</span>
                </label>
                <div className="account-hero-info">
                  <h1>{nickname}</h1>
                  <p>{user?.email}</p>
                  <div className="account-hero-stats">
                    <span>{summary?.totalGames ?? 0} 款游戏</span>
                    <span className="account-hero-dot" />
                    <span>{formatDuration(summary?.totalMinutes ?? 0)}</span>
                    <span className="account-hero-dot" />
                    <span>同步于 {formatSimpleDate(summary?.lastSyncAt ?? null)}</span>
                  </div>
                </div>
              </section>

              {/* ── Sync + Display row ── */}
              <section className="panel account-panel">
                <div className="account-row">
                  <div className="account-row-item">
                    <h3>Nintendo 同步</h3>
                    <p>{accountInfo ? `已绑定 · ${accountInfo.region}` : "未绑定"}</p>
                    <p className="account-sub">最近同步：{formatSimpleDate(accountInfo?.lastSyncAt ?? syncStatus?.finishedAt ?? null)}</p>
                    {syncStatus?.errorSummary && <Alert type="warning" showIcon message={syncStatus.errorSummary} style={{marginTop:"0.5rem"}} />}
                    <div style={{marginTop:"0.75rem"}}><Button size="small" onClick={runSync}>立即同步</Button></div>
                  </div>
                  <div className="account-row-divider" />
                  <div className="account-row-item">
                    <h3>显示模式</h3>
                    <p>{marketMode === "DOMESTIC" ? "国内模式 · 中文 · 人民币" : "海外模式 · 英文 · 原币种"}</p>
                    <p className="account-sub">汇率日期：{fxContext?.asOf ?? "—"}</p>
                    <div style={{marginTop:"0.75rem", display:"flex", gap:"0.5rem"}}>
                      <Select size="small" value={pendingMarketMode} onChange={(v) => setPendingMarketMode(v)}
                        options={[{ value: "DOMESTIC", label: "国内" }, { value: "GLOBAL", label: "海外" }]} style={{width:90}} />
                      <Button size="small" type="primary" onClick={saveDisplayPreference}>保存</Button>
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Token bind ── */}
              <section className="panel account-panel">
                <h3>绑定 Nintendo 账号</h3>
                <p className="account-sub" style={{marginBottom:"0.75rem"}}>
                  点击下方按钮跳转 Nintendo 官网登录。登录成功后浏览器地址栏会出现 <code>npf71b963c1b7b6d119://auth#session_token_code=...</code>，
                  请<strong>复制整段地址</strong>粘贴到下方输入框完成绑定。
                </p>
                <div style={{display:"flex", gap:"0.6rem", alignItems:"center", flexWrap:"wrap", marginBottom:"0.75rem"}}>
                  <Button type="primary" size="large" onClick={() => {
                    window.open("/api/auth/nintendo/login", "_blank");
                  }}>🔗 打开 Nintendo 登录页</Button>
                </div>
                <Form layout="inline" form={bindForm} initialValues={{ sessionToken: "" }} onFinish={bindNintendo}>
                  <Form.Item name="sessionToken" rules={[{ required: true, message: "请粘贴 Nintendo 登录成功后的回调地址" }]}>
                    <Input placeholder="粘贴 npf71b963c1b7b6d119://auth#session_token_code=... 整段地址" style={{width: 420}} />
                  </Form.Item>
                  <Form.Item>
                    <Button htmlType="submit" type="primary">绑定</Button>
                  </Form.Item>
                </Form>
                <p className="account-sub" style={{marginTop:"0.5rem", fontSize:"0.78rem"}}>
                  💡 登录成功后会跳转到一个报错页面（打不开 npf71b963c1b7b6d119:// 协议），这时<strong>复制浏览器地址栏中完整 URL</strong>（包含 session_token_code= 和 state=），直接粘贴即可。
                </p>
              </section>
            </div>
          )}
        </Spin>
      </main>
    </div>
  );
}
