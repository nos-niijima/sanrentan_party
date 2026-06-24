#!/bin/bash
# サンレンタン Party をローカル (LAN) で起動する。
# ダブルクリック起動を想定。Postgres を起動 → migrate deploy → pnpm dev を実行。
# 終了は Ctrl+C (turbo dev を含む全プロセスをまとめて落とす)。
set -euo pipefail
cd "$(dirname "$0")"

echo "▶ Postgres を起動..."
docker compose up -d postgres

echo "▶ Prisma migrate deploy..."
pnpm --filter @sanrentan-party/backend exec prisma migrate deploy

echo "▶ pnpm dev (backend:3001 + frontend:3000)"
pnpm dev
