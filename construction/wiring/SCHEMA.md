# UI-Wiring Manifest (schema)

各画面の UI 要素が backend データ or user action に「接続されているか」を宣言する
manifest。`construction/wiring/<screenId>.wiring.json` として 1 画面 1 ファイル。

このマニフェストは **死に UI (押しても何も起きない / placeholder のまま) の混入を防ぐ
ためのゲート** であり、CI (`pnpm check:wiring`) が形式不備を検知する。

---

## wiring.json schema

```jsonc
{
  "screen": "<screenId>",              // 画面ID。design/screenshots/pixel-diff の frameId と同じ。
  "implPath": "<.tsx 絶対パス>",       // 主実装ファイル（screen の入口コンポーネント）。
  "elements": [
    {
      "selector": "<人間可読 identifier>",
                                       // role / aria-label / visible text / data-testid 等。
                                       // Playwright/test 側で再現可能な文字列を推奨。
      "kind": "input | button | link | display | toggle | nav",
                                       // input: <input>/<textarea>/contentEditable
                                       // button: <button> / role=button
                                       // link: <a> / next/link（同タブ遷移 含む）
                                       // display: 動的データ表示 (text/number/badge/list)
                                       // toggle: 状態切替 (tab / accordion / collapsible)
                                       // nav: 遷移トリガ（router.push 含む）
      "wiredTo": "<配線先>",
                                       // 形式は以下のいずれか:
                                       //   backend.<Model>.<field>      DB 由来データ表示
                                       //   backend.<action>             POST/PATCH 等で観測可能変化
                                       //   client.<event>               UI state 切替 + visible feedback
                                       //   navigate(<route>)            画面遷移
                                       //   clipboard.<contents>         クリップボード書込
                                       //   none                         alive=false の時に使う
      "alive": true | false,           // 「user が触って意味のある反応がある」なら true。
                                       // 単なる装飾/未配線/固定 mock は false。
      "decorative": "<理由>",          // alive=false の場合の理由（必須）。
                                       // 例: "design ref のみ", "未実装 placeholder",
                                       //     "固定サンプル値 (実 state からは derive しない)"
      "userTask": "<1文の目的>"        // この element で user が達成するタスク。
                                       // decorative=true なら省略可。
    }
  ]
}
```

---

## 判定ルール（実装者向け）

新規 UI 要素を追加・既存要素を編集する時は対応 wiring.json も更新する。判定は以下:

### kind 別 alive=true の条件

| kind     | alive=true の条件                                                      |
|----------|------------------------------------------------------------------------|
| input    | 値が backend に保存される（API 経由）か、明示的に user action の入力源 |
| button   | 押下で **観測可能な変化** がある（URL / clipboard / API / state+UI 変化） |
| link     | 別 route or 別 origin への有効な遷移先がある                           |
| display  | **動的データ** を表示している（backend or runtime state 由来）         |
| toggle   | UI state を切り替え、視覚にフィードバックされる                        |
| nav      | router.push / Link で別画面へ遷移する                                  |

### alive=false に該当するパターン

- **未配線 mock**: 「あとで実装」「とりあえず置いた」placeholder。
- **固定サンプル値の display**: backend からは derive されない literal（例:「3レース終了」固定）。
- **decorative element**: design 由来の装飾 (status bar 9:41, 電池アイコン, アバター文字)。
- **UI state のみで保存されない input**: 入力しても submit / persistence が無い。
- **未実装の onClick (no-op)**: 「プリセット新規登録」など空ハンドラ。

alive=false の element は MUST `decorative` フィールドに理由を記述する。理由が
空 (or 欠落) の場合 `check:wiring` が exit 1。

### userTask の書き方

- 動詞始まりの1文。「<元状態> から <user action> して <観測可能結果> を得る」を圧縮した形。
- 例: 「卓に入場する」「正解を公開して締め切る」「招待リンクをクリップボードへコピー」
- decorative なら省略可（空文字 or 省略フィールド）。

---

## CI ゲート

- `pnpm check:wiring` (= `node scripts/check-wiring.mjs`)
- 全 `construction/wiring/*.wiring.json` を読み、以下を検査:
  - `alive: false` の各 element が non-empty な `decorative` を持つこと
  - 不備があれば exit 1 + 該当 element を出力
  - 全 OK なら exit 0
- check:wiring は CI で `check-errors` と並列に動かすゲート扱い。

---

## 追加時のチェックリスト

新規 UI 要素を追加する PR では以下を実施:

1. 該当 screen の `construction/wiring/<screenId>.wiring.json` の `elements` に追記
2. `kind` / `wiredTo` / `alive` / `userTask` を上記ルールで判定
3. `alive: false` にする場合は `decorative` に理由を明記
4. `pnpm check:wiring` でローカル検証
5. 「死に UI を意図的に置く」場合は理由をコードコメントにも残す（design ref / a11y filler 等）

新規 screen を追加する場合:

1. `construction/wiring/<screenId>.wiring.json` を新規作成
2. `screen` / `implPath` を埋める
3. 可視 element を網羅的に列挙
