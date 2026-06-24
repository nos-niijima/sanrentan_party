# Dead UI Triage Report

> 作成日: 2026-06-24
> 対象: construction/wiring/*.wiring.json (9 画面) の alive=false 要素全 67 件

---

## サマリ

| カテゴリ | 件数 |
|---|---|
| 総 alive=false | 67 |
| true-decorative | 58 |
| mock-residual | 4 (要対応) |
| unimplemented-feature | 3 (判断要) |
| ok-keep | 2 |

---

## ok-keep 一覧 (2 件)

これらはユーザー明示「SAMPLE_PROMPT / CHOICES は例題として残す」の決定済み要素ではなく、
wiring.json 上で deviation 記録が明示されており、現段階で設計者が意図的に保留した要素。

> 注: SAMPLE_PROMPT / CHOICES 本体は alive=true のため本トリアージの対象外。
> ok-keep としてここに記録するのは、deviation メモが src コメントで "confirmed" と
> 明記されているため撤去・変更の判断をユーザーに委ねるもの。

| # | 画面 | selector |
|---|---|---|
| K-1 | result-reveal-shared-screen | `累積順位 sublabel '{roundCountLabel}' (literal '3レース終了')` |
| K-2 | result-reveal-shared-screen | `卓名 'たけの試遊卓' (literal)` |

K-1, K-2 は deviation 記録済み（source コメントで "confirmed by spec note" と明記）。
分類上は mock-residual と重複するが、意図的保留として ok-keep に分類した。
→ 下記 mock-residual でも別途記載する（判断を明確にするため）。

---

## true-decorative 一覧 (58 件)

これらはデータ接続を持たない設計表現・静的 UI であり、backend を変更しても動的化の必要はない。
削除不要。

### host-pose-preset (2 件)
- `search icon '🔍'` — 検索バーの絵文字アイコン
- `footer hint '「使う」を押すと出題エディタに読み込まれ、公開できます'` — 静的説明 literal

### host-question-create-new (5 件)
- `label 'お題'` — フィールド静的ラベル
- `label '選択肢（出走）'` — 選択肢ヘッダ静的ラベル
- `hint '3着まで選ぶので最低3つ'` — 静的ヒント
- `drag handle (3 lines)` — aria-hidden の DnD 視覚ハンドル（※ unimplemented-feature と兼記、下記 U-2 参照）
- `hint '公開後にあなたの1〜3着（正解）を選びます'` — CTA 下静的説明

### host-results-published (2 件)
- `完了バナー ✓ アイコン` — round.status='revealed' 時の静的完了アイコン
- `label 'このレースの結果'` — ランキングセクション静的見出し

### host-setup-init (8 件)
- `InviteCard label 'プレイヤーを招待'` — 静的ラベル
- `InviteCard badge 'あなた = ホスト'` — 常時表示の静的バッジ
- `InviteCard text 'リンクを知っている人が参加'` — 静的説明 literal
- `InviteCard text '途中参加もいつでもOK'` — 静的注釈
- `drag handle (3 horizontal lines)` — aria-hidden の DnD 視覚ハンドル（※ U-2 と同体）
- `text '3着まで選ぶので最低3つ'` — 静的ヒント
- `text '公開後にあなたの1〜3着（正解）を選びます'` — CTA 下静的説明
- `RankingPanel 見出し 'プレイヤーの累積順位'` — ランキング静的見出し
- `RankingPanel sublabel '（あなた＝出題者は対象外）'` — ホスト除外仕様の静的注釈

（9 件を 8 件と記載したが drag handle は U-2 に兼記）

### host-truth-pick (3 件)
- `instruction 'あなたの1〜3着を選ぶと予想が締め切られ、答え合わせされます'` — 静的操作説明
- `label 'あなたの本命（正解）'` — セクション静的ラベル
- `hint '締切後は変更不可'` — 静的注釈

### join-layout-b-admission (9 件)
- `text 'ADMISSION'` — チケット様式の固定ヘッダ literal
- `text '入場券'` — 固定タイトル literal
- `TicketHead 4-dot game icon grid` — ブランドアイコン(固定 SVG, aria-hidden)
- `badge '途中参加OK'` — 固定ポリシーバッジ（Room 属性ではなく常時表示）
- `label 'お名前（チーム名）をご記入ください'` — 入力フィールド静的ラベル
- `text 'カーソル (animation: sr-pulse)'` — カーソル視覚フィラー(aria-hidden)
- `text '例: チームたぬき'` — placeholder 例示テキスト
- `text '駒色をえらぶ'` — PalettePicker 見出し
- `Perforation (破線 + 切り抜き円)` — チケットミシン目装飾(aria-hidden)
- `text '予想はホストが正解を出すまで何度でも提出・修正できます'` — 固定注釈

（10 件。avatar 'た' は mock-residual M-1 に移動）

### predict-layout-a-list-badges (8 件)
- `status bar text '9:41'` — 設計モック時刻 literal（OS が実時刻を表示するため敢えて維持）
- `status bar battery/signal icons` — 設計モックアイコン(視覚のみ)
- `title 'サンレンタン' (DISPLAY font)` — アプリ名静的ブランディング
- `RaceBanner '⏳ ホスト確定待ち'` — open 中の静的注釈
- `instruction '出走から1着→2着→3着を予想'` — 静的操作説明
- `instruction sub 'タップで順に指定'` — 静的補足
- `BetSlipA header '三連単 馬券'` — 馬券スリップ静的ラベル
- `BetSlipA sub-header '確定まで買い直し可'` — 馬券スリップ静的注釈
- `BetSlipA ミシン目パンチ穴 / コーナー装飾` — 馬券レイアウト装飾
- `BetSlipA arrows '→' (separator)` — 1→2→3 着の視覚セパレータ

（10 件）

### result-layout-a-payout-ticket (7 件)
- `text 'ホストの本命'` — 表彰台ヘッダ静的キャプション
- `PodiumFull '🌹 1着' bow` — 1着強調の装飾（花飾り絵文字）
- `PodiumFull 表彰台 step blocks (1/2/3 数字)` — 表彰台高さ違いブロック装飾
- `役ヘッダ ★ medal アイコン` — 勲章アイコン視覚装飾
- `MyBetWithStamp 切り取り穴/破線 (装飾)` — 馬券レイアウト装飾
- `累積順位 見出し '部屋の累積順位'` — セクション静的見出し
- `footer '次のレースを待っています'` — 静的フッターメッセージ
- `footer subtext 'ホストが次のお題を公開します'` — 静的フッター補足
- `footer '待機中' バッジ (緑ドット pulse)` — 待機状態静的インジケータ（polling は別途継続）

（9 件）

### result-reveal-shared-screen (10 件)
- `AppIcon 4 ドットグリッド` — ブランドアイコン(固定 SVG)
- `title 'サンレンタン'` — アプリ名静的ブランディング
- `badge '画面共有中 ・ ホストの画面' (赤ドット付き)` — share page 常時表示静的バッジ
- `見出し '— 正 解 発 表 —'` — 大見出し視覚演出 literal
- `BigPodium 表彰台 step blocks (1/2/3 数字)` — 表彰台ブロック装飾
- `BigPodium ★ 金メダル + 赤/金 リボン(1着のみ)` — 1着強調の装飾
- `BigPodium 旗ポール (corner flag)` — コーナー旗装飾
- `見出し 'このレースの払戻'` — 払戻セクション静的見出し
- `subtext '成立は最高位の役ひとつだけ'` — ルール説明静的注釈
- `累積順位 見出し '累積順位'` — 累積順位パネル静的見出し
- `footer 'ホストが次のお題を準備しています…' + 3 ドット` — ホスト操作待ち静的注釈
- `footer subtext 'プレイヤーは自分の端末で次の予想を待ちましょう'` — 視聴者向け静的注釈

（12 件。`卓名 'たけの試遊卓'` と `累積順位 sublabel '3レース終了'` は mock-residual M-3/M-4 に分類）

---

## mock-residual 一覧 (4 件、要対応)

backend に対応するデータが存在しない、または固定値が事実として誤る可能性のある要素。

### M-1: join-layout-b-admission / `avatar 'た' (ホスト頭文字)`
- **現在の表示**: 固定文字 'た'（設計 dc.html 由来。ホスト名の頭文字を動的化していない）
- **問題**: ホスト名が変わっても常に 'た' が表示される。ゲストユーザーはホストを誤認しうる
- **接続先案**: `backend.RoomPlayer` のホスト席の `name.slice(0,1)` または aria-hidden を維持して視覚的に存在を消す
- **推奨**: `aria-hidden` なら真の装飾として許容可。ただし今は aria-hidden とだけ書かれており、値が固定 'た' のままなのがレビュー要因

### M-2: predict-layout-a-list-badges / `status bar text '9:41'`
- **現在の表示**: 固定モック時刻 '9:41'
- **問題**: 実アプリに表示されるとユーザーが混乱する可能性（OS の実時刻と並ぶ）。wiring の decorative 理由に「OS が時刻を表示するため敢えて literal を維持」とあるが、ブラウザアプリには OS status bar がなく、この要素がそのまま DOM に残ると '9:41' が画面上に表示される
- **接続先案**: 要素自体を削除する / aria-hidden かつ視覚的に隠す / 実際に `new Date()` で動的表示する
- **推奨**: 削除または非表示化が最もシンプル

### M-3: result-reveal-shared-screen / `卓名 'たけの試遊卓' (literal)`
- **現在の表示**: 固定テキスト '**たけの試遊卓**'
- **問題**: backend の `Room` に `name` 列が存在しない（wiring に "deviation: backend に roomName 列が無いため" と明記）。undefined フォールバックとして設計 literal を貼る方針と記録されているが、他卓でも '**たけの試遊卓**' が表示され続ける
- **接続先案**: 1) Room に `name` 列を追加して動的化 / 2) 表示を削除して shortCode のみにする / 3) placeholder として `"試遊卓"` 等の汎用文字列にする
- **推奨**: 選択肢 2 または 3（schema 変更不要）。選択肢 1 は schema 拡張になるため要ユーザー判断

### M-4: result-reveal-shared-screen / `累積順位 sublabel '{roundCountLabel}' (literal '3レース終了')`
- **現在の表示**: 固定テキスト '**3レース終了**'（どのラウンドでも固定）
- **問題**: 第 1R 結果でも '**3レース終了**' と表示される。result-layout-a-payout-ticket の同性質 element（`累積順位 sublabel '{roundNo}レース終了'`）は **alive=true・動的配線済み** であるのに、share 画面のみが固定 literal のまま残っている
- **接続先案**: `backend.Room.state.history.length` → `${history.length}レース終了` (result-layout-a-payout-ticket と同じパターン)
- **推奨**: 動的化が必要。share 画面の `useRoom` hook はすでに `state.history` を持っているため工数は小さい

---

## unimplemented-feature 一覧 (3 件、判断要)

API または route handler が未実装で、onClick/href が no-op または未配線の要素。

### U-1: host-pose-preset / `button '＋ プリセットを新規登録'`
- **想定機能**: ホストが GameSpec に新規プリセットを追加登録する
- **現状**: onClick no-op。`backend.GameSpec.presets` への追加 API が未実装・未定
- **選択肢**:
  - A) 実装する（`PATCH /api/games/:id/spec` 等でプリセット追加エンドポイントを設ける）
  - B) UI を削除する（現フェーズでは不要なら撤去）
  - C) 後回し（no-op のまま残すが表示だけ維持）
- **推奨**: ユーザー判断を要する。「mock で表示しているものはなしにして」指示が適用されるなら B)

### U-2: host-setup-init / `drag handle (3 horizontal lines)` および host-question-create-new 同体
- **想定機能**: 選択肢の drag & drop 並べ替え
- **現状**: aria-hidden の視覚ハンドルのみ。並べ替え機能そのものが未配線
- **選択肢**:
  - A) 実装する（@dnd-kit 等で DnD を実装）
  - B) UI を削除する（ハンドル視覚を消し、並べ替えは削除ボタン+追加ボタンで代替）
  - C) 後回し（aria-hidden のまま装飾として残す）
- **推奨**: aria-hidden なので UX 影響は最小限。C) で許容するか B) でクリーンにするかはユーザー判断

### U-3: host-setup-init / `WalnutBar '‹' (back chevron)`
- **想定機能**: ウォルナットバーの戻るボタン（前の route へ navigate）
- **現状**: クリック挙動なし。route handler 未配線
- **選択肢**:
  - A) 実装する（`router.push('/browse')` 等を割り当て）
  - B) UI を削除する（chevron を表示しない）
  - C) 後回し（no-op のまま残す）
- **推奨**: 機能的に dead UI。「mock で表示しているものはなしにして」指示が適用されるなら A) または B)

---

## 分類根拠メモ

- **mock-residual と true-decorative の境界**: 固定値が「他インスタンスでも正しくあり続けるか」で判定した。
  - '9:41'・'たけの試遊卓'・'3レース終了' は他の部屋・他のラウンドで誤った値を表示するため mock-residual。
  - 'ADMISSION'・'入場券'・'三連単 馬券' は業種テーマの表現として全インスタンスで同一であるため true-decorative。
- **unimplemented-feature の抽出基準**: wiring に "onClick no-op" / "route handler 未配線" / "機能は未配線" と明記されているもの。
- **ok-keep の範囲**: ユーザー指示で SAMPLE_PROMPT / CHOICES のみ残す、とあるが、それらは alive=true のため本トリアージ外。ok-keep は deviation が source コメントで明示確認済みの M-3/M-4 の保留判断のみ。
