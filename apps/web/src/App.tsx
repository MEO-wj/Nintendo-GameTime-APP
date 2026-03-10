import { useEffect, useMemo, useState } from "react";
import ReactECharts from "echarts-for-react";
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Layout,
  List,
  message,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { api, clearToken, getToken, saveToken } from "./api";
import "./App.css";

const { Header, Content } = Layout;
const { Title, Text } = Typography;

type GameTab = "owned" | "recent" | "top";
type CorrectionType = "SET_TOTAL" | "ADD_DELTA";

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
  dataSource: Record<"official" | "corrected" | "manual-only", number>;
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
    source: "official" | "corrected" | "manual-only";
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

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function sourceTag(source: "official" | "corrected" | "manual-only") {
  if (source === "official") return <Tag color="blue">Official</Tag>;
  if (source === "corrected") return <Tag color="gold">Corrected</Tag>;
  return <Tag color="purple">Manual Only</Tag>;
}

export default function App() {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<User | null>(null);
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

  const gameOptions = useMemo(
    () =>
      games.map((game) => ({
        value: game.id,
        label: game.title
      })),
    [games]
  );

  const donutOption = useMemo(
    () => ({
      tooltip: {
        trigger: "item"
      },
      legend: {
        top: "bottom"
      },
      series: [
        {
          type: "pie",
          radius: ["45%", "75%"],
          data: charts?.donut ?? [],
          label: {
            formatter: "{b}: {c}m"
          }
        }
      ]
    }),
    [charts]
  );

  const rankingOption = useMemo(
    () => ({
      tooltip: { trigger: "axis" },
      xAxis: {
        type: "category",
        data: charts?.ranking.map((item) => item.name) ?? [],
        axisLabel: {
          rotate: 30
        }
      },
      yAxis: { type: "value" },
      series: [
        {
          data: charts?.ranking.map((item) => item.minutes) ?? [],
          type: "bar",
          barWidth: 18,
          itemStyle: {
            borderRadius: [8, 8, 0, 0]
          }
        }
      ]
    }),
    [charts]
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
      setErrorText(error instanceof Error ? error.message : "Failed to load dashboard");
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
      const res = await api.post<{ devCode?: string; message: string }>("/api/auth/login", {
        email: payload.email
      });
      setOtpDevCode(res.data.devCode ?? null);
      message.success("验证码已生成，请继续登录");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "请求验证码失败");
    } finally {
      setLoading(false);
    }
  }

  async function login() {
    try {
      setLoading(true);
      const values = await authForm.validateFields();
      const res = await api.post<{ token: string; user: User }>("/api/auth/login", values);
      saveToken(res.data.token);
      setToken(res.data.token);
      setUser(res.data.user);
      setOtpDevCode(null);
      message.success("登录成功");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  async function bindNintendo() {
    try {
      setLoading(true);
      const values = await bindForm.validateFields();
      await api.post("/api/accounts/nintendo/bind", values);
      message.success("账号已绑定并触发首次同步");
      bindForm.resetFields();
      await fetchAll();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "绑定失败");
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
      message.error(error instanceof Error ? error.message : "同步失败");
    } finally {
      setLoading(false);
    }
  }

  async function submitCorrection() {
    try {
      setLoading(true);
      const values = await correctionForm.validateFields();
      await api.post("/api/playtime/corrections", values);
      message.success("修正已保存");
      correctionForm.resetFields();
      await fetchAll();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "提交修正失败");
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
      message.error(error instanceof Error ? error.message : "撤销失败");
    } finally {
      setLoading(false);
    }
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
  }

  const correctionColumns: ColumnsType<CorrectionItem> = [
    {
      title: "Game ID",
      dataIndex: "gameId",
      key: "gameId"
    },
    {
      title: "Type",
      dataIndex: "type",
      key: "type",
      render: (value: CorrectionType) => (
        <Tag color={value === "SET_TOTAL" ? "cyan" : "geekblue"}>{value}</Tag>
      )
    },
    {
      title: "Minutes",
      dataIndex: "minutes",
      key: "minutes"
    },
    {
      title: "Reason",
      dataIndex: "reason",
      key: "reason"
    },
    {
      title: "Created",
      dataIndex: "createdAt",
      key: "createdAt",
      render: (value: string) => formatDate(value)
    },
    {
      title: "Status",
      key: "status",
      render: (_, record) =>
        record.revokedAt ? <Tag color="default">Revoked</Tag> : <Tag color="green">Active</Tag>
    },
    {
      title: "Action",
      key: "action",
      render: (_, record) =>
        record.revokedAt ? null : (
          <Button type="link" danger onClick={() => revokeCorrection(record.id)}>
            Revoke
          </Button>
        )
    }
  ];

  if (!token) {
    return (
      <div className="auth-shell">
        <Card className="auth-card">
          <Title level={3}>Nintendo GameTime Login</Title>
          <Text type="secondary">
            先获取验证码，再用邮箱 + 验证码登录。开发环境会返回 `devCode`。
          </Text>
          <Divider />
          <Form layout="vertical" form={authForm} initialValues={{ email: "", code: "" }}>
            <Form.Item name="email" label="Email" rules={[{ required: true, type: "email" }]}>
              <Input placeholder="you@example.com" />
            </Form.Item>
            <Form.Item name="code" label="OTP Code">
              <Input placeholder="6-digit code" />
            </Form.Item>
            <Space>
              <Button onClick={requestOtp} loading={loading}>
                Request OTP
              </Button>
              <Button type="primary" onClick={login} loading={loading}>
                Login
              </Button>
            </Space>
          </Form>
          {otpDevCode && (
            <Alert
              className="auth-alert"
              message={`开发验证码: ${otpDevCode}`}
              type="info"
              showIcon
            />
          )}
        </Card>
      </div>
    );
  }

  return (
    <Layout className="app-layout">
      <Header className="app-header">
        <div>
          <Title level={3} style={{ margin: 0, color: "#ffffff" }}>
            Nintendo GameTime Dashboard
          </Title>
          <Text style={{ color: "#b8bfcc" }}>{user?.email ?? "已登录用户"}</Text>
        </div>
        <Space>
          <Button onClick={() => fetchAll()} loading={bootLoading}>
            Refresh
          </Button>
          <Button type="primary" onClick={runSync} loading={loading}>
            Manual Sync
          </Button>
          <Button danger onClick={logout}>
            Logout
          </Button>
        </Space>
      </Header>

      <Content className="app-content">
        {errorText && (
          <Alert
            message="数据加载异常"
            description={errorText}
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}
        <Spin spinning={bootLoading || loading}>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12} lg={6}>
              <Card>
                <Statistic title="Total Games" value={summary?.totalGames ?? 0} />
              </Card>
            </Col>
            <Col xs={24} md={12} lg={6}>
              <Card>
                <Statistic title="Total Playtime" value={formatMinutes(summary?.totalMinutes ?? 0)} />
              </Card>
            </Col>
            <Col xs={24} md={12} lg={6}>
              <Card>
                <Statistic title="Total Price (JPY)" value={summary?.totalPriceJpy ?? 0} />
              </Card>
            </Col>
            <Col xs={24} md={12} lg={6}>
              <Card>
                <Statistic title="Recent 30 Days" value={formatMinutes(summary?.recent30Minutes ?? 0)} />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
            <Col xs={24} lg={12}>
              <Card title="Nintendo Account Binding">
                <Form
                  form={bindForm}
                  layout="vertical"
                  initialValues={{ region: "JP" as const }}
                  onFinish={bindNintendo}
                >
                  <Form.Item
                    name="sessionToken"
                    label="Nintendo Session Token"
                    rules={[{ required: true, min: 8 }]}
                  >
                    <Input.Password placeholder="Paste your personal session token" />
                  </Form.Item>
                  <Form.Item name="region" label="Region">
                    <Select
                      options={[
                        { value: "JP", label: "JP" },
                        { value: "GLOBAL", label: "GLOBAL" },
                        { value: "UNKNOWN", label: "UNKNOWN" }
                      ]}
                    />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={loading}>
                    Bind & First Sync
                  </Button>
                </Form>
                <Divider />
                <Text type="secondary">Last Sync: {formatDate(summary?.lastSyncAt ?? null)}</Text>
                {syncStatus && (
                  <div style={{ marginTop: 8 }}>
                    <Tag color={syncStatus.status === "FAILED" ? "red" : "green"}>
                      {syncStatus.status}
                    </Tag>
                    <Text type="secondary">
                      Started: {formatDate(syncStatus.startedAt)} | Finished:{" "}
                      {formatDate(syncStatus.finishedAt)}
                    </Text>
                    {syncStatus.errorSummary && (
                      <Alert
                        style={{ marginTop: 8 }}
                        type="warning"
                        message={syncStatus.errorSummary}
                        showIcon
                      />
                    )}
                  </div>
                )}
              </Card>
            </Col>

            <Col xs={24} lg={12}>
              <Card title="Data Source">
                <Space wrap>
                  <Tag color="blue">Official: {summary?.dataSource.official ?? 0}</Tag>
                  <Tag color="gold">Corrected: {summary?.dataSource.corrected ?? 0}</Tag>
                  <Tag color="purple">Manual-only: {summary?.dataSource["manual-only"] ?? 0}</Tag>
                </Space>
                <Divider />
                <Row gutter={[8, 8]}>
                  <Col span={12}>
                    <Card size="small">
                      <ReactECharts option={donutOption} style={{ height: 220 }} />
                    </Card>
                  </Col>
                  <Col span={12}>
                    <Card size="small">
                      <ReactECharts option={rankingOption} style={{ height: 220 }} />
                    </Card>
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
            <Col xs={24} lg={14}>
              <Card title="Games">
                <Tabs
                  activeKey={gameTab}
                  onChange={(key) => {
                    const nextTab = key as GameTab;
                    setGameTab(nextTab);
                    fetchAll(nextTab).catch(() => undefined);
                  }}
                  items={[
                    { key: "owned", label: "Owned" },
                    { key: "recent", label: "Recent Played" },
                    { key: "top", label: "Top Playtime" }
                  ]}
                />
                <List
                  dataSource={games}
                  renderItem={(game) => (
                    <List.Item>
                      <List.Item.Meta
                        avatar={
                          game.coverUrl ? (
                            <img src={game.coverUrl} alt={game.title} className="game-cover" />
                          ) : (
                            <div className="game-placeholder">N</div>
                          )
                        }
                        title={
                          <Space>
                            <span>{game.title}</span>
                            {sourceTag(game.effectivePlaytime.source)}
                          </Space>
                        }
                        description={
                          <Space wrap>
                            <Text type="secondary">
                              Playtime: {formatMinutes(game.effectivePlaytime.totalMinutes)}
                            </Text>
                            <Text type="secondary">Owned: {formatDate(game.ownedAt)}</Text>
                            <Text type="secondary">Last Played: {formatDate(game.lastPlayedAt)}</Text>
                          </Space>
                        }
                      />
                    </List.Item>
                  )}
                />
              </Card>
            </Col>

            <Col xs={24} lg={10}>
              <Card title="Manual Correction Ledger">
                <Form
                  layout="vertical"
                  form={correctionForm}
                  initialValues={{ type: "ADD_DELTA" as const, minutes: 30 }}
                  onFinish={submitCorrection}
                >
                  <Form.Item name="gameId" label="Game" rules={[{ required: true }]}>
                    <Select placeholder="Select game" options={gameOptions} />
                  </Form.Item>
                  <Form.Item name="type" label="Correction Type" rules={[{ required: true }]}>
                    <Select
                      options={[
                        { value: "SET_TOTAL", label: "SET_TOTAL" },
                        { value: "ADD_DELTA", label: "ADD_DELTA" }
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="minutes" label="Minutes" rules={[{ required: true }]}>
                    <InputNumber style={{ width: "100%" }} />
                  </Form.Item>
                  <Form.Item name="reason" label="Reason" rules={[{ required: true, min: 2 }]}>
                    <Input.TextArea rows={2} />
                  </Form.Item>
                  <Button type="primary" htmlType="submit">
                    Submit Correction
                  </Button>
                </Form>

                <Divider />
                <Table
                  size="small"
                  rowKey="id"
                  columns={correctionColumns}
                  dataSource={corrections}
                  pagination={{ pageSize: 5 }}
                  scroll={{ x: 760 }}
                />
              </Card>
            </Col>
          </Row>
        </Spin>
      </Content>
    </Layout>
  );
}
