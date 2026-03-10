# Nintendo GameTime APP

Monorepo implementation for Nintendo GameTime v1:
- `apps/web`: React + TypeScript + Ant Design + ECharts dashboard
- `apps/api`: Node.js + Koa API (JWT auth, sync proxy, correction ledger, audit logs)
- `apps/worker`: scheduled sync worker (5-minute polling by default)
- `packages/shared-types`: shared domain types and effective playtime calculation

## 1. Quick Start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Default local ports:
- Web: `http://localhost:5173`
- API: `http://localhost:4000`

## 2. Required Env

Set in root `.env` (or per app `.env`):
- `JWT_SECRET`
- `ENCRYPTION_KEY` (32-byte key in 64-char hex)
- `STORAGE_MODE=postgres`
- `DATABASE_URL`
- `INTERNAL_SYNC_TOKEN`
- `NINTENDO_MOCK=true` for mock sync data in development

## 3. API Endpoints

- `POST /api/auth/login` (request OTP or login with code)
- `POST /api/accounts/nintendo/bind`
- `POST /api/sync/run`
- `GET /api/sync/status`
- `GET /api/dashboard/summary`
- `GET /api/dashboard/charts?range=30d`
- `GET /api/games?tab=owned|recent|top&cursor=...`
- `POST /api/playtime/corrections`
- `GET /api/playtime/corrections?gameId=...`
- `POST /api/playtime/corrections/:id/revoke`

Worker internal endpoint:
- `POST /api/internal/sync/all` with header `x-internal-token`

## 4. Test Commands

```bash
pnpm test
pnpm --filter @nintendo-gametime/web test:e2e
pnpm --filter @nintendo-gametime/api test:load
```

Load test needs:
- `LOAD_TEST_BEARER=<jwt token>`
- optional `LOAD_TEST_URL`, `LOAD_TEST_CONNECTIONS`, `LOAD_TEST_DURATION`

## 5. Build

```bash
pnpm build
```

## 6. App Shell (Capacitor)

```bash
pnpm --filter @nintendo-gametime/web build
pnpm --filter @nintendo-gametime/web cap:sync
pnpm --filter @nintendo-gametime/web cap:open:android
```

## Notes

- Official snapshots are immutable; manual edits are stored as correction ledger.
- Effective playtime rules:
  - latest `SET_TOTAL` + subsequent `ADD_DELTA`
  - if no `SET_TOTAL`, latest official playtime + all `ADD_DELTA`
- Corrections are revocable (soft delete style via `revokedAt`) and audited.
