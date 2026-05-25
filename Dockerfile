# ---- Go API build ----
FROM golang:1.23-alpine AS go-builder
WORKDIR /app
COPY backend/go.mod backend/go.sum ./backend/
RUN cd backend && go mod download
COPY backend/ ./backend/
RUN cd backend && CGO_ENABLED=0 GOOS=linux go build -o /api-server ./cmd/server/

# ---- Frontend build ----
FROM node:22-alpine AS web-builder
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
RUN printf 'node-linker=hoisted\nlink-workspace-packages=true\n' > .npmrc
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY frontend/web/package.json frontend/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile
COPY packages/ ./packages/
COPY frontend/ ./frontend/
RUN pnpm --filter @nintendo-gametime/shared-types build
RUN sed -i 's|"import": "./src/index.ts"|"import": "./dist/index.js"|' packages/shared-types/package.json && \
    sed -i 's|"types": "./src/index.ts"|"types": "./dist/index.d.ts"|' packages/shared-types/package.json
ARG VITE_API_BASE_URL=
RUN VITE_API_BASE_URL=${VITE_API_BASE_URL} pnpm --filter @nintendo-gametime/web build

# ---- Worker build (TypeScript) ----
FROM node:22-alpine AS worker-builder
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
RUN printf 'node-linker=hoisted\nlink-workspace-packages=true\n' > .npmrc
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY backend/worker/package.json backend/worker/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile
COPY packages/ ./packages/
COPY backend/worker/ ./backend/worker/
RUN pnpm --filter @nintendo-gametime/shared-types build
RUN sed -i 's|"import": "./src/index.ts"|"import": "./dist/index.js"|' packages/shared-types/package.json && \
    sed -i 's|"types": "./src/index.ts"|"types": "./dist/index.d.ts"|' packages/shared-types/package.json
RUN pnpm --filter @nintendo-gametime/backend-worker build

# ---- api (Go production) ----
FROM alpine:3.20 AS api
RUN apk add --no-cache ca-certificates R R-dev
WORKDIR /app
COPY --from=go-builder /api-server ./api-server
COPY backend/scripts/ ./scripts/
ENV GIN_MODE=release
ENV PORT=4000
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/healthz || exit 1
CMD ["./api-server"]

# ---- worker (TypeScript production) ----
FROM node:22-alpine AS worker
WORKDIR /app
COPY --from=worker-builder /app/node_modules ./node_modules
COPY --from=worker-builder /app/packages/shared-types ./packages/shared-types
COPY --from=worker-builder /app/backend/worker/dist ./backend/worker/dist
COPY --from=worker-builder /app/backend/worker/package.json ./backend/worker/package.json
ENV NODE_ENV=production
CMD ["node", "backend/worker/dist/index.js"]

# ---- web (nginx) ----
FROM nginx:alpine AS web
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-builder /app/frontend/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
