# syntax=docker/dockerfile:1

FROM node:24-bookworm AS base
WORKDIR /app
RUN corepack enable

# build 時に埋め込みたい public env を受け取る
ARG NEXT_PUBLIC_API_URL
ARG NEXTAUTH_URL

# Next build が参照できるように build 前に ENV に入れる
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXTAUTH_URL=${NEXTAUTH_URL}

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/frontend/package.json apps/frontend/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
# shared パッケージを先にビルドしないと next build が import 解決できない
RUN pnpm --filter @sanrentan-party/shared build \
    && pnpm --filter @sanrentan-party/frontend build

FROM node:24-bookworm AS runner
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/frontend ./apps/frontend
EXPOSE 3000
CMD ["pnpm", "--filter", "@sanrentan-party/frontend", "run", "start"]
