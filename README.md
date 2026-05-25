# Nintendo GameTime

Nintendo GameTime 是一个面向任天堂玩家的“游戏墙 + 时长记录”项目，目标是：

- 准实时同步任天堂日服游戏数据
- 在官方时长缺失时，用“手动修正账本”补齐游玩记录
- 同时提供网页端与 App 壳能力

当前仓库已经包含 `Frontend + Backend + Worker + Shared Types` 四部分实现。

## 项目结构

- `frontend/web`
  React + TypeScript + Ant Design + ECharts 前端，当前页面已改为中文，并采用”游戏墙”式布局。
- `backend`
  Node.js + Koa 接口层，负责登录、账号绑定、同步任务、仪表盘数据和手动修正。
- `backend/worker`
  定时同步 Worker，默认每 5 分钟轮询一次。
- `packages/shared-types`
  共享类型与时长计算规则，包含 `SET_TOTAL` / `ADD_DELTA` 修正规则。

## 快速启动

先安装依赖：

```bash
pnpm install
```

复制环境变量模板：

```bash
cp .env.example .env
```

本地开发启动：

```bash
pnpm dev
```

默认地址：

- 前端：`http://localhost:5173`
- API：`http://localhost:4000`

如果要让同一局域网设备访问前端，也可以直接使用你电脑的局域网 IP，例如：

- `http://10.24.66.168:5173`

## 当前页面能力

前端页面已经包含以下区域：

- 顶部游戏墙横幅
  显示游戏总数、总价值、近 30 日游玩摘要，视觉风格参考移动端游戏墙页面
- 平台切换条
  当前以 Switch 为主，其余平台先展示占位
- 玩家总览卡片
  显示昵称、最近更新时间、总时长、总价值、手动修正数
- 近 30 日游玩图表
  左侧环图，右侧排行条形列表
- 游戏卡片墙
  支持“最近拥有 / 最近在玩 / 玩得最多”三个视角
- 手动修正仪表盘
  支持 `SET_TOTAL` 和 `ADD_DELTA`，并能撤销修正
- 账号同步设置
  支持绑定 Nintendo Session Token 和手动触发同步

## 环境变量

根目录 `.env.example` 已给出完整模板，关键字段如下：

- `PORT=4000`
- `JWT_SECRET=...`
- `ENCRYPTION_KEY=...`
- `STORAGE_MODE=postgres` 或 `memory`
- `DATABASE_URL=...`
- `INTERNAL_SYNC_TOKEN=...`
- `NINTENDO_MOCK=true`
- `VITE_API_BASE_URL=http://localhost:4000`

开发阶段如果只想快速预览页面，建议：

- `STORAGE_MODE=memory`
- `NINTENDO_MOCK=true`

这样不依赖数据库，也能看到完整页面和 mock 数据。

## 登录与预览

当前开发环境下：

- 邮箱可以随意填写，例如 `demo@example.com`
- 验证码可直接使用 `000000`

绑定账号时也可以先填一个 mock token，例如：

- `mock_session_token_abcdefg`

系统会返回内置的演示数据，方便先看页面效果。

## 主要接口

- `POST /api/auth/login`
  获取验证码或提交验证码登录
- `POST /api/accounts/nintendo/bind`
  绑定 Nintendo 会话并触发首次同步
- `POST /api/sync/run`
  手动同步
- `GET /api/sync/status`
  查看最近一次同步状态
- `GET /api/dashboard/summary`
  仪表盘汇总数据
- `GET /api/dashboard/charts?range=30d`
  近 30 日图表数据
- `GET /api/games?tab=owned|recent|top`
  游戏列表
- `POST /api/playtime/corrections`
  新增手动修正
- `GET /api/playtime/corrections`
  获取修正记录
- `POST /api/playtime/corrections/:id/revoke`
  撤销修正

## 测试与构建

类型检查：

```bash
pnpm typecheck
```

单元测试与接口集成测试：

```bash
pnpm test
```

完整构建：

```bash
pnpm build
```

前端 E2E 已写好 Playwright 脚手架，但如果本机还没有安装浏览器运行时，需要先执行：

```bash
pnpm --filter @nintendo-gametime/web exec playwright install chromium
```

## App 壳

前端已接入 Capacitor 配置，可以继续打包为 Android / iOS 壳：

```bash
pnpm --filter @nintendo-gametime/web build
pnpm --filter @nintendo-gametime/web cap:sync
pnpm --filter @nintendo-gametime/web cap:open:android
```

## 时长修正规则

项目当前采用“官方快照 + 修正账本”模式，不直接覆盖官方数据：

- `SET_TOTAL`
  把某个游戏的总时长直接设为一个新基线
- `ADD_DELTA`
  在当前基线或官方时长基础上增减分钟数

有效时长计算规则：

- 如果存在最近一条 `SET_TOTAL`，则取该值作为基线，再叠加后续所有 `ADD_DELTA`
- 如果不存在 `SET_TOTAL`，则取最新官方时长，再叠加所有 `ADD_DELTA`

撤销修正后，页面统计会重新计算。
