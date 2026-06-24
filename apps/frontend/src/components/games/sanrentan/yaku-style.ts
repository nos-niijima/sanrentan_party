// サンレンタン 役名 → 表示スタイル（DRY 集約点）
// ─────────────────────────────────────────────────────────────────────────────
// 役名 string keys は backend engine (apps/backend/src/modules/engine/ranked-triple.ts
// LABELS) と同期している必要がある。今後役を追加する時は engine 側と同時にこのファイルを更新。
//
// 視覚的コンテキストごとにパレットが異なるため 2 つの map を export している:
//   - YAKU_STYLE_PROJECTOR: 大画面共有 (/rooms/:id/share) の払戻カード右上の
//                          役名ピル。視認性最優先の濃い色。
//   - YAKU_STYLE_PILL:     ホスト管理画面 (HostScreen) のミニランキング行の
//                          役名ピル。ライト/小さめの淡色。
//
// 両 map に同じ役名 key が必須。新規役を増やす場合は両方更新する (1 箇所漏れ
// = unknown 役が default fallback に落ちる)。

export type YakuStyle = { color: string; bg: string };

// --- プロジェクタ (share/page.tsx) 用の濃いパレット ---------------------------
// 旧 share/page.tsx 内 YAKU_STYLE と同値（移植時に色を変えない）。
export const YAKU_STYLE_PROJECTOR: Record<string, YakuStyle> = {
  サンレンタン: { bg: '#C8392F', color: '#FFF7EA' },
  サンレンプク: { bg: '#E0A24E', color: '#5A3210' },
  ニレンタン:   { bg: '#4E6E8E', color: '#FFF7EA' },
  プクプク:     { bg: '#8A6A47', color: '#FFF7EA' },
  タン:         { bg: '#EFE2C6', color: '#6B4F3A' },
  ハズレ:       { bg: '#EFE2C6', color: '#6B4F3A' },
};

const PROJECTOR_FALLBACK: YakuStyle = { bg: '#EFE2C6', color: '#6B4F3A' };

export function yakuStyleProjector(hand: string): YakuStyle {
  return YAKU_STYLE_PROJECTOR[hand] ?? PROJECTOR_FALLBACK;
}

// --- HostScreen ミニランキング用の淡パレット --------------------------------
// 旧 HostScreen.tsx 内の三項分岐と同じ視覚結果を保つ。
// サンレンタン だけ強調色、ハズレ は muted、他役は generic な淡褐色。
// (役 4 種を 1 つに丸めるのは設計簡略。今後役ごとに区別したい場合は別タスクで)
const PILL_DEFAULT: YakuStyle = { color: '#6B4F3A', bg: '#F1E7D3' };
const PILL_HAZURE:  YakuStyle = { color: '#8A7A60', bg: '#EFE2C6' };

export const YAKU_STYLE_PILL: Record<string, YakuStyle> = {
  サンレンタン: { color: '#C8392F', bg: '#FBE3DF' },
  サンレンプク: PILL_DEFAULT,
  ニレンタン:   PILL_DEFAULT,
  プクプク:     PILL_DEFAULT,
  タン:         PILL_DEFAULT,
  ハズレ:       PILL_HAZURE,
};

export function yakuStylePill(hand: string): YakuStyle {
  return YAKU_STYLE_PILL[hand] ?? PILL_DEFAULT;
}
