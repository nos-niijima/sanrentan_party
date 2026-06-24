# サンレンタン Party

ホストのお題に 1〜3 着を予想する推理パーティ「サンレンタン」を、自分の Mac で立てて
LAN や Cloudflare Quick Tunnel 経由で誰でも遊べるようにする小さなアプリ。

> playtest-board (多テナント型プレイテスト基盤) から サンレンタン だけを切り出した
> standalone 版。1 ゲーム専用なので構造が単純で、起動も `./share.command` 1 発で済む。

---

## 必要なもの

| | 何 | インストール |
|---|---|---|
| 必須 | macOS / Linux (zsh/bash) | — |
| 必須 | Node.js 22+ | `brew install node@22` or [nodejs.org](https://nodejs.org) |
| 必須 | pnpm 10+ | `npm install -g pnpm` |
| 必須 | Docker Desktop (Postgres 起動用) | [docker.com](https://www.docker.com/products/docker-desktop) |
| 公開時 | cloudflared (Quick Tunnel 用) | `brew install cloudflared` |

> `start.command` / `share.command` は macOS の Finder からダブルクリックで起動できる。

---

## セットアップ (初回のみ)

```bash
git clone https://github.com/nos-niijima/sanrentan_party.git ~/Project/sanrentan_party
cd ~/Project/sanrentan_party

# 1. 依存インストール
pnpm install

# 2. 環境変数ファイルを用意 (中身はそのままで動く)
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.local.example apps/frontend/.env.local

# 3. Postgres を起動 (Docker が動いている必要あり)
docker compose up -d postgres

# 4. DB スキーマを生成 ("init" など適当な名前を聞かれる)
pnpm db:migrate
```

これで準備完了。`.env` の中身はローカル想定 (`localhost:5433` に sanrentan_party DB)
なので、デフォルト値のまま動く。

> 既に過去バージョンを動かしている場合: ホストの「お題プリセット保存」機能を追加した
> ため、再度 `pnpm db:migrate` を流すと差分マイグレーション (`add_preset`) が適用される。

---

## 遊び方

### A. ローカル / 同じ Wi-Fi 内 (LAN プレイ)

```bash
./start.command          # ダブルクリックでも可
# or
pnpm dev
```

- 自分の Mac: `http://localhost:3000`
- 同じ Wi-Fi のスマホ: `http://<Mac の LAN IP>:3000`
  (Mac の IP は「システム設定 → ネットワーク」または `ipconfig getifaddr en0` で確認)

### B. 出先 / 別ネットワークの人と遊ぶ (Cloudflare Quick Tunnel)

```bash
./share.command          # ダブルクリックでも可
```

- 自動で `pnpm dev` + `cloudflared tunnel` が立ち上がる
- ターミナルに `https://<random>.trycloudflare.com` が出る → このリンクを共有
- 全員が同じ URL を開けばどこからでも参加可能
- リンクは起動するたびに変わる (固定 URL が欲しい場合は cloudflared の named tunnel に切り替え)
- 終了は `Ctrl+C` (内部で trap が pnpm dev / cloudflared / caffeinate を停止)

### ホストと参加の流れ

1. **ホスト**: トップで「ホストで卓を立てる」→ 卓名を入力 →「この卓をひらく」
2. **ホスト**: 卓画面で「招待リンクをコピー」を押してプレイヤーに送る
3. **プレイヤー**: 招待リンクを開き、表示名を入れて「卓に入る」
4. **ホスト**: お題と選択肢 (3 個以上) を入力 → 倍率を選んで出題
5. **プレイヤー**: 1〜3 着を予想して提出
6. **ホスト**: 正解の順位を埋めて「結果を発表する」
7. **大画面** (`/rooms/<id>/share`) でドラマティックに 1 位から発表 → スコア更新

---

## 開発コマンド

```bash
pnpm dev                                              # backend(3001) + frontend(3000) 同時起動
pnpm check-errors                                     # tsc + build + jest を一括チェック (推奨ゲート)
pnpm --filter @sanrentan-party/backend test           # backend 全テスト
pnpm --filter @sanrentan-party/backend exec tsc --noEmit
pnpm --filter @sanrentan-party/frontend exec tsc --noEmit
pnpm db:studio                                        # Prisma Studio で DB を GUI で見る
pnpm db:migrate                                       # 新しい migration を作成
docker compose down                                   # Postgres を停止 (データは保持)
docker compose down -v                                # Postgres + データボリュームごと削除
```

---

## ディレクトリ構造

```
sanrentan_party/
├── apps/
│   ├── backend/                  # NestJS 11 + Prisma 7 (port 3001, /api prefix)
│   │   ├── prisma/schema.prisma  # User / Room / RoomPlayer の 3 model
│   │   └── src/modules/
│   │       ├── room/             # 卓作成・参加・出題・予想・公開
│   │       ├── engine/           # サンレンタン採点ロジック (役判定)
│   │       ├── user/             # cookie identity (pb_uid HttpOnly)
│   │       └── health/
│   └── frontend/                 # Next.js 15 + SWR + Tailwind (port 3000)
│       └── src/
│           ├── app/(site)/       # トップ画面
│           ├── app/rooms/        # /rooms/new + /rooms/[id] + /rooms/[id]/share
│           ├── app/api/          # BFF Route Handler (cookie → x-user-* 付与して backend へ)
│           └── components/games/sanrentan/  # HostScreen / PredictScreen / ResultScreen 等
├── packages/shared/              # @sanrentan-party/shared — Room/RoomPlayer 型・役定数
├── construction/                 # 設計 .dc.html + frame JSON + wiring manifest
├── docker-compose.yml            # Postgres 15-alpine (port 5433)
├── start.command                 # LAN 起動 (Finder ダブルクリック対応)
├── share.command                 # Cloudflare Quick Tunnel 起動
└── CLAUDE.md                     # AI assistant 向けプロジェクト概観
```

---

## アーキテクチャの要点

- **REST + ポーリング** (WebSocket なし)。ターン制なのでアクションは POST、他プレイヤーは
  SWR の短間隔ポーリング (対戦中 2.5s) で同期。
- **身元は cookie identity** (`pb_uid` HttpOnly cookie)。ログイン UI なし、初回アクセス時に
  サーバが cookie を発行する。BFF (Next.js Route Handler) が cookie → `x-user-*` ヘッダに
  変換して backend へ転送するので、**クライアントは身元を偽装できない**。
- 詳細は `CLAUDE.md` を参照。

---

## トラブルシューティング

| 症状 | 原因 / 対処 |
|---|---|
| `docker compose up` で失敗 | Docker Desktop が起動していない。アプリを起動してから再実行。 |
| `Port 3000 already in use` | 他の Next.js dev が動いている。`lsof -ti:3000 \| xargs kill` で解放。 |
| `Port 3001 already in use` | 他の backend / NestJS が動いている。`lsof -ti:3001 \| xargs kill`。 |
| `Port 5433 already in use` | 他の Postgres が 5433 を使っている。`docker compose.yml` の port を変更 + `apps/backend/.env` の `DATABASE_URL` も合わせて変更。 |
| `pnpm db:migrate` が失敗 | Postgres コンテナが起動しているか確認 (`docker compose ps`)。`postgres` の status が `running (healthy)` になるまで数秒待つ。 |
| share.command で URL が出ない | `cloudflared` が未インストール。`brew install cloudflared` 後に再実行。 |
| 卓に入れない / 表示名が変わらない | ブラウザの cookie がブロックされている可能性。HTTPS (Quick Tunnel) で開き直すか、cookie 設定を確認。 |
| 大画面の動きが固まる | frontend が dev mode の場合、HMR で稀に state がリセットされる。ブラウザをリロード。 |

DB を初期化してやり直したい時:

```bash
docker compose down -v       # ボリュームごと削除
docker compose up -d postgres
pnpm db:migrate              # 新しく init
```

---

## 謝辞

このリポジトリは [`playtest-board`](https://github.com/) (多テナント型プレイテスト基盤) から
サンレンタン 1 ゲームのみを切り出した standalone 版。同じ Mac で気軽に立てる用途に最適化済み。
