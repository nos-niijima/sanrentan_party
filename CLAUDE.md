# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要 — サンレンタン Party

サンレンタン (host-reveal パターンの推理パーティ) を LAN / Cloudflare Quick Tunnel で
すぐに遊ぶための小さな monorepo。`playtest-board` テンプレートから fork して、
プラットフォーム機能 (Game/GameSpec/Token/Feedback/Gap など) を削いだ単一ゲーム版。

## アーキテクチャの要点

- **通信は REST + ポーリングで完結（WebSocket は使わない）**。ターン制ゲームは状態が変わるのが
  「プレイヤー操作時」だけなので、アクションは REST（POST→新 state を返す）、他プレイヤーは
  SWR の短間隔ポーリング（対戦中 2.5s）で反映する。
- **GameSpec は engine module 内の固定値 (`SANRENTAN_SPEC`)**。サンレンタン単一前提のため
  Game/GameSpec モデルは DB に存在しない。
- **身元は cookie identity (HttpOnly `pb_uid`) + BFF 経由**。フロント Route Handler が
  `lib/server-api.ts` で cookie を発行・読取し、`x-user-*` ヘッダを付与して backend に転送する。
  backend は `UserContextMiddleware` で `x-user-*` → `req.user` を遅延 upsert する。
  クライアントは身元を偽装できない (cookie は JS 不可視)。

## モノレポ構成

pnpm workspaces + Turborepo。`apps/*` と `packages/*`。

- `apps/backend` — NestJS 11 / Prisma 7 (driver adapter pg) / PostgreSQL。port 3001、global prefix `api`。
- `apps/frontend` — Next.js 15 App Router / React 19 / SWR 2 / Tailwind 3。port 3000。
- `packages/shared` — `@sanrentan-party/shared`。両 app が `workspace:*` で参照する共有型。

スコープは `@sanrentan-party/*`。

### backend モジュール (`apps/backend/src/modules/`)

- `user` — 身元解決の単一責務。`getOrCreateUserByIdentity`（googleId→email→create の遅延 upsert）。
  サンレンタン Party では `googleId` は cookie token (anonymous id) を保持する列として使う。
- `room` — プレイセッション。`Room.state(JSON)` と `RoomPlayer(席)`。`engine` を使い、ポーリングで取得。
- `engine` — Host-Reveal パターンの状態機械 + `ranked-triple` 採点戦略。固定 `SANRENTAN_SPEC` を提供する。
- `health` — 流用。

共通: `common/decorators/current-user.decorator.ts`（`@CurrentUser()`）、
`common/guards/require-user.guard.ts`（未認証 401）、
`common/middleware/user-context.middleware.ts`。

### frontend (`apps/frontend/src/`)

- `lib/server-api.ts` — **BFF の唯一の egress**。`backendFetch`/`proxyJson` が cookie identity を
  発行 → `x-user-*` 付与 → backend 呼び出し。Route Handler からのみ import すること。
- `lib/api.ts` — クライアント側。`INTERNAL_API='/api'` と SWR `fetcher`。ブラウザは同一オリジンの
  `/api/*` のみ叩く（`x-user-*` をクライアントで付けない）。
- `app/api/**/route.ts` — BFF。すべて `proxyJson` 経由。Next 15 の `ctx.params` は `await` する。
- `app/(site)/page.tsx` — トップ (「卓を立てる」CTA)。`app/rooms/[id]` — プレイ画面 (2.5s ポーリング)。
- `app/rooms/[id]/share/page.tsx` — 大画面ドラマティック発表。`app/preview/sanrentan/` — 開発プレビュー。
- `components/games/sanrentan/` — サンレンタンの UI 一式 (Host / Predict / Result / Join 等)。
- `hooks/useRoom.ts` — ルームの SWR ポーリング + act/join。

## データモデル (Prisma)

`User` / `Room` / `RoomPlayer` のみ。規約: uuid `@id`、PascalCase の `@@map`、
FK と絞り込み列に `@@index`、子 FK は `onDelete: Cascade`
（例外: **`RoomPlayer.userId` は `SetNull`** で席履歴を残す）。
生成先 `apps/backend/src/generated/prisma`（driver adapter ゆえクエリエンジンバイナリ不要）。
**migrations はリポジトリ作成時には未生成**。初回セットアップ時に
`pnpm db:migrate` (= `prisma migrate dev --name init`) で 1 から作る。

## 開発コマンド

```bash
pnpm install
docker compose up -d postgres        # 5433->5432
pnpm db:migrate                       # 初回は --name init を聞かれる
pnpm dev                              # turbo: backend(3001) + frontend(3000)
./start.command                       # ダブルクリックで上記を一括起動 (LAN プレイ用)
./share.command                       # 同上 + Cloudflare Quick Tunnel で公開
```

検証・ビルド・テスト:

```bash
pnpm check-errors                     # 両 app の tsc + build + backend jest
pnpm build                            # turbo run build（shared→backend/frontend）
pnpm --filter @sanrentan-party/backend test                       # backend 全テスト (jest)
pnpm --filter @sanrentan-party/backend exec tsc --noEmit          # backend 型チェック
pnpm --filter @sanrentan-party/frontend exec tsc --noEmit         # frontend 型チェック
```

## 環境変数

- backend: `apps/backend/.env`（`apps/backend/.env.example` 参照）。`DATABASE_URL`, `PORT`, `CORS_ORIGIN`。
- frontend: `apps/frontend/.env.local`（`.env.local.example` 参照）。`BACKEND_API_URL` のみ。

## 規約

- `_DISABLED` サフィックスで一時無効化。`construction/`（設計）・`specs/`（要件→受入）ディレクトリ。
- backend tsconfig は `strictNullChecks:false`。frontend は `next.config.js` で
  `ignoreBuildErrors:false`（= 半端な削除は build を壊す。削除はクリーンに）。
- `@Body()` の DTO は共有 interface を直接使う（class-validator クラスは導入しない）。

## 公開フロー

`./share.command` を実行すると `pnpm dev` + Cloudflare Quick Tunnel が立ち上がり、
`https://<random>.trycloudflare.com` を共有すれば誰でも遊べる。URL は起動ごとに変わる。
終了は Ctrl+C (trap で全部片付ける)。
