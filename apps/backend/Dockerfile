# syntax=docker/dockerfile:1
#
# 標準 Node イメージ。監視機能（Playwright）を撤去したため重い Playwright
# 公式イメージは不要。Prisma 7 は driver adapter (pg) を使うためクエリエンジン
# バイナリも不要で、slim イメージで動作する。

FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

# 依存関係インストール用ステージ
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

# ビルド用ステージ
FROM deps AS builder
COPY . .
# prisma generate は接続しないが prisma.config.ts が env('DATABASE_URL') を要求するためダミーを渡す
RUN pnpm --filter @sanrentan-party/shared build \
    && DATABASE_URL='postgresql://build-dummy' pnpm --filter @sanrentan-party/backend prisma:generate \
    && pnpm --filter @sanrentan-party/backend build

# ランタイムステージ
FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/backend ./apps/backend
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules

EXPOSE 3001
WORKDIR /app/apps/backend
CMD ["node", "dist/main.js"]
