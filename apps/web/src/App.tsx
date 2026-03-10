import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import { Alert, Button, Form, Input, InputNumber, Select, Spin, message } from "antd";
import { api, clearToken, getToken, saveToken } from "./api";
import "./App.css";

type GameTab = "owned" | "recent" | "top";
type CorrectionType = "SET_TOTAL" | "ADD_DELTA";
type PlaytimeSource = "official" | "corrected" | "manual-only";

interface User {
  id: string;
  email: string;
}

interface DashboardSummary {
  totalGames: number;
  totalMinutes: number;
  totalPriceJpy: number;
  recent30Minutes: number;
  lastSyncAt: string | null;
  dataSource: Record<PlaytimeSource, number>;
}

interface DashboardCharts {
  donut: Array<{ name: string; value: number; gameId: string }>;
  ranking: Array<{ gameId: string; name: string; minutes: number }>;
}

interface GameItem {
  id: string;
  title: string;
  coverUrl: string | null;
  ownedAt: string | null;
  lastPlayedAt: string | null;
  priceJpy: number | null;
  effectivePlaytime: {
    totalMinutes: number;
    source: PlaytimeSource;
  };
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
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(window.atob(base64));
    return {
      id: String(decoded.userId ?? ""),
      email: String(decoded.email ?? "")
    };
  } catch {
    return null;
  }
}

function getNickname(email?: string | null): string {
  if (!email) return "玩家";
  return email.split("@")[0] || "玩家";
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function formatCurrency(value: number): string {
  return `¥${value.toLocaleString("zh-CN")}`;
}

function formatSimpleDate(value: string | null): string {
  if (!value) return "暂无记录";
  return new Date(value).toISOString().slice(0, 10);
}

function formatRelativeTime(value: string | null): string {
  if (!value) return "尚未同步";
  const diff = Date.now() - Date.parse(value);
  const minutes = Math.max(1, Math.floor(diff / 60000));
  if (minutes < 60) return `${minutes}分钟前更新`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前更新`;
  const days = Math.floor(hours / 24);
  return `${days}天前更新`;
}

function formatDuration(minutes: number, long = false): string {
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (!long) {
    if (hours <= 0) return `${minutes}m`;
    return restMinutes > 0 ? `${hours}h${restMinutes}m` : `${hours}h`;
  }
  if (hours <= 0) return `${minutes}分钟`;
  return restMinutes > 0 ? `${hours}小时${restMinutes}分钟` : `${hours}小时`;
}

function formatPlaytimeBadge(minutes: number): string {
  if (minutes < 60) return "<1h";
  return `${Math.floor(minutes / 60)}h`;
}

function formatSourceText(source: PlaytimeSource): string {
  if (source === "official") return "官方";
  if (source === "corrected") return "已修正";
  return "手动";
}

function buildDonutOption(charts: DashboardCharts | null, recent30Minutes: number) {
  const colors = ["#111111", "#1d1d1d", "#2f2a33", "#b79dc4", "#e5ddd7"];
  const chartData = (charts?.donut ?? []).slice(0, 5).map((item, index) => ({
    value: item.value,
    name: item.name,
    itemStyle: {
      color: colors[index] ?? "#111111"
    }
  }));

  return {
    animationDuration: 700,
    tooltip: {
      trigger: "item"
    },
    series: [
      {
        type: "pie",
        radius: ["67%", "88%"],
        center: ["50%", "50%"],
        padAngle: 2,
        label: { show: false },
        labelLine: { show: false },
        emphasis: { scale: false },
        data: chartData.length > 0 ? chartData : [{ value: 1, name: "暂无数据", itemStyle: { color: "#d8d1cb" } }]
      }
    ],
    graphic: [
      {
        type: "text",
        left: "center",
        top: "38%",
        style: {
          text: formatDuration(recent30Minutes, false),
          fontSize: 28,
          fontWeight: 800,
          fill: "#111111",
          fontFamily: "MiSans, HarmonyOS Sans SC, PingFang SC, Microsoft YaHei, sans-serif"
        }
      },
      {
        type: "text",
        left: "center",
        top: "57%",
        style: {
          text: "近30日",
          fontSize: 12,
          fontWeight: 500,
          fill: "#8f8b88",
          fontFamily: "MiSans, HarmonyOS Sans SC, PingFang SC, Microsoft YaHei, sans-serif"
        }
      }
    ]
  };
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<User | null>(() => parseStoredUser());
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [charts, setCharts] = useState<DashboardCharts | null>(null);
  const [games, setGames] = useState<GameItem[]>([]);
  const [corrections, setCorrections] = useState<CorrectionItem[]>([]);
  const [syncStatus, setSyncStatus] = useState<{
    status: string;
    startedAt: string;
    finishedAt: string | null;
    errorSummary: string | null;
  } | null>(null);
  const [gameTab, setGameTab] = useState<GameTab>("owned");
  const [otpDevCode, setOtpDevCode] = useState<string | null>(null);

  const [authForm] = Form.useForm<{ email: string; code?: string }>();
  const [bindForm] = Form.useForm<{ sessionToken: string; region: "JP" | "GLOBAL" | "UNKNOWN" }>();
  const [correctionForm] = Form.useForm<{
    gameId: string;
    type: CorrectionType;
    minutes: number;
    reason: string;
  }>();

  const nickname = getNickname(user?.email);

  const heroCovers = useMemo(() => {
    const dynamicCovers = games.map((game) => game.coverUrl).filter((cover): cover is string => Boolean(cover));
    const merged = [...dynamicCovers, ...FALLBACK_COVERS];
    return merged.slice(0, 6);
  }, [games]);

  const gameOptions = useMemo(
    () =>
      games.map((game) => ({
        value: game.id,
        label: game.title
      })),
    [games]
  );

  const activeCorrections = useMemo(
    () => corrections.filter((item) => !item.revokedAt),
    [corrections]
  );

  const topRanking = useMemo(() => {
    return (charts?.ranking ?? []).slice(0, 3);
  }, [charts]);

  const maxRankingMinutes = useMemo(() => {
    return Math.max(...topRanking.map((item) => item.minutes), 1);
  }, [topRanking]);

  const donutOption = useMemo(
    () => buildDonutOption(charts, summary?.recent30Minutes ?? 0),
    [charts, summary?.recent30Minutes]
  );

  const platformItems = useMemo(
    () => [
      { key: "switch", label: "Switch", count: summary?.totalGames ?? 0, active: true },
      { key: "steam", label: "Steam", count: 0, active: false },
      { key: "ps5", label: "PS5", count: 0, active: false },
      { key: "ps4", label: "PS4", count: 0, active: false },
      { key: "xbox", label: "Xbox", count: 0, active: false },
      { key: "mobile", label: "手游", count: 0, active: false }
    ],
    [summary?.totalGames]
  );

  async function fetchAll(selectedTab: GameTab = gameTab) {
    setBootLoading(true);
    setErrorText(null);
    try {
      const [summaryRes, chartsRes, gamesRes, correctionsRes, statusRes] = await Promise.all([
        api.get<DashboardSummary>("/api/dashboard/summary"),
        api.get<DashboardCharts>("/api/dashboard/charts", { params: { range: "30d" } }),
        api.get<{ items: GameItem[] }>("/api/games", { params: { tab: selectedTab } }),
        api.get<{ items: CorrectionItem[] }>("/api/playtime/corrections"),
        api.get<{ status: { status: string; startedAt: string; finishedAt: string | null; errorSummary: string | null } | null }>(
          "/api/sync/status"
        )
      ]);
      setSummary(summaryRes.data);
      setCharts(chartsRes.data);
      setGames(gamesRes.data.items);
      setCorrections(correctionsRes.data.items);
      setSyncStatus(statusRes.data.status);
    } catch (error) {
      setErrorText(getErrorMessage(error, "页面数据加载失败，请稍后再试"));
    } finally {
      setBootLoading(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    fetchAll().catch(() => undefined);
  }, [token]);

  async function requestOtp() {
    try {
      setLoading(true);
      const payload = await authForm.validateFields(["email"]);
      const response = await api.post<{ devCode?: string }>("/api/auth/login", {
        email: payload.email
      });
      setOtpDevCode(response.data.devCode ?? null);
      message.success("验证码已生成，请继续登录");
    } catch (error) {
      message.error(getErrorMessage(error, "获取验证码失败"));
    } finally {
      setLoading(false);
    }
  }

  async function login() {
    try {
      setLoading(true);
      const values = await authForm.validateFields();
      const response = await api.post<{ token: string; user: User }>("/api/auth/login", values);
      saveToken(response.data.token);
      setToken(response.data.token);
      setUser(response.data.user);
      setOtpDevCode(null);
      message.success("已进入游戏墙");
    } catch (error) {
      message.error(getErrorMessage(error, "登录失败"));
    } finally {
      setLoading(false);
    }
  }

  async function bindNintendo() {
    try {
      setLoading(true);
      const values = await bindForm.validateFields();
      await api.post("/api/accounts/nintendo/bind", values);
      message.success("账号已绑定，正在使用日服数据刷新页面");
      bindForm.resetFields();
      await fetchAll();
    } catch (error) {
      message.error(getErrorMessage(error, "绑定账号失败"));
    } finally {
      setLoading(false);
    }
  }

  async function runSync() {
    try {
      setLoading(true);
      await api.post("/api/sync/run");
      message.success("同步完成");
      await fetchAll();
    } catch (error) {
      message.error(getErrorMessage(error, "同步失败"));
    } finally {
      setLoading(false);
    }
  }

  async function submitCorrection() {
    try {
      setLoading(true);
      const values = await correctionForm.validateFields();
      await api.post("/api/playtime/corrections", values);
      message.success("修正记录已保存");
      correctionForm.resetFields();
      await fetchAll();
    } catch (error) {
      message.error(getErrorMessage(error, "提交修正失败"));
    } finally {
      setLoading(false);
    }
  }

  async function revokeCorrection(correctionId: string) {
    try {
      setLoading(true);
      await api.post(`/api/playtime/corrections/${correctionId}/revoke`);
      message.success("修正已撤销");
      await fetchAll();
    } catch (error) {
      message.error(getErrorMessage(error, "撤销修正失败"));
    } finally {
      setLoading(false);
    }
  }

  async function sharePage() {
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Nintendo GameTime",
          text: "看看我的任天堂游戏墙",
          url: shareUrl
        });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        message.success("链接已复制");
      }
    } catch {
      message.info("分享已取消");
    }
  }

  function scrollToSettings() {
    document.getElementById("settings-panel")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function logout() {
    clearToken();
    setToken(null);
    setUser(null);
    setSummary(null);
    setCharts(null);
    setGames([]);
    setCorrections([]);
    setSyncStatus(null);
    setOtpDevCode(null);
  }

  const gameTabLabels: Record<GameTab, string> = {
    owned: "最近拥有",
    recent: "最近在玩",
    top: "玩得最多"
  };

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-wall">
          {heroCovers.map((cover, index) => (
            <div
              key={`${cover}-${index}`}
              className="auth-wall-cover"
              style={{ backgroundImage: `url(${cover})` }}
            />
          ))}
        </div>
        <div className="auth-mask" />
        <div className="auth-panel">
          <div className="auth-panel-label">Nintendo GameTime</div>
          <h1>任天堂游戏墙</h1>
          <p>实时同步日服游戏数据，并用手动修正补齐缺失时长。</p>
          <Form layout="vertical" form={authForm} initialValues={{ email: "", code: "" }}>
            <Form.Item name="email" label="邮箱" rules={[{ required: true, type: "email", message: "请输入正确邮箱" }]}>
              <Input placeholder="you@example.com" />
            </Form.Item>
            <Form.Item name="code" label="验证码">
              <Input placeholder="开发环境可直接输入 000000" />
            </Form.Item>
            <div className="auth-actions">
              <Button onClick={requestOtp} loading={loading}>
                获取验证码
              </Button>
              <Button type="primary" onClick={login} loading={loading}>
                进入游戏墙
              </Button>
            </div>
          </Form>
          {otpDevCode && (
            <Alert
              className="auth-alert"
              message={`当前开发验证码：${otpDevCode}`}
              type="info"
              showIcon
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="cn-shell">
      <div className="cn-surface">
        <section className="hero-banner">
          <div className="hero-wall">
            {heroCovers.map((cover, index) => (
              <div
                key={`${cover}-${index}`}
                className="hero-wall-cover"
                style={{ backgroundImage: `url(${cover})` }}
              />
            ))}
          </div>
          <div className="hero-overlay" />
          <div className="hero-head">
            <button type="button" className="hero-back-button">
              游戏墙
            </button>
            <button type="button" className="hero-share-button" onClick={sharePage}>
              分享
            </button>
          </div>
          <div className="hero-copy">
            <div className="hero-copy-label">游戏墙</div>
            <h1>
              共 <span>{summary?.totalGames ?? 0}</span> 款游戏，总价值约{" "}
              <span>{summary?.totalPriceJpy ?? 0}</span> 人民币
            </h1>
            <p>
              已补齐 {((summary?.dataSource.corrected ?? 0) + (summary?.dataSource["manual-only"] ?? 0))} 款游戏的缺失时长，
              近 30 日共游玩 {formatDuration(summary?.recent30Minutes ?? 0, true)}
            </p>
          </div>
        </section>

        <div className="sheet-content">
          {errorText && (
            <Alert
              className="page-alert"
              message="页面数据加载失败"
              description={errorText}
              type="error"
              showIcon
            />
          )}

          <Spin spinning={bootLoading || loading}>
            <section className="platform-strip">
              {platformItems.map((item) => (
                <div
                  key={item.key}
                  className={`platform-item ${item.active ? "platform-item-active" : ""}`}
                >
                  <div className="platform-name">{item.label}</div>
                  <div className="platform-count">{item.count}款</div>
                </div>
              ))}
            </section>

            <section className="profile-card">
              <div className="profile-watermark">NS</div>
              <div className="profile-head">
                <div className="profile-avatar">{nickname.slice(0, 2).toUpperCase()}</div>
                <div className="profile-meta">
                  <div className="profile-name-row">
                    <strong>{nickname}</strong>
                    <span>{formatRelativeTime(summary?.lastSyncAt ?? null)}</span>
                    <button type="button" className="inline-action" onClick={runSync}>
                      点击更新
                    </button>
                  </div>
                  <div className="profile-tags">
                    <span className="mini-tag">日本</span>
                    <button type="button" className="inline-action" onClick={scrollToSettings}>
                      添加账号
                    </button>
                  </div>
                </div>
              </div>

              <div className="profile-stats">
                <div className="stat-block">
                  <div className="stat-label">游戏数</div>
                  <div className="stat-value">{summary?.totalGames ?? 0}</div>
                  <div className="stat-note">已同步 Switch</div>
                </div>
                <div className="stat-block">
                  <div className="stat-label">游戏时长</div>
                  <div className="stat-value">{formatDuration(summary?.totalMinutes ?? 0, false)}</div>
                  <div className="stat-note">含手动修正</div>
                </div>
                <div className="stat-block">
                  <div className="stat-label">总价值</div>
                  <div className="stat-value">{formatCurrency(summary?.totalPriceJpy ?? 0)}</div>
                  <div className="stat-note">日服估算</div>
                </div>
                <div className="stat-block">
                  <div className="stat-label">手动修正</div>
                  <div className="stat-value">{activeCorrections.length}</div>
                  <div className="stat-note">当前生效</div>
                </div>
              </div>

              <div className="playtime-panel">
                <div className="playtime-panel-head">
                  <div>
                    <div className="playtime-title">近30日游玩时间</div>
                    <div className="playtime-subtitle">{formatDuration(summary?.recent30Minutes ?? 0, true)}</div>
                  </div>
                  <div className="year-link">年度总结</div>
                </div>
                <div className="playtime-panel-body">
                  <div className="donut-panel">
                    <ReactECharts option={donutOption} style={{ height: 220 }} />
                  </div>
                  <div className="ranking-panel">
                    {topRanking.length > 0 ? (
                      topRanking.map((item, index) => (
                        <div key={item.gameId} className="ranking-item">
                          <div className="ranking-bar-track">
                            <div
                              className={`ranking-bar-fill ranking-bar-fill-${index + 1}`}
                              style={{
                                width: `${Math.max((item.minutes / maxRankingMinutes) * 100, 18)}%`
                              }}
                            />
                          </div>
                          <div className="ranking-meta">
                            <span className="ranking-name">{item.name}</span>
                            <span className="ranking-time">{formatDuration(item.minutes, false)}</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="empty-block">绑定账号后会在这里显示近30日排行</div>
                    )}
                  </div>
                </div>
              </div>

              {syncStatus?.errorSummary && (
                <Alert
                  className="sync-alert"
                  type="warning"
                  message={`最近一次同步异常：${syncStatus.errorSummary}`}
                  showIcon
                />
              )}
            </section>

            <section className="games-section">
              <div className="section-head">
                <div className="game-tabs">
                  {(Object.keys(gameTabLabels) as GameTab[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={`game-tab-button ${gameTab === tab ? "game-tab-active" : ""}`}
                      onClick={() => {
                        setGameTab(tab);
                        fetchAll(tab).catch(() => undefined);
                      }}
                    >
                      {gameTabLabels[tab]}
                    </button>
                  ))}
                </div>
                <button type="button" className="view-toggle" onClick={scrollToSettings}>
                  管理
                </button>
              </div>

              <div className="games-grid">
                {games.map((game, index) => (
                  <article key={game.id} className="game-card">
                    <div
                      className="game-card-cover"
                      style={{
                        backgroundImage: `url(${game.coverUrl ?? FALLBACK_COVERS[index % FALLBACK_COVERS.length]})`
                      }}
                    >
                      <div className="game-playtime-badge">
                        {formatPlaytimeBadge(game.effectivePlaytime.totalMinutes)}
                      </div>
                      <div className="game-card-gradient" />
                      <div className="game-card-meta">
                        <div className="game-card-title">{game.title}</div>
                        <div className="game-card-action">
                          {game.effectivePlaytime.source === "official"
                            ? "官方同步"
                            : `${formatSourceText(game.effectivePlaytime.source)}时长`}
                        </div>
                        <div className="game-card-date">
                          {gameTab === "owned"
                            ? `${formatSimpleDate(game.ownedAt)} 拥有`
                            : gameTab === "recent"
                              ? `${formatSimpleDate(game.lastPlayedAt)} 最近游玩`
                              : `${formatCurrency(game.priceJpy ?? 0)} / ${formatDuration(game.effectivePlaytime.totalMinutes, false)}`}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section id="settings-panel" className="tool-section">
              <div className="tool-card">
                <div className="tool-card-head">
                  <div>
                    <h3>账号同步设置</h3>
                    <p>绑定 Nintendo 会话后即可自动拉取日服数据，也支持手动刷新。</p>
                  </div>
                  <button type="button" className="soft-button" onClick={runSync}>
                    立即同步
                  </button>
                </div>
                <div className="tool-metrics">
                  <span>官方：{summary?.dataSource.official ?? 0}</span>
                  <span>已修正：{summary?.dataSource.corrected ?? 0}</span>
                  <span>手动：{summary?.dataSource["manual-only"] ?? 0}</span>
                </div>
                <Form
                  layout="vertical"
                  form={bindForm}
                  initialValues={{ region: "JP" as const }}
                  onFinish={bindNintendo}
                >
                  <Form.Item
                    name="sessionToken"
                    label="Nintendo Session Token"
                    rules={[{ required: true, min: 8, message: "请输入有效的会话 Token" }]}
                  >
                    <Input.Password placeholder="粘贴你自己的会话 Token" />
                  </Form.Item>
                  <Form.Item name="region" label="账号地区">
                    <Select
                      options={[
                        { value: "JP", label: "日本" },
                        { value: "GLOBAL", label: "海外" },
                        { value: "UNKNOWN", label: "未知" }
                      ]}
                    />
                  </Form.Item>
                  <div className="tool-actions">
                    <Button htmlType="submit" type="primary" loading={loading}>
                      绑定账号
                    </Button>
                    <Button onClick={logout}>退出登录</Button>
                  </div>
                </Form>
                <div className="sync-status-line">
                  最近同步：{syncStatus?.finishedAt ? formatSimpleDate(syncStatus.finishedAt) : "暂无"}
                  <span className={`sync-status-tag sync-status-${syncStatus?.status?.toLowerCase() ?? "idle"}`}>
                    {syncStatus?.status ?? "IDLE"}
                  </span>
                </div>
              </div>

              <div className="tool-card">
                <div className="tool-card-head">
                  <div>
                    <h3>手动修正仪表盘</h3>
                    <p>当官方时长缺失或地区不可见时，可用 SET_TOTAL / ADD_DELTA 进行补录。</p>
                  </div>
                </div>
                <Form
                  layout="vertical"
                  form={correctionForm}
                  initialValues={{ type: "ADD_DELTA" as const, minutes: 30 }}
                  onFinish={submitCorrection}
                >
                  <Form.Item name="gameId" label="选择游戏" rules={[{ required: true, message: "请选择游戏" }]}>
                    <Select placeholder="选择要修正的游戏" options={gameOptions} />
                  </Form.Item>
                  <div className="correction-row">
                    <Form.Item
                      className="correction-row-item"
                      name="type"
                      label="修正类型"
                      rules={[{ required: true, message: "请选择修正类型" }]}
                    >
                      <Select
                        options={[
                          { value: "SET_TOTAL", label: "SET_TOTAL 设定总时长" },
                          { value: "ADD_DELTA", label: "ADD_DELTA 增减时长" }
                        ]}
                      />
                    </Form.Item>
                    <Form.Item
                      className="correction-row-item"
                      name="minutes"
                      label="分钟数"
                      rules={[{ required: true, message: "请输入分钟数" }]}
                    >
                      <InputNumber style={{ width: "100%" }} />
                    </Form.Item>
                  </div>
                  <Form.Item name="reason" label="修正说明" rules={[{ required: true, min: 2, message: "请填写修正说明" }]}>
                    <Input.TextArea rows={3} placeholder="例如：日服不可见，补录本周通勤时长" />
                  </Form.Item>
                  <Button htmlType="submit" type="primary" block>
                    保存修正
                  </Button>
                </Form>

                <div className="correction-list">
                  {corrections.length > 0 ? (
                    corrections.slice(0, 8).map((item) => (
                      <div key={item.id} className="correction-item">
                        <div className="correction-item-main">
                          <div className="correction-type-tag">
                            {item.type === "SET_TOTAL" ? "设定总时长" : "增减时长"}
                          </div>
                          <div className="correction-reason">{item.reason}</div>
                          <div className="correction-meta">
                            <span>{formatSimpleDate(item.createdAt)}</span>
                            <span>{item.minutes} 分钟</span>
                            <span>{item.revokedAt ? "已撤销" : "生效中"}</span>
                          </div>
                        </div>
                        {!item.revokedAt && (
                          <button
                            type="button"
                            className="link-danger"
                            onClick={() => revokeCorrection(item.id)}
                          >
                            撤销
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="empty-block">还没有修正记录，绑定账号后可以直接开始补录。</div>
                  )}
                </div>
              </div>
            </section>
          </Spin>
        </div>
      </div>
    </div>
  );
}
