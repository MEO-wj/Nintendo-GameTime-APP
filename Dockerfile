# ---- base: install dependencies ----
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app
RUN printf 'node-linker=hoisted\nlink-workspace-packages=true\n' > .npmrc
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY backend/package.json backend/package.json
COPY backend/worker/package.json backend/worker/package.json
COPY frontend/web/package.json frontend/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --frozen-lockfile

# ---- builder: compile all packages ----
FROM base AS builder
COPY . .
RUN pnpm --filter @nintendo-gametime/shared-types build
RUN sed -i 's|"import": "./src/index.ts"|"import": "./dist/index.js"|' packages/shared-types/package.json && \
    sed -i 's|"types": "./src/index.ts"|"types": "./dist/index.d.ts"|' packages/shared-types/package.json
RUN pnpm --filter @nintendo-gametime/backend build
RUN pnpm --filter @nintendo-gametime/backend-worker build
ARG VITE_API_BASE_URL=
RUN VITE_API_BASE_URL=${VITE_API_BASE_URL} pnpm --filter @nintendo-gametime/web build

# ---- api (production) ----
FROM node:22-alpine AS api
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=base /app/.npmrc ./.npmrc
COPY --from=builder /app/packages/shared-types ./packages/shared-types
RUN mkdir -p node_modules/@nintendo-gametime && \
    ln -s ../../packages/shared-types node_modules/@nintendo-gametime/shared-types
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/backend/package.json ./backend/package.json
ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('node:http').get('http://localhost:4000/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "backend/dist/index.js"]

# ---- worker (production) ----
FROM node:22-alpine AS worker
WORKDIR /app
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=builder /app/backend/worker/dist ./backend/worker/dist
COPY --from=builder /app/backend/worker/package.json ./backend/worker/package.json
ENV NODE_ENV=production
CMD ["node", "backend/worker/dist/index.js"]

# ---- web (nginx) ----
FROM nginx:alpine AS web
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/frontend/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
