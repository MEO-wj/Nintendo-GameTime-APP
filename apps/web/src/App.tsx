import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Form, Input, InputNumber, Popconfirm, Select, Spin, message } from "antd";
import { api, clearToken, getToken, saveToken } from "./api";
import "./App.css";

type CorrectionType = "SET_TOTAL" | "ADD_DELTA";
type PlaytimeSource = "official" | "corrected" | "manual-only";
type View =
  | { page: "home" }
  | { page: "library" }
  | { page: "game"; gameId: string }
  | { page: "catalog"; externalId: string }
  | { page: "account" };

interface User {
  id: string;
  email: string;
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

interface EffectivePlaytime {
  totalMinutes: number;
  source: PlaytimeSource;
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
}

interface CorrectionItem {
  id: string;
  gameId: string;
  type: CorrectionType;
  minutes: number;
  reason: string;
  createdAt: string;
  revokedAt: string | null;
}

interface GameDetail extends OwnedGame {
  description: string | null;
  publisher: string | null;
  releaseDate: string | null;
  storeUrl: string | null;
  platform: "Switch";
  region: "JP" | "GLOBAL" | "UNKNOWN";
  corrections: CorrectionItem[];
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
  isOwned: boolean;
  ownedGameId: string | null;
  ownedAt: string | null;
}

interface CatalogDetail extends Omit<CatalogItem, "isOwned" | "ownedGameId" | "ownedAt"> {
  ownedGame: (OwnedGame & { priceAmount: number | null; priceCurrency: string }) | null;
  corrections: CorrectionItem[];
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

const FALLBACK_COVERS = [
  "https://images.igdb.com/igdb/image/upload/t_cover_big/co1r7h.jpg",
  "https://images.igdb.com/igdb/image/upload/t_cover_big/co1mxf.jpg",
  "https://images.igdb.com/igdb/image/upload/t_cover_big/co1q7d.jpg",
  "https://images.igdb.com/igdb/image/upload/t_cover_big/co2lb5.jpg",
  "https://images.igdb.com/igdb/image/upload/t_cover_big/co5vmg.jpg",
  "https://images.igdb.com/igdb/image/upload/t_cover_big/co6j0z.jpg"
];

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

function parseHash(): View {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean);
  if (parts[0] === "library") return { page: "library" };
  if (parts[0] === "account") return { page: "account" };
  if (parts[0] === "game" && parts[1]) return { page: "game", gameId: decodeURIComponent(parts[1]) };
  if (parts[0] === "catalog" && parts[1]) return { page: "catalog", externalId: decodeURIComponent(parts[1]) };
  return { page: "home" };
}

function toHash(view: View): string {
  if (view.page === "game") return `#/game/${encodeURIComponent(view.gameId)}`;
  if (view.page === "catalog") return `#/catalog/${encodeURIComponent(view.externalId)}`;
  return view.page === "home" ? "#/" : `#/${view.page}`;
}

function CoverCard(input: {
  title: string;
  coverUrl: string | null;
  badge?: string;
  meta?: string;
  owned?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="cover-card" onClick={input.onClick}>
      <div
        className="cover-card-media"
        style={{ backgroundImage: `url(${input.coverUrl ?? FALLBACK_COVERS[0]})` }}
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

export default function App() {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<User | null>(() => parseStoredUser());
  const [view, setView] = useState<View>(() => parseHash());
  const [bootLoading, setBootLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [ownedGames, setOwnedGames] = useState<OwnedGame[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [catalogNextCursor, setCatalogNextCursor] = useState<string | null>(null);
  const [catalogDetail, setCatalogDetail] = useState<CatalogDetail | null>(null);
  const [gameDetail, setGameDetail] = useState<GameDetail | null>(null);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [otpDevCode, setOtpDevCode] = useState<string | null>(null);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [authForm] = Form.useForm<{ email: string; code?: string }>();
  const [bindForm] = Form.useForm<{ sessionToken: string; region: "JP" | "GLOBAL" | "UNKNOWN" }>();
  const [correctionForm] = Form.useForm<{ type: CorrectionType; hours: number; reason: string }>();
  const nickname = getNickname(user?.email);
  const heroCovers = useMemo(() => {
    const dynamic = [...ownedGames.map((item) => item.coverUrl), ...catalogItems.map((item) => item.coverUrl)].filter(
      (entry): entry is string => Boolean(entry)
    );
    return [...dynamic, ...FALLBACK_COVERS].slice(0, 6);
  }, [catalogItems, ownedGames]);

  function navigate(nextView: View) {
    const hash = toHash(nextView);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
      return;
    }
    setView(nextView);
  }

  async function fetchOwnedGames(limit = 18) {
    const response = await api.get<{ items: OwnedGame[] }>("/api/games", { params: { tab: "owned", limit } });
    setOwnedGames(response.data.items);
  }

  async function fetchSummary() {
    const response = await api.get<DashboardSummary>("/api/dashboard/summary");
    setSummary(response.data);
  }

  async function fetchSyncStatus() {
    const response = await api.get<{ status: SyncStatus | null }>("/api/sync/status");
    setSyncStatus(response.data.status);
  }

  async function fetchCatalogPage(input?: { query?: string; cursor?: string; append?: boolean }) {
    const response = await api.get<{ items: CatalogItem[]; nextCursor: string | null }>("/api/catalog/games", {
      params: { q: input?.query ?? catalogQuery, cursor: input?.cursor, limit: 12 }
    });
    setCatalogItems((prev) => (input?.append ? [...prev, ...response.data.items] : response.data.items));
    setCatalogNextCursor(response.data.nextCursor);
  }

  async function loadCurrentView(nextView: View = view) {
    setBootLoading(true);
    setErrorText(null);
    try {
      if (nextView.page === "home") {
        await Promise.all([fetchSummary(), fetchOwnedGames(8), fetchSyncStatus()]);
        setGameDetail(null);
        setCatalogDetail(null);
      } else if (nextView.page === "library") {
        await Promise.all([fetchSummary(), fetchOwnedGames(), fetchCatalogPage({ query: catalogQuery })]);
        setGameDetail(null);
        setCatalogDetail(null);
      } else if (nextView.page === "game") {
        const response = await api.get<GameDetail>(`/api/games/${nextView.gameId}`);
        setGameDetail(response.data);
        setCatalogDetail(null);
      } else if (nextView.page === "catalog") {
        const response = await api.get<CatalogDetail>(`/api/catalog/games/${nextView.externalId}`);
        setCatalogDetail(response.data);
        setGameDetail(null);
      } else {
        const [accountResponse] = await Promise.all([
          api.get<{ account: AccountInfo | null }>("/api/accounts/nintendo"),
          fetchSyncStatus()
        ]);
        setAccountInfo(accountResponse.data.account);
        setGameDetail(null);
        setCatalogDetail(null);
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
    setRemoveConfirmOpen(false);
  }, [view, gameDetail?.id]);

  async function requestOtp() {
    try {
      setActionLoading(true);
      const payload = await authForm.validateFields(["email"]);
      const response = await api.post<{ devCode?: string }>("/api/auth/login", { email: payload.email });
      setOtpDevCode(response.data.devCode ?? null);
      message.success("验证码已生成，请继续登录");
    } catch (error) {
      message.error(getErrorMessage(error, "获取验证码失败"));
    } finally {
      setActionLoading(false);
    }
  }

  async function login() {
    try {
      setActionLoading(true);
      const values = await authForm.validateFields();
      const response = await api.post<{ token: string; user: User }>("/api/auth/login", values);
      saveToken(response.data.token);
      setToken(response.data.token);
      setUser(response.data.user);
      setOtpDevCode(null);
      navigate({ page: "home" });
      message.success("已进入 Nintendo GameTime");
    } catch (error) {
      message.error(getErrorMessage(error, "登录失败"));
    } finally {
      setActionLoading(false);
    }
  }

  async function bindNintendo() {
    try {
      setActionLoading(true);
      const values = await bindForm.validateFields();
      await api.post("/api/accounts/nintendo/bind", values);
      message.success("账号已绑定，并已触发同步");
      bindForm.resetFields(["sessionToken"]);
      await loadCurrentView({ page: "account" });
    } catch (error) {
      message.error(getErrorMessage(error, "绑定账号失败"));
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
      const response = await api.post<GameDetail>("/api/games/library", { externalId });
      message.success("已加入我的游戏库");
      await fetchOwnedGames();
      await fetchSummary();
      navigate({ page: "game", gameId: response.data.id });
    } catch (error) {
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
      await Promise.all([fetchOwnedGames(), fetchSummary()]);
      message.success("已从我的游戏库移出");
      navigate({ page: "library" });
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
        reason: values.reason
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

  function logout() {
    clearToken();
    setToken(null);
    setUser(null);
    setSummary(null);
    setOwnedGames([]);
    setCatalogItems([]);
    setCatalogDetail(null);
    setGameDetail(null);
    setAccountInfo(null);
    setSyncStatus(null);
    setOtpDevCode(null);
    navigate({ page: "home" });
  }

  if (!token) {
    return (
      <div className="auth-shell">
        <div className="auth-wall">
          {heroCovers.map((cover, index) => (
            <div
              key={`${cover}-${index}`}
              className="auth-wall-cover"
              style={{ backgroundImage: `url(${cover})` }}
            />
          ))}
        </div>
        <div className="auth-panel">
          <span className="eyebrow">Nintendo GameTime</span>
          <h1>同步收藏，手动补库，详情里修正时长。</h1>
          <p>登录后可以浏览游戏目录、点击封面入库，并在游戏详情页里统一处理时长修正。</p>
          <Form layout="vertical" form={authForm} initialValues={{ email: "", code: "" }}>
            <Form.Item
              name="email"
              label="邮箱"
              rules={[{ required: true, type: "email", message: "请输入有效邮箱" }]}
            >
              <Input placeholder="you@example.com" />
            </Form.Item>
            <Form.Item name="code" label="验证码">
              <Input placeholder="开发环境可直接输入 000000" />
            </Form.Item>
            <div className="row-actions">
              <Button onClick={requestOtp} loading={actionLoading}>
                获取验证码
              </Button>
              <Button type="primary" onClick={login} loading={actionLoading}>
                进入应用
              </Button>
            </div>
          </Form>
          {otpDevCode && <Alert type="info" showIcon message={`当前开发验证码：${otpDevCode}`} />}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="hero-wall">
        {heroCovers.map((cover, index) => (
          <div
            key={`${cover}-${index}`}
            className="hero-wall-cover"
            style={{ backgroundImage: `url(${cover})` }}
          />
        ))}
      </div>
      <div className="hero-mask" />

      <header className="topbar">
        <div className="brand-block">
          <div className="brand-chip">NS</div>
          <div>
            <strong>Nintendo GameTime</strong>
            <span>目录入库 + 同步收藏 + 详情页修正</span>
          </div>
        </div>

        <nav className="topnav">
          <button type="button" className={view.page === "home" ? "topnav-active" : ""} onClick={() => navigate({ page: "home" })}>
            概览
          </button>
          <button
            type="button"
            className={view.page === "library" ? "topnav-active" : ""}
            onClick={() => navigate({ page: "library" })}
          >
            游戏库
          </button>
          <button
            type="button"
            className={view.page === "account" ? "topnav-active" : ""}
            onClick={() => navigate({ page: "account" })}
          >
            账号同步
          </button>
        </nav>

        <div className="account-block">
          <div className="account-meta">
            <strong>{nickname}</strong>
            <span>{formatRelativeTime(summary?.lastSyncAt ?? syncStatus?.finishedAt ?? null)}</span>
          </div>
          <Button onClick={() => navigate({ page: "account" })}>绑定账号</Button>
          <Button onClick={logout}>退出</Button>
        </div>
      </header>

      <main className="page-shell">
        {errorText && <Alert className="page-alert" type="error" showIcon message={errorText} />}
        <Spin spinning={bootLoading || actionLoading}>
          {view.page === "home" && (
            <div className="page-grid">
              <section className="panel hero-panel">
                <span className="eyebrow">概览</span>
                <h1>让缺失的游戏和时长，都回到同一个收藏视图里。</h1>
                <p>账号同步负责抓取已有收藏，游戏目录负责手动入库兜底，时长修正统一收口到游戏详情页。</p>
                <div className="stats-grid">
                  <div className="stat-card"><span>已拥有游戏</span><strong>{summary?.totalGames ?? 0}</strong></div>
                  <div className="stat-card"><span>累计时长</span><strong>{formatDuration(summary?.totalMinutes ?? 0)}</strong></div>
                  <div className="stat-card"><span>目录总价</span><strong>{formatCurrency(summary?.totalPriceAmount ?? 0, summary?.priceCurrency ?? "USD")}</strong></div>
                  <div className="stat-card"><span>近 30 天</span><strong>{formatDuration(summary?.recent30Minutes ?? 0)}</strong></div>
                </div>
                <div className="row-actions">
                  <Button type="primary" onClick={() => navigate({ page: "library" })}>浏览游戏目录</Button>
                  <Button onClick={() => navigate({ page: "account" })}>前往账号同步</Button>
                </div>
              </section>

              <section className="panel">
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

              <section className="panel panel-wide">
                <div className="panel-head"><h2>我的收藏</h2><Button onClick={() => navigate({ page: "library" })}>查看完整游戏库</Button></div>
                {ownedGames.length > 0 ? (
                  <div className="card-grid">
                    {ownedGames.map((game) => (
                      <CoverCard
                        key={game.id}
                        title={game.title}
                        coverUrl={game.coverUrl}
                        badge={formatDuration(game.effectivePlaytime.totalMinutes)}
                        meta={`${formatSimpleDate(game.ownedAt)} 入库`}
                        onClick={() => navigate({ page: "game", gameId: game.id })}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="empty-block">还没有同步到任何游戏。你可以先进入游戏库，从目录里点击封面入库。</div>
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
                    共 {summary?.totalGames ?? 0} 款，目录总价 {formatCurrency(summary?.totalPriceAmount ?? 0, summary?.priceCurrency ?? "USD")}
                  </div>
                </div>
                {ownedGames.length > 0 ? (
                  <div className="card-grid">
                    {ownedGames.map((game) => (
                      <CoverCard
                        key={game.id}
                        title={game.title}
                        coverUrl={game.coverUrl}
                        badge={formatDuration(game.effectivePlaytime.totalMinutes)}
                        meta={`${formatSourceText(game.effectivePlaytime.source)} / ${formatSimpleDate(game.lastPlayedAt)}`}
                        onClick={() => navigate({ page: "game", gameId: game.id })}
                      />
                    ))}
                  </div>
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
                      onPressEnter={() => loadCurrentView({ page: "library" })}
                    />
                    <Button type="primary" onClick={() => loadCurrentView({ page: "library" })}>搜索</Button>
                  </div>
                </div>
                <div className="card-grid">
                  {catalogItems.map((item) => (
                    <CoverCard
                      key={item.externalId}
                      title={item.title}
                      coverUrl={item.coverUrl}
                      badge={formatCurrency(item.priceAmount, item.priceCurrency)}
                      meta={item.isOwned ? "已在我的游戏库" : "点击查看详情后入库"}
                      owned={item.isOwned}
                      onClick={() => navigate({ page: "catalog", externalId: item.externalId })}
                    />
                  ))}
                </div>
                {catalogNextCursor && (
                  <div className="load-more-row">
                    <Button
                      onClick={() =>
                        fetchCatalogPage({ query: catalogQuery, cursor: catalogNextCursor, append: true }).catch(() => undefined)
                      }
                    >
                      加载更多
                    </Button>
                  </div>
                )}
              </section>
            </div>
          )}

          {view.page === "catalog" && catalogDetail && (
            <div className="page-grid">
              <section className="panel panel-wide detail-hero">
                <div className="detail-cover" style={{ backgroundImage: `url(${catalogDetail.coverUrl ?? FALLBACK_COVERS[0]})` }} />
                <div className="detail-copy">
                  <span className="eyebrow">目录详情</span>
                  <h1>{catalogDetail.title}</h1>
                  <div className="detail-meta-grid">
                    <span>价格：{formatCurrency(catalogDetail.priceAmount, catalogDetail.priceCurrency)}</span>
                    <span>平台：{catalogDetail.platform}</span>
                    <span>发行：{formatSimpleDate(catalogDetail.releaseDate)}</span>
                    <span>发行商：{catalogDetail.publisher ?? "待补充"}</span>
                  </div>
                  <p>{catalogDetail.description ?? "该目录条目暂未拉到详情描述。你仍然可以先入库。"}</p>
                  <div className="row-actions">
                    {catalogDetail.ownedGame ? (
                      <Button type="primary" onClick={() => navigate({ page: "game", gameId: catalogDetail.ownedGame!.id })}>查看我的记录</Button>
                    ) : (
                      <Button type="primary" onClick={() => addToLibrary(catalogDetail.externalId)}>加入我的游戏库</Button>
                    )}
                    <a className="link-button" href={catalogDetail.storeUrl} target="_blank" rel="noreferrer">打开商店页</a>
                    <Button onClick={() => navigate({ page: "library" })}>返回游戏库</Button>
                  </div>
                </div>
              </section>
            </div>
          )}

          {view.page === "game" && gameDetail && (
            <div className="page-grid">
              <section className="panel panel-wide detail-hero">
                <div className="detail-cover" style={{ backgroundImage: `url(${gameDetail.coverUrl ?? FALLBACK_COVERS[0]})` }}>
                  <span className="cover-card-badge">{formatDuration(gameDetail.effectivePlaytime.totalMinutes)}</span>
                </div>
                <div className="detail-copy">
                  <span className="eyebrow">游戏详情</span>
                  <h1>{gameDetail.title}</h1>
                  <div className="detail-meta-grid">
                    <span>价格：{formatCurrency(gameDetail.priceAmount, gameDetail.priceCurrency)}</span>
                    <span>已入库：{formatSimpleDate(gameDetail.ownedAt)}</span>
                    <span>最近游玩：{formatSimpleDate(gameDetail.lastPlayedAt)}</span>
                    <span>时长来源：{formatSourceText(gameDetail.effectivePlaytime.source)}</span>
                  </div>
                  <p>{gameDetail.description ?? "当前没有同步到商店描述。你仍然可以在这里管理时长修正。"}</p>
                  <div className="row-actions">
                    {gameDetail.storeUrl && <a className="link-button" href={gameDetail.storeUrl} target="_blank" rel="noreferrer">打开商店页</a>}
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
                      onConfirm={() => removeFromLibrary(gameDetail.id)}
                    >
                      <Button danger className={removeConfirmOpen ? "remove-trigger-active" : undefined}>
                        {removeConfirmOpen ? "确认移出" : "移出游戏库"}
                      </Button>
                    </Popconfirm>
                    <Button onClick={() => navigate({ page: "library" })}>返回游戏库</Button>
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel-head"><div><span className="eyebrow">时长修正</span><h2>在详情页里直接修正</h2></div></div>
                <Form
                  layout="vertical"
                  form={correctionForm}
                  initialValues={{ type: "ADD_DELTA" as const, hours: 0.5, reason: "" }}
                  onFinish={() => submitCorrection(gameDetail.id)}
                >
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
                {gameDetail.corrections.length > 0 ? (
                  <div className="stack-list">
                    {gameDetail.corrections.map((item) => (
                      <div key={item.id} className="stack-item">
                        <div>
                          <strong>{item.type === "SET_TOTAL" ? "设定总时长" : "增减时长"}</strong>
                          <p>{item.reason}</p>
                          <span>{formatSimpleDate(item.createdAt)} / {formatDuration(item.minutes)}</span>
                        </div>
                        {!item.revokedAt ? (
                          <Button onClick={() => revokeCorrection(gameDetail.id, item.id)}>撤销</Button>
                        ) : (
                          <span className="subtle-note">已撤销</span>
                        )}
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
            <div className="page-grid">
              <section className="panel">
                <div className="panel-head"><div><span className="eyebrow">账号同步</span><h2>绑定 Nintendo 账号</h2></div><Button onClick={runSync}>立即同步</Button></div>
                <div className="status-list">
                  <div><span>绑定状态</span><strong>{accountInfo ? "已绑定" : "未绑定"}</strong></div>
                  <div><span>区域</span><strong>{accountInfo?.region ?? "未知"}</strong></div>
                  <div><span>最近同步</span><strong>{formatSimpleDate(accountInfo?.lastSyncAt ?? syncStatus?.finishedAt ?? null)}</strong></div>
                  <div><span>失败次数</span><strong>{accountInfo?.syncFailCount ?? 0}</strong></div>
                </div>
                {syncStatus?.errorSummary && <Alert type="warning" showIcon message={`最近一次同步失败：${syncStatus.errorSummary}`} />}
              </section>

              <section className="panel">
                <div className="panel-head"><div><span className="eyebrow">绑定表单</span><h2>更新会话 Token</h2></div></div>
                <Form layout="vertical" form={bindForm} initialValues={{ region: "JP" as const, sessionToken: "" }} onFinish={bindNintendo}>
                  <Form.Item
                    name="sessionToken"
                    label="Nintendo Session Token"
                    rules={[{ required: true, min: 8, message: "请输入有效的 Session Token" }]}
                  >
                    <Input.Password placeholder="粘贴你的 Nintendo Session Token" />
                  </Form.Item>
                  <Form.Item name="region" label="账号区域">
                    <Select
                      options={[
                        { value: "JP", label: "日本" },
                        { value: "GLOBAL", label: "海外" },
                        { value: "UNKNOWN", label: "未知" }
                      ]}
                    />
                  </Form.Item>
                  <Button htmlType="submit" type="primary" block>绑定并同步</Button>
                </Form>
              </section>
            </div>
          )}
        </Spin>
      </main>
    </div>
  );
}
