# Web 前端说明

这是 Nintendo GameTime 的网页前端，基于：

- React
- TypeScript
- Vite
- Ant Design
- ECharts

## 本地启动

在仓库根目录执行：

```bash
pnpm --filter @nintendo-gametime/web dev
```

默认访问地址：

- 本机：`http://localhost:5173`
- 局域网：`http://你的局域网IP:5173`

## 当前页面结构

- 登录页
  中文文案，支持邮箱 + 验证码登录
- 游戏墙横幅
  参考移动端游戏墙视觉，展示总游戏数、总价值、近 30 日游玩摘要
- 平台切换条
  目前以 Switch 为主，其他平台先保留样式位
- 玩家总览卡片
  显示昵称、最近同步时间、总时长、总价值、修正数
- 游戏卡片墙
  支持最近拥有、最近在玩、玩得最多三种视图
- 账号同步设置
  用于绑定 Nintendo Session Token 并手动触发同步
- 手动修正仪表盘
  用于补录缺失时长、查看修正记录、撤销修正

## 开发约定

- 页面文案统一中文
- 视觉方向以“移动端游戏墙”风格为主
- 功能上保留网站端所需的同步与修正能力

## 构建

```bash
pnpm --filter @nintendo-gametime/web build
```
