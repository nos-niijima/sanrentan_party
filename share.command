#!/bin/bash
# サンレンタン Party を Cloudflare Quick Tunnel で公開する。
# ダブルクリック起動を想定。pnpm dev + cloudflared tunnel をまとめて立て、
# 出てきた https://〇〇.trycloudflare.com を共有すれば離れた端末でも遊べる。
# 終了は Ctrl+C (登録した trap が全プロセスを片付ける)。
set -uo pipefail
cd "$(dirname "$0")"

command -v cloudflared >/dev/null 2>&1 || {
  echo "✗ cloudflared が未インストールです。  brew install cloudflared  を実行してください。"
  exit 1
}

echo "▶ Postgres を起動..."
docker compose up -d postgres

echo "▶ Prisma migrate deploy..."
pnpm --filter @sanrentan-party/backend exec prisma migrate deploy

# Mac をスリープさせない (公開中の取りこぼし防止)。
caffeinate -dimsu &
CAF_PID=$!

# turbo dev を起動 (backend:3001 + frontend:3000)。
pnpm dev &
DEV_PID=$!

cleanup() {
  echo ""
  echo "▶ 終了処理: caffeinate / pnpm dev / cloudflared を停止します..."
  kill "$CAF_PID" 2>/dev/null || true
  kill "$DEV_PID" 2>/dev/null || true
  pkill -f "turbo run dev" 2>/dev/null || true
  pkill -f "next dev" 2>/dev/null || true
  pkill -f "nest start" 2>/dev/null || true
  pkill -f "cloudflared tunnel" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# frontend (Next.js) が立ち上がるのを待ってからトンネルを開く。
echo "▶ frontend (localhost:3000) の起動を待ちます..."
for i in {1..40}; do
  if curl -sf -o /dev/null "http://localhost:3000"; then
    echo "  ✓ 起動を確認しました ($i 回目)"
    break
  fi
  sleep 1
done

echo "▶ Cloudflare Quick Tunnel を起動..."
LOG=$(mktemp)
cloudflared tunnel --url "http://localhost:3000" --no-autoupdate > "$LOG" 2>&1 &
CF_PID=$!

URL=""
for i in {1..30}; do
  URL=$(grep -Eo 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1)
  [ -n "$URL" ] && break
  sleep 1
done

echo ""
echo "============================================================"
if [ -n "$URL" ]; then
  echo "  公開 URL (このリンクを共有してください):"
  echo ""
  echo "      $URL"
  echo ""
  echo "  ・このリンクは起動するたびに変わります"
  echo "  ・終了するには Ctrl+C"
else
  echo "  URL の取得に失敗しました。ログ: $LOG"
fi
echo "============================================================"

wait "$CF_PID"
