'use client';

/**
 * サンレンタン — 結果公開・画面共有 (プロジェクタ)
 *
 * /rooms/:id/share でホストが大画面共有用に開くページ。
 * GET /api/rooms/:id をポーリングして revealed 状態を表示する。
 * 閲覧専用 = 個別予想入力 UI は一切出さない。
 *
 * confirmed spec:
 *   - host=進行専任。「次のレースはホストも予想に参加します」は実装しない。
 *   - 「ホスト操作：次のお題を出す」はボタン表示のみ（ホスト管理画面へ遷移）。
 *
 * ─── リビール演出 (B 案) ──────────────────────────────────────────────────
 * 設計: construction/design/サンレンタン_結果発表_リビール演出.dc.html
 * server state machine: idle → buildup → done (via reveal action)
 * client overlay phases (timer 進行):
 *   idle (server idle/undefined): CTA「結果発表 ▶」を中央に表示
 *   buildup: vignette overlay + 表彰台 silhouette (?)
 *   reveal (client): T0=700ms → reveal=1 → +1700ms → reveal=2 → +1700ms → reveal=3
 *   scores  (client): cardsShown 1→4 (850ms 間隔)
 *   done (server done): confetti + payout/leaderboard + 「もう一度見る」+ ホストCTA
 *
 * 効果音は使用しない (Audio/AudioContext を一切呼ばない)。
 * インタラクションはネイティブ <button> のみ。
 */

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRoom } from '@/hooks/useRoom';
import { ApiError } from '@/lib/api';
import type {
  HostRevealAnnouncePhase,
  HostRevealPrediction,
  HostRevealState,
} from '@sanrentan-party/shared';
import { yakuStyleProjector } from '@/components/games/sanrentan/yaku-style';
// gateOf / GATES / LETTER_LABELS は shared.tsx に集約 (A-F display migration)。
// share/page.tsx は projector(大画面共有) 専用で別レイアウトだが、枠ラベル/色は
// プレイヤー端末と完全に一致させる必要があるため (= 同じ「A」が同じ色) 共通実装を再利用する。
import { gateOf as gateOfShared } from '@/components/games/sanrentan/shared';

// ─── デザイントークン ────────────────────────────────────────────────────────
const SANS = "'Noto Sans JP',sans-serif";
const SERIF = "'Noto Serif JP',serif";
const DISPLAY = "'Zilla Slab',serif";

// リビール演出のタイミング (設計 .dc.html の Component.start() と一致)
const REVEAL_T0_MS = 700;
const REVEAL_GAP_MS = 1700;
const CARD_INTERVAL_MS = 850;
const CARDS_INITIAL_DELAY_MS = 450; // reveal=3 から最初の card まで
const DONE_AFTER_CARDS_MS = 400; // 最後の card から done 遷移まで

const gateOf = gateOfShared;

// アバターカラー（席番号ベースで簡易色割り当て）
const AVATAR_COLORS = [
  '#B05A4E', '#C9A24B', '#4E6E8E', '#5E8463',
  '#6B4F3A', '#3E6F52', '#8A5A9E', '#C56A2C',
];
function avatarColor(seat: number) {
  return AVATAR_COLORS[seat % AVATAR_COLORS.length];
}

/** RoomPlayer.color が設定されていればそれを、無ければ seat ベースの既定色を返す。 */
function resolvePlayerColor(seat: number, color?: string): string {
  return color ?? avatarColor(seat);
}

const feltBg: React.CSSProperties = {
  background: '#3E6F52',
  backgroundImage:
    'radial-gradient(rgba(0,0,0,.10) 1px,transparent 1.2px),radial-gradient(rgba(255,255,255,.05) 1px,transparent 1.2px)',
  backgroundSize: '6px 6px,8px 8px',
};

// ─── Google Fonts ────────────────────────────────────────────────────────────
function GoogleFonts() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Noto+Serif+JP:wght@600;700&family=Zilla+Slab:wght@600;700&display=swap"
      />
    </>
  );
}

/** リビール演出用の keyframes。
 *  設計 .dc.html の <style> から srtPulse / srtGlow / srtRing を移植。
 *  + 派手化用 keyframes: srtSparkleFloat (背景キラキラ)。
 *  ※ srtFestiveBg (虹色グラデ overlay) と srtAuraPulse (中央光輪) は user 指摘で撤去済。
 *  すべて transition は 2s 以上 (epileptic 配慮: 5Hz 未満)。
 *  global stylesheet で 1 度だけ注入する。 */
function RevealKeyframes() {
  return (
    <style>{`
      @keyframes srtPulse{0%,100%{transform:scale(1);opacity:.55}50%{transform:scale(1.14);opacity:.12}}
      @keyframes srtGlow{0%,100%{box-shadow:0 0 0 0 rgba(236,194,62,0),0 6px 16px rgba(0,0,0,.3)}50%{box-shadow:0 0 28px 6px rgba(236,194,62,.55),0 6px 16px rgba(0,0,0,.3)}}
      @keyframes srtRing{0%{transform:translate(-50%,-50%) scale(.6);opacity:.8}100%{transform:translate(-50%,-50%) scale(1.8);opacity:0}}
      @keyframes srtSparkleFloat{0%,100%{transform:translateY(0) rotate(0deg);opacity:.55}50%{transform:translateY(-12px) rotate(180deg);opacity:1}}
    `}</style>
  );
}

// ─── アプリアイコン（4 ドットグリッド）────────────────────────────────────────
function AppIcon() {
  return (
    <div style={{
      width: 26, height: 26, borderRadius: 7, background: '#3E6F52',
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, padding: 5,
    }}>
      <div style={{ background: '#F1E7D3', borderRadius: '50%' }} />
      <div style={{ background: '#ECC23E', borderRadius: '50%' }} />
      <div style={{ background: '#C8392F', borderRadius: '50%' }} />
      <div style={{ background: '#F1E7D3', borderRadius: '50%' }} />
    </div>
  );
}

// ─── 大きな表彰台 (projector 用) ─────────────────────────────────────────────
/**
 * リビール演出対応:
 *   revealCount: 公開済みの順位数 (0,1,2,3)。0 はすべて silhouette ('?')、
 *   1 = 1着のみ公開、2 = 1着+2着、3 = 全公開。
 *   revealCount < 3 のときは中央 1着の金メダル/光輪を出さない (= まだ未公開)。
 *   各 tile は id=`srt-tile-${place}` を持ち、reveal アニメ (Web Animations API)
 *   のターゲットになる。
 */
function BigPodium({
  answer,
  choices,
  revealCount,
}: {
  answer: string[];
  choices: string[];
  revealCount: number;
}) {
  type PodiumItem = { place: 1 | 2 | 3; choice: string; h: number };
  // 表示順: 2着(左), 1着(中央), 3着(右)
  const order: PodiumItem[] = [
    { place: 2, choice: answer[1], h: 78 },
    { place: 1, choice: answer[0], h: 110 },
    { place: 3, choice: answer[2], h: 58 },
  ];

  return (
    <div style={{
      position: 'relative', borderRadius: 14,
      background: '#3E8E52',
      backgroundImage: 'repeating-linear-gradient(90deg,rgba(255,255,255,.05) 0 1px,transparent 1px 56px),repeating-linear-gradient(rgba(0,0,0,.05) 0 11px,rgba(255,255,255,.03) 11px 22px)',
      border: '1px solid #2C6E3E',
      boxShadow: 'inset 0 2px 8px rgba(0,0,0,.2)',
      padding: '18px 18px 0',
      marginBottom: 18,
    }}>
      {/* コーナー旗ポール */}
      <div style={{ position: 'absolute', top: 12, left: 14, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{ width: 6, height: 22, background: 'repeating-linear-gradient(#fff 0 6px,#2E2A24 6px 12px)' }} />
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 20 }}>
        {order.map(({ place, choice, h }, i) => {
          const revealed = revealCount >= place;
          const g = gateOf(choices, choice);
          const first = i === 1; // 1着は中央
          const chipSize = first ? 80 : (i === 0 ? 64 : 58);
          const chipRadius = first ? 16 : (i === 0 ? 14 : 13);
          const tileBg = revealed ? g.bg : '#2C4A39';
          const tileFg = revealed ? g.fg : '#6E9079';
          const tileBd = revealed ? (first ? '#E3B42A' : g.bd) : '#22402E';
          const labelText = revealed ? choice : '？？？';
          const labelColor = revealed ? '#FBF6EA' : '#6E9079';
          const tileGlyph = revealed ? g.n : '?';

          return (
            <div key={place} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: first ? 200 : 184 }}>
              {first && (
                <div style={{ position: 'relative', marginBottom: 8 }}>
                  {revealed && (
                    <div style={{
                      position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center',
                    }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%',
                        background: 'radial-gradient(circle at 38% 32%,#F6E0A0,#E3B42A 60%,#B98A1E)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        font: `700 16px ${DISPLAY}`, color: '#7A4A12',
                        boxShadow: '0 2px 4px rgba(0,0,0,.3),inset 0 0 0 2px rgba(255,255,255,.35)',
                      }}>★</div>
                      <div style={{ display: 'flex', gap: 18, marginTop: -4 }}>
                        <div style={{ width: 7, height: 16, background: '#C8392F', transform: 'rotate(18deg)' }} />
                        <div style={{ width: 7, height: 16, background: '#E3B42A', transform: 'rotate(-18deg)' }} />
                      </div>
                    </div>
                  )}
                  <div
                    id={`srt-tile-${place}`}
                    style={{
                      width: chipSize, height: chipSize, borderRadius: chipRadius,
                      background: tileBg,
                      border: `${first ? 4 : 3}px solid ${tileBd}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      font: `700 42px ${DISPLAY}`, color: tileFg,
                      boxShadow: revealed
                        ? '0 6px 12px rgba(0,0,0,.36),0 0 0 3px rgba(236,194,62,.35)'
                        : '0 6px 12px rgba(0,0,0,.36)',
                    }}
                  >
                    {tileGlyph}
                  </div>
                </div>
              )}
              {!first && (
                <div
                  id={`srt-tile-${place}`}
                  style={{
                    width: chipSize, height: chipSize, borderRadius: chipRadius,
                    background: tileBg,
                    border: `3px solid ${tileBd}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    font: `700 ${i === 0 ? 34 : 30}px ${DISPLAY}`, color: tileFg,
                    boxShadow: '0 4px 8px rgba(0,0,0,.32)',
                    marginBottom: 8,
                  }}
                >
                  {tileGlyph}
                </div>
              )}
              <span
                id={`srt-name-${place}`}
                style={{
                  font: `700 ${first ? 20 : 17}px ${SERIF}`,
                  color: labelColor, marginBottom: 8, textAlign: 'center',
                }}
              >
                {labelText}
              </span>
              <div style={{
                width: '100%', height: h, borderRadius: '10px 10px 0 0',
                background: first
                  ? 'linear-gradient(#F6E7B8,#E6CE86)'
                  : (i === 0 ? 'linear-gradient(#EDE0C4,#D7C49E)' : 'linear-gradient(#E8D2B0,#D2B584)'),
                border: `1px solid ${first ? '#D8BC74' : (i === 0 ? '#CBB489' : '#C3A576')}`,
                borderBottom: 'none',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                paddingTop: first ? 12 : (i === 0 ? 10 : 8),
                boxShadow: `inset 0 3px 0 rgba(255,255,255,${first ? '.6' : (i === 0 ? '.5' : '.45')})`,
              }}>
                <span style={{
                  font: `700 ${first ? 34 : (i === 0 ? 26 : 22)}px ${DISPLAY}`,
                  color: first ? '#9A7A2E' : '#7A6748',
                }}>
                  {place}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── プレイヤー別払戻カード ───────────────────────────────────────────────────
function PayoutCard({
  name, seat, prediction, choices, isWinner, playerColor, visible,
}: {
  name: string;
  seat: number;
  prediction: HostRevealPrediction;
  choices: string[];
  isWinner: boolean;
  /** RoomPlayer.color。任意。未設定なら seat → 既定色にフォールバック。 */
  playerColor?: string;
  /** リビール演出のカウントイン: false なら opacity:0 / translateY(14px) で隠す。 */
  visible: boolean;
}) {
  const pts = prediction.points ?? 0;
  const hand = prediction.hand ?? 'ハズレ';
  const initial = name.slice(0, 1);
  const color = resolvePlayerColor(seat, playerColor);
  const yakuStyle = yakuStyleProjector(hand);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 13,
      background: isWinner ? '#FFF6E8' : '#FBF6EA',
      border: isWinner ? '2.5px solid #E3B42A' : '1px solid #E3D4B8',
      borderRadius: 12, padding: '11px 14px',
      boxShadow: '0 3px 7px rgba(0,0,0,.14)',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(14px)',
      transition: 'opacity .35s ease,transform .35s cubic-bezier(.2,1.3,.4,1)',
    }}>
      {/* アバター */}
      <div style={{
        flex: 'none', width: 40, height: 40, borderRadius: '50%',
        background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        font: `700 17px ${SANS}`, color: '#fff',
        boxShadow: 'inset 0 -2px 3px rgba(0,0,0,.22)',
      }}>
        {initial}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
          <span style={{ font: `700 15px ${SANS}`, color: '#2E2A24' }}>{name}</span>
          {isWinner && (
            <span style={{ font: `700 11px ${SANS}`, color: '#FFF7EA', background: '#C8392F', padding: '3px 8px', borderRadius: 999 }}>
              レース勝者
            </span>
          )}
        </div>
        {/* 馬券チップ列 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {prediction.answer.map((c, i) => {
            const g = gateOf(choices, c);
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 6,
                  background: g.bg, border: `1.5px solid ${g.bd}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  font: `700 14px ${DISPLAY}`, color: g.fg,
                }}>
                  {g.n}
                </div>
                {i < prediction.answer.length - 1 && (
                  <span style={{ font: `700 12px ${DISPLAY}`, color: '#A89472' }}>→</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {/* 右側: 役名 + 点数 */}
      <div style={{ marginLeft: 'auto', textAlign: 'right', lineHeight: 1.05 }}>
        <div style={{
          font: `700 12px ${SANS}`,
          color: yakuStyle.color,
          background: yakuStyle.bg,
          padding: '4px 9px', borderRadius: 7, marginBottom: 4, whiteSpace: 'nowrap',
        }}>
          {hand}
        </div>
        <span style={{ font: `900 22px ${DISPLAY}`, color: '#2E2A24' }}>+{pts}</span>
      </div>
    </div>
  );
}

// ─── 累積順位リーダーボード（共有大画面用） ──────────────────────────────────
function ShareLeaderboard({
  players,
  scores,
  hostSeat,
  roundPts,
  cardsShown,
}: {
  players: Array<{ seat: number; name?: string; color?: string }>;
  scores: Record<string, number>;
  hostSeat: number;
  roundPts: Record<string, number>;
  /** リビール演出: 0..N の間、上から N 行ぶんだけ「今ラウンド分」を加算済みで表示する。
   *  N=0 のときは全員 pre 表示 (delta も非表示)。N=rows.length 以降は全員 post。 */
  cardsShown: number;
}) {
  // ベース: 各プレイヤーの「ラウンド前」点数を計算 (= scores - roundPts)。
  const allRows = players
    .filter((p) => p.seat !== hostSeat)
    .map((p) => {
      const seatKey = String(p.seat);
      const post = scores[seatKey] ?? 0;
      const delta = roundPts[seatKey] ?? 0;
      const pre = post - delta;
      return {
        seat: p.seat,
        name: p.name ?? `席${p.seat}`,
        pre,
        post,
        delta,
        color: p.color,
      };
    })
    .sort((a, b) => b.post - a.post);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {allRows.map((r, i) => {
        const rankBg = i === 0 ? '#E3B42A' : i === 1 ? '#C4C0B4' : i === 2 ? '#C8956A' : '#E0CFAD';
        const rankFg = i <= 2 ? '#fff' : '#8A7A60';
        // 上から cardsShown 行は加算済み、それ以下は pre 表示。
        const added = i < cardsShown;
        const displayPts = added ? r.post : r.pre;
        const showDelta = added && r.delta > 0;
        const color = resolvePlayerColor(r.seat, r.color);
        return (
          <div key={r.seat} style={{
            display: 'flex', alignItems: 'center', gap: 13,
            background: '#FBF6EA', border: '1px solid #E3D4B8',
            borderRadius: 13, padding: '13px 15px',
            boxShadow: '0 3px 7px rgba(0,0,0,.16)',
          }}>
            <span style={{
              flex: 'none', width: 34, height: 34, borderRadius: '50%',
              background: rankBg, color: rankFg,
              font: `700 18px ${DISPLAY}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: 'inset 0 -2px 3px rgba(0,0,0,.18)',
            }}>
              {i + 1}
            </span>
            <div style={{
              flex: 'none', width: 32, height: 32, borderRadius: '50%',
              background: color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              font: `700 14px ${SANS}`, color: '#fff',
              boxShadow: 'inset 0 -2px 3px rgba(0,0,0,.22)',
            }}>
              {r.name.slice(0, 1)}
            </div>
            <div style={{ minWidth: 0, lineHeight: 1.2 }}>
              <span style={{ font: `700 16px ${SANS}`, color: '#2E2A24' }}>{r.name}</span>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'right', lineHeight: 1 }}>
              <div style={{ font: `900 26px ${DISPLAY}`, color: '#2E2A24' }}>{displayPts}</div>
              {showDelta && (
                <span style={{ font: `600 12px ${SANS}`, color: '#3E8E52' }}>+{r.delta}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── 待機中表示（revealed 前） ────────────────────────────────────────────────
function WaitingScreen({ roomId }: { roomId: string }) {
  return (
    <div style={{ minHeight: '100vh', background: '#F1E7D3', display: 'flex', flexDirection: 'column', fontFamily: SANS }}>
      <GoogleFonts />
      <div style={{
        display: 'flex', alignItems: 'center', gap: 18, padding: '13px 26px',
        background: 'linear-gradient(#6B4F3A,#5A4226)',
        boxShadow: 'inset 0 -2px 4px rgba(0,0,0,.22)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <AppIcon />
          <span style={{ font: `700 17px ${DISPLAY}`, color: '#F4E7CF' }}>サンレンタン</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(0,0,0,.2)', padding: '6px 12px', borderRadius: 999 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E05B4E', boxShadow: '0 0 0 3px rgba(224,91,78,.3)', display: 'inline-block' }} />
          <span style={{ font: `700 12px ${SANS}`, color: '#F4E7CF' }}>画面共有中 ・ ホストの画面</span>
        </div>
        <a
          href={`/rooms/${roomId}`}
          style={{ marginLeft: 'auto', font: `600 12px ${SANS}`, color: '#EAD9BC', textDecoration: 'none' }}
        >
          ホスト管理に戻る
        </a>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', ...feltBg }}>
        <div style={{ textAlign: 'center', color: '#FBF6EA' }}>
          <div style={{ font: `700 22px ${SERIF}`, marginBottom: 12 }}>ホストの出題/正解公開を待っています</div>
          <div style={{ font: `500 14px ${SANS}`, color: '#CFE0D0' }}>正解が公開されると結果画面に切り替わります</div>
        </div>
      </div>
    </div>
  );
}

function RoomLoadErrorScreen({ error }: { error: Error | ApiError }) {
  const status = error instanceof ApiError ? error.status : undefined;
  const isNotFound = status === 404;
  const title = isNotFound ? 'この卓は存在しません' : '卓を読み込めませんでした';
  const detail = isNotFound
    ? '招待リンクが無効か、卓が削除された可能性があります。'
    : `通信エラーが発生しました。時間をおいて再度お試しください。${
        error.message ? `\n(${error.message})` : ''
      }`;
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px',
        textAlign: 'center',
        color: '#3a2a1a',
        background: '#F1E7D3',
        fontFamily: SANS,
      }}
    >
      <GoogleFonts />
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>{title}</div>
      <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', marginBottom: 24, color: '#6B4F3A' }}>
        {detail}
      </div>
      <Link
        href="/"
        style={{
          display: 'inline-block',
          padding: '10px 20px',
          background: '#6B4F3A',
          color: '#fff',
          borderRadius: 6,
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        /browse に戻る
      </Link>
    </div>
  );
}

// ─── メイン Projector コンポーネント ─────────────────────────────────────────
export default function ProjectorSharePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { view, loading, error, act } = useRoom(id);

  /**
   * client-side reveal phase. server の announce.phase が 'buildup' の間、
   * timer chain で reveal=1→2→3、scores cards 1→4 を進める。
   * 'done' 到達時に server に announceFinish を投げる (副作用 1 回限り)。
   */
  const [clientPhase, setClientPhase] = useState<HostRevealAnnouncePhase>('idle');
  const [revealStep, setRevealStep] = useState(0); // 0..3
  const [cardsShown, setCardsShown] = useState(0); // 0..rows.length
  const [confettiCount, setConfettiCount] = useState(0); // confetti キー (replay で再発火)
  // burst 効果のターゲット。place=1/2/3 (reveal step)、nonce は replay 時の再発火用。
  // useEffect は [burstSignal] 依存なので、同じ place でも nonce 違いで再発火する。
  // ★ 以前は単一 number `burstTarget` を `n + 100` で unique 化していたが、
  //   burstTarget > 3 が effect の guard `> 3 return` で弾かれ、replay の burst
  //   (flash/shake/rays/ring/coins/sparks) が完全に死ぬバグの原因だった。
  const [burstSignal, setBurstSignal] = useState<{ place: 0 | 1 | 2 | 3; nonce: number }>({
    place: 0,
    nonce: 0,
  });

  // 走行中タイマーの集中管理 (replay / unmount でまとめて clear)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearAllTimers = useCallback(() => {
    for (const t of timersRef.current) clearTimeout(t);
    timersRef.current = [];
  }, []);

  // replay 中フラグ。server polling は state='done' のままなので、
  // 何もしないと「server=done & client !== done」useEffect が即 done に snap back し replay を殺す。
  // handleReplay で true に立て、replay 完走 (client=done) で false に戻す。
  const isReplayingRef = useRef(false);

  const scheduleTimer = useCallback((ms: number, fn: () => void) => {
    const t = setTimeout(() => {
      fn();
    }, ms);
    timersRef.current.push(t);
  }, []);

  // unmount で全タイマー解放
  useEffect(() => () => clearAllTimers(), [clearAllTimers]);

  /** タイマー連鎖を組む (idle → buildup 後に呼ぶ)。
   *  cardsTotal = リーダーボード/PayoutCard 表示行数 (= プレイヤー数, ホスト除く)。
   *  すべての timer は timersRef に積み、replay/unmount で clear される。 */
  const startTimerChain = useCallback((cardsTotal: number) => {
    clearAllTimers();
    setRevealStep(0);
    setCardsShown(0);
    setClientPhase('buildup');
    // T0: reveal=1
    scheduleTimer(REVEAL_T0_MS, () => {
      setRevealStep(1);
      setBurstSignal((s) => ({ place: 1, nonce: s.nonce + 1 }));
      setClientPhase('reveal');
    });
    // T0 + GAP: reveal=2
    scheduleTimer(REVEAL_T0_MS + REVEAL_GAP_MS, () => {
      setRevealStep(2);
      setBurstSignal((s) => ({ place: 2, nonce: s.nonce + 1 }));
    });
    // T0 + GAP*2: reveal=3
    scheduleTimer(REVEAL_T0_MS + REVEAL_GAP_MS * 2, () => {
      setRevealStep(3);
      setBurstSignal((s) => ({ place: 3, nonce: s.nonce + 1 }));
    });
    // scores phase entry
    scheduleTimer(REVEAL_T0_MS + REVEAL_GAP_MS * 3, () => {
      setClientPhase('scores');
    });
    // cards 1..cardsTotal (実プレイヤー数で stop)
    const safeTotal = Math.max(0, cardsTotal);
    for (let k = 1; k <= safeTotal; k++) {
      scheduleTimer(
        REVEAL_T0_MS + REVEAL_GAP_MS * 3 + CARDS_INITIAL_DELAY_MS + (k - 1) * CARD_INTERVAL_MS,
        () => setCardsShown(k),
      );
    }
    // done 遷移
    scheduleTimer(
      REVEAL_T0_MS + REVEAL_GAP_MS * 3 + CARDS_INITIAL_DELAY_MS + safeTotal * CARD_INTERVAL_MS + DONE_AFTER_CARDS_MS,
      () => {
        setClientPhase('done');
        setConfettiCount((n) => n + 1);
      },
    );
  }, [clearAllTimers, scheduleTimer]);

  // server.announce.phase に追従:
  //   server='buildup' & client='idle' → timer chain 起動 (再 mount/直リンク対応)
  //   server='done' & client !== 'done' → 即 done 表示 (再 mount/replay 完了後 polling)
  //   server='idle' → client idle に戻す
  const serverAnnounce = (view?.room?.state as HostRevealState | undefined)?.round?.announce;
  const serverPhase: HostRevealAnnouncePhase | undefined = serverAnnounce?.phase;

  // cardsTotal を polling 反映するため ref で参照する (timer chain 構築時の closure を更新)
  const playersHostExcluded = useMemo(() => {
    if (!view) return [];
    const state = view.room.state as unknown as HostRevealState;
    const hostSeat = state.hostSeat ?? 0;
    return view.players.filter((p) => p.seat !== hostSeat);
  }, [view]);
  const cardsTotal = playersHostExcluded.length;

  // server -> client phase 同期
  useEffect(() => {
    if (!serverPhase) return;
    if (serverPhase === 'buildup' && clientPhase === 'idle') {
      // server が buildup に入ったら client timer chain を起動
      startTimerChain(cardsTotal);
    } else if (serverPhase === 'done' && clientPhase !== 'done') {
      // replay 中は server polling に反応しない (= done に snap back させない)。
      // 反応すると handleReplay 直後にこの分岐が走り、buildup → 即 done で演出が殺される。
      if (isReplayingRef.current) return;
      // server done なら即 done 表示 (他端末からも揃える)
      clearAllTimers();
      setRevealStep(3);
      setCardsShown(cardsTotal);
      setClientPhase('done');
      // confetti を 1 度だけ発火 (再mount時の二重発火を避けるため confettiCount を進める)
      setConfettiCount((n) => (n === 0 ? 1 : n));
    } else if (serverPhase === 'idle' && clientPhase !== 'idle') {
      clearAllTimers();
      setRevealStep(0);
      setCardsShown(0);
      setClientPhase('idle');
    }
  }, [serverPhase, clientPhase, cardsTotal, startTimerChain, clearAllTimers]);

  // client が done 遷移したら、server にも announceFinish を送る (ホスト操作)
  // 注意: server が既に done なら server side で 409 が返るが act() は throw する → catch で握りつぶす
  const announceFinishSentRef = useRef(false);
  useEffect(() => {
    if (clientPhase !== 'done') {
      announceFinishSentRef.current = false;
      return;
    }
    // replay 完走で done に戻ったらフラグを解除 (= 以降は server polling に通常通り追従)
    isReplayingRef.current = false;
    if (announceFinishSentRef.current) return;
    if (serverPhase === 'done') return; // 既に done なら投げない
    announceFinishSentRef.current = true;
    act({ action: 'announceFinish' }).catch(() => {
      // 409 (already done) などは harmless。視聴体験を壊さない。
      announceFinishSentRef.current = false;
    });
  }, [clientPhase, serverPhase, act]);

  // burst (光輪/フラッシュ/スパーク) — burstSignal が変わったら DOM に animate を流す
  // place が 1/2/3 のときだけ発火。nonce 違いで同じ place でも replay 時に再発火する。
  useEffect(() => {
    if (burstSignal.place < 1 || burstSignal.place > 3) return;
    burstEffects(burstSignal.place);
  }, [burstSignal]);

  // ─── ハンドラ ─────────────────────────────────────────────────────────────
  const handleAnnounceStart = useCallback(() => {
    // server に announceStart を投げる。成功すると polling で serverPhase が buildup になり
    // 上の useEffect が startTimerChain を呼ぶ。
    act({ action: 'announceStart' }).catch(() => {
      // 失敗時 (409 など) は何もしない (既に進行中の可能性)。視覚的には変わらない。
    });
  }, [act]);

  const handleReplay = useCallback(() => {
    // client side replay: 初回 reveal と完全に同じ演出連鎖を再生する。
    // 設計原則: handleReplay は startTimerChain に委譲し、コードを複製しない。
    //
    // ★ isReplayingRef を立てておかないと、直後に server polling 同期 useEffect が
    //   「server=done & client !== done」を検知して即 done に戻し replay が殺される。
    isReplayingRef.current = true;
    // server への二重 announceFinish 送信を防ぐため reset (replay 完走で done 到達時に再評価)。
    announceFinishSentRef.current = false;
    // confetti を unmount して再発火可能な状態に戻す。
    // (startTimerChain 完走時に setConfettiCount(n => n + 1) で再 mount される)
    setConfettiCount(0);
    // burstSignal も初期に戻す (place=0 にしておけば次の reveal=1 で確実に nonce が進む)。
    // initial の startTimerChain と同じ chain を再走させる。
    // (server は done のまま、ホスト本人の確認用 replay。プレイヤーは既に解禁済み)
    startTimerChain(cardsTotal);
  }, [cardsTotal, startTimerChain]);

  // ───── early returns ───────────────────────────────────────────────────────
  if (!view && error) {
    return <RoomLoadErrorScreen error={error as Error | ApiError} />;
  }

  if (loading || !view) {
    return (
      <div style={{ minHeight: '100vh', background: '#F1E7D3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS }}>
        <GoogleFonts />
        <span style={{ color: '#6B4F3A', font: `600 18px ${SERIF}` }}>読み込み中…</span>
      </div>
    );
  }

  const state = view.room.state as unknown as HostRevealState;
  const round = state.round ?? null;
  const scores = state.scores ?? {};
  const hostSeat = state.hostSeat ?? 0;
  const history = state.history ?? [];
  const players = view.players;

  // ホスト本人以外のアクセスは拒否
  const isHost = view.you !== undefined && view.you.seat === hostSeat;
  if (!isHost) {
    return (
      <div style={{ minHeight: '100vh', background: '#F1E7D3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SANS, padding: 24 }}>
        <GoogleFonts />
        <div style={{
          maxWidth: 420, textAlign: 'center',
          background: '#FBF6EA', border: '1px solid #E3D4B8',
          borderRadius: 14, padding: '32px 28px',
          boxShadow: '0 6px 18px rgba(0,0,0,.14)',
        }}>
          <div style={{ font: `700 20px ${SERIF}`, color: '#2E2A24', marginBottom: 12 }}>
            ホスト用画面です
          </div>
          <div style={{ font: `500 14px ${SANS}`, color: '#6B4F3A', lineHeight: 1.6, marginBottom: 20 }}>
            このページは卓のホストがプロジェクタへ結果を映すための画面です。
            プレイヤーは自分の端末で対戦画面を開いてください。
          </div>
          <a
            href="/"
            style={{
              display: 'inline-block',
              font: `700 13px ${SANS}`, color: '#fff',
              background: 'linear-gradient(#8A6A47,#6B4F3A)',
              padding: '10px 18px', borderRadius: 9,
              textDecoration: 'none',
              boxShadow: '0 1px 0 #5A412E',
            }}
          >
            公開卓一覧へ戻る
          </a>
        </div>
      </div>
    );
  }

  const roomName = view.room.name ?? '試遊卓';
  const roomCode = (id ?? '').slice(-4).toUpperCase();

  // 結果公開前は待機画面
  if (!round || round.status !== 'revealed') {
    return <WaitingScreen roomId={id ?? ''} />;
  }

  // ─── revealed: 結果発表ステージ ──────────────────────────────────────────
  const answer = round.answer ?? [];
  const choices = round.choices;

  // 各プレイヤーの払戻情報（ホスト除外）
  const playerPayouts = players
    .filter((p) => p.seat !== hostSeat)
    .map((p) => {
      const pred = round.predictions?.[String(p.seat)];
      return {
        seat: p.seat,
        name: p.name ?? `席${p.seat}`,
        prediction: pred ?? null,
        color: p.color,
      };
    });
  const maxPts = Math.max(0, ...playerPayouts.map((p) => p.prediction?.points ?? 0));
  const roundPts: Record<string, number> = {};
  for (const [seat, pred] of Object.entries(round.predictions ?? {})) {
    roundPts[seat] = pred.points ?? 0;
  }

  // 表示用 derive
  const roundLabel = `第${history.length}R`;
  const roundCountLabel = `${history.length}レース終了`;

  // server-driven の表示。serverPhase が 'done' なら直接 done (timer 待たない)。
  // server が undefined (= announce 未設定の旧 round) は後方互換で done 扱い。
  const effectivePhase: HostRevealAnnouncePhase =
    serverPhase === undefined
      ? 'done'
      : serverPhase === 'idle'
        ? clientPhase === 'idle'
          ? 'idle'
          : clientPhase
        : clientPhase;

  const isIdle = effectivePhase === 'idle';
  const isBuildup = effectivePhase === 'buildup';
  const isRevealing = isBuildup || effectivePhase === 'reveal';
  const showCards = effectivePhase === 'scores' || effectivePhase === 'done';
  const isDone = effectivePhase === 'done';

  const statusTag = isIdle ? '発表前'
    : isBuildup ? '抽選中…'
    : effectivePhase === 'reveal' ? '公開中'
    : effectivePhase === 'scores' ? 'スコア発表'
    : '結果確定';

  return (
    <div
      data-testid="sr-share-stage"
      data-announce-phase={effectivePhase}
      style={{
        position: 'relative',
        minHeight: '100vh', background: '#F1E7D3',
        display: 'flex', flexDirection: 'column',
        fontFamily: SANS, userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      <GoogleFonts />
      <RevealKeyframes />

      {/* ─── ウォルナット トップバー ──────────────────────────────────────────── */}
      <div style={{
        flex: 'none', display: 'flex', alignItems: 'center', gap: 18,
        padding: '13px 26px',
        background: 'linear-gradient(#6B4F3A,#5A4226)',
        boxShadow: 'inset 0 -2px 4px rgba(0,0,0,.22)',
        position: 'relative', zIndex: 5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <AppIcon />
          <span style={{ font: `700 17px ${DISPLAY}`, color: '#F4E7CF' }}>サンレンタン</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(0,0,0,.2)', padding: '6px 12px', borderRadius: 999 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#E05B4E', boxShadow: '0 0 0 3px rgba(224,91,78,.3)', display: 'inline-block' }} />
          <span style={{ font: `700 12px ${SANS}`, color: '#F4E7CF' }}>画面共有中 ・ ホストの画面</span>
        </div>
        <span
          data-testid="sr-status-tag"
          style={{
            font: `700 11px ${SANS}`, color: '#FFF7EA',
            background: '#C56A2C', padding: '6px 11px', borderRadius: 999,
            boxShadow: '0 1px 0 #9A4E1C',
          }}
        >
          {statusTag}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ font: `600 13px ${SANS}`, color: '#EAD9BC' }}>{roomName}</span>
          <span style={{
            font: `700 12px ${DISPLAY}`, color: '#F4E7CF',
            background: 'rgba(255,255,255,.12)', padding: '6px 12px',
            borderRadius: 8, letterSpacing: '.08em',
          }}>
            部屋 #{roomCode}
          </span>
        </div>
      </div>

      {/* ─── フェルト ステージ (id=srt-stage: 揺れアニメのターゲット) ────── */}
      <div
        id="srt-stage"
        style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative', ...feltBg, willChange: 'transform' }}
      >

        {/* ─ 左カラム: 結果発表 + 払戻 ─ */}
        <div style={{ flex: '1.85', display: 'flex', flexDirection: 'column', padding: '24px 26px', minWidth: 0, overflowY: 'auto', position: 'relative', zIndex: 2 }}>

          {/* お題バナー */}
          <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
            <span style={{
              font: `700 14px/1 ${DISPLAY}`, color: '#fff',
              background: '#C56A2C', padding: '7px 12px',
              borderRadius: 7, boxShadow: '0 1px 0 #9A4E1C',
            }}>
              {roundLabel}
            </span>
            <span style={{
              font: `700 13px ${SANS}`, color: '#2C4F3A',
              background: '#F3D9A8', padding: '7px 12px', borderRadius: 999,
            }}>
              結果確定
            </span>
            <span style={{ font: `600 14px ${SANS}`, color: '#FBF6EA' }}>{round.prompt}</span>
          </div>

          {/* 大見出し */}
          <div style={{ flex: 'none', textAlign: 'center', margin: '4px 0 12px' }}>
            <span style={{ font: `900 22px ${SANS}`, color: '#F4E7CF', letterSpacing: '.14em' }}>— 正 解 発 表 —</span>
          </div>

          {/* 大きな表彰台 (常に出すが、reveal step 未満は ? シルエット) */}
          {answer.length >= 3 && (
            <BigPodium
              answer={answer}
              choices={choices}
              revealCount={isDone || effectivePhase === 'scores' ? 3 : revealStep}
            />
          )}

          {/* idle: 中央 CTA「結果発表 ▶」(脈動グロー) */}
          {isIdle && (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
              <button
                type="button"
                data-testid="sr-announce-start-cta"
                onClick={handleAnnounceStart}
                aria-label="結果発表をはじめる"
                style={{
                  position: 'relative',
                  width: 138, height: 138,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', border: 'none', padding: 0,
                  cursor: 'pointer',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    background: 'radial-gradient(circle,rgba(236,194,62,.5),rgba(236,194,62,0) 70%)',
                    animation: 'srtPulse 2s ease-in-out infinite',
                  }}
                />
                <span
                  style={{
                    position: 'relative', zIndex: 1,
                    width: 114, height: 114, borderRadius: '50%',
                    background: 'linear-gradient(#E0A24E,#C56A2C)',
                    border: '4px solid #F3D9A8',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    color: '#FFF7EA', boxShadow: '0 6px 16px rgba(0,0,0,.3)',
                    animation: 'srtGlow 2.2s ease-in-out infinite',
                  }}
                >
                  <span style={{ font: `900 18px ${SANS}` }}>結果</span>
                  <span style={{ font: `900 18px ${SANS}` }}>発表 ▶</span>
                </span>
              </button>
              <span style={{ font: `700 15px ${SANS}`, color: '#FBF6EA' }}>
                ホスト操作：押すと1位から自動で公開します
              </span>
            </div>
          )}

          {/* buildup/reveal: spacer */}
          {isRevealing && !isIdle && (
            <div style={{ flex: 1, minHeight: 0 }} />
          )}

          {/* scores/done: 払戻カードカウントイン */}
          {showCards && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
                <span style={{ font: `700 15px ${SERIF}`, color: '#FBF6EA' }}>このレースの払戻</span>
                <span style={{ font: `500 12px ${SANS}`, color: '#CFE0D0' }}>成立は最高位の役ひとつだけ</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {playerPayouts.map(({ seat, name, prediction, color: playerColor }, i) => {
                  // done フェーズなら全件表示、scores 中は cardsShown 件のみ表示。
                  const visible = isDone || i < cardsShown;
                  return prediction ? (
                    <PayoutCard
                      key={seat}
                      seat={seat}
                      name={name}
                      prediction={prediction}
                      choices={choices}
                      isWinner={maxPts > 0 && (prediction.points ?? 0) === maxPts}
                      playerColor={playerColor}
                      visible={visible}
                    />
                  ) : (
                    <div key={seat} style={{
                      display: 'flex', alignItems: 'center', gap: 13,
                      background: '#FBF6EA', border: '1px solid #E3D4B8',
                      borderRadius: 12, padding: '11px 14px',
                      boxShadow: '0 3px 7px rgba(0,0,0,.14)',
                      opacity: visible ? 1 : 0,
                      transform: visible ? 'translateY(0)' : 'translateY(14px)',
                      transition: 'opacity .35s ease,transform .35s cubic-bezier(.2,1.3,.4,1)',
                    }}>
                      <div style={{
                        flex: 'none', width: 40, height: 40, borderRadius: '50%',
                        background: resolvePlayerColor(seat, playerColor),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        font: `700 17px ${SANS}`, color: '#fff',
                      }}>
                        {name.slice(0, 1)}
                      </div>
                      <span style={{ font: `700 15px ${SANS}`, color: '#2E2A24' }}>{name}</span>
                      <span style={{ marginLeft: 'auto', font: `600 12px ${SANS}`, color: '#8A7A60' }}>未投票</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ─ 右カラム: 累積順位 ─ */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          padding: '24px 24px',
          background: 'rgba(44,79,58,.45)',
          borderLeft: '3px solid #2C4F3A',
          minWidth: 0, overflowY: 'auto',
          position: 'relative', zIndex: 2,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 16 }}>
            <span style={{ font: `700 19px ${SERIF}`, color: '#FBF6EA' }}>累積順位</span>
            <span style={{ font: `500 12px ${SANS}`, color: '#CFE0D0' }}>{roundCountLabel}</span>
          </div>

          <ShareLeaderboard
            players={players}
            scores={scores}
            hostSeat={hostSeat}
            roundPts={roundPts}
            cardsShown={isDone ? cardsTotal : cardsShown}
          />
        </div>

        {/* ★ 撤去 (user 指摘 2026-06-24):
            (1) 暗転 vignette (常時 dim)
            (2) 斜め白光 sweep (画面横断する 4s ループ)
            (3) vivid 虹色グラデ overlay (= user が「白いベール」と感じた本体)
            (4) 中央 aura pulse (1着 tile 後ろの金色光輪、真ん中でぼやって光ってた)
            残すのは: 背景 ✦ sparkles・瞬間 flash burst・confetti drop・コイン burst。 */}

        {/* 背景キラキラ (done 中のみ。8 個の星粒が slow float) */}
        {isDone && (
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4, overflow: 'hidden' }}>
            {[
              { top: '12%', left: '8%', size: 22, delay: 0 },
              { top: '24%', left: '78%', size: 28, delay: 0.4 },
              { top: '58%', left: '14%', size: 18, delay: 0.8 },
              { top: '72%', left: '64%', size: 26, delay: 1.2 },
              { top: '18%', left: '46%', size: 16, delay: 1.6 },
              { top: '82%', left: '38%', size: 24, delay: 0.2 },
              { top: '38%', left: '88%', size: 20, delay: 1.0 },
              { top: '64%', left: '92%', size: 18, delay: 0.6 },
            ].map((s, i) => (
              <span
                key={i}
                style={{
                  position: 'absolute', top: s.top, left: s.left,
                  font: `700 ${s.size}px ${DISPLAY}`,
                  color: '#FFF7D6',
                  textShadow: '0 0 14px rgba(255,236,150,.95),0 0 28px rgba(255,180,80,.7)',
                  animation: `srtSparkleFloat 3.6s ease-in-out ${s.delay}s infinite`,
                  pointerEvents: 'none',
                }}
              >
                ✦
              </span>
            ))}
          </div>
        )}

        {/* effect overlay (coins/confetti/rays) */}
        <div id="srt-overlay" aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 55, overflow: 'hidden' }} />

        {/* flash */}
        <div id="srt-flash" aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50, background: '#FFFDF4', opacity: 0 }} />
      </div>

      {/* ─── フッター: ホスト操作 ─────────────────────────────────────────── */}
      <div style={{
        flex: 'none', display: 'flex', alignItems: 'center', gap: 14,
        padding: '13px 26px',
        background: '#FBF6EA', borderTop: '1px solid #E3D4B8',
        position: 'relative', zIndex: 5,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ display: 'flex', gap: 4 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#C56A2C', display: 'inline-block' }} />
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#C56A2C', opacity: 0.5, display: 'inline-block' }} />
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#C56A2C', opacity: 0.25, display: 'inline-block' }} />
          </span>
          <span style={{ font: `600 14px ${SANS}`, color: '#6B4F3A' }}>ホストが次のお題を準備しています…</span>
        </div>
        <span style={{ marginLeft: 'auto', font: `500 12px ${SANS}`, color: '#8A7A60' }}>
          プレイヤーは自分の端末で次の予想を待ちましょう
        </span>
        {isDone && (
          <button
            type="button"
            data-testid="sr-announce-replay"
            onClick={handleReplay}
            aria-label="もう一度見る"
            style={{
              font: `700 13px ${SANS}`,
              color: '#6B4F3A',
              background: '#FBF6EA',
              border: '1.5px solid #D8C6A4',
              padding: '9px 16px',
              borderRadius: 10,
              cursor: 'pointer',
            }}
          >
            ↻ もう一度見る
          </button>
        )}
        <button
          type="button"
          data-testid="sr-host-next-round"
          onClick={() => router.push(`/rooms/${id}`)}
          style={{
            font: `700 13px ${SANS}`, color: '#fff',
            background: 'linear-gradient(#8A6A47,#6B4F3A)',
            padding: '9px 16px', borderRadius: 9,
            border: 'none', cursor: 'pointer',
            boxShadow: '0 1px 0 #5A412E',
          }}
        >
          ホスト操作：次のお題を出す
        </button>
      </div>

      {/* confetti: done 遷移時に 1 度だけ降らせる。key で replay 時に再 mount。 */}
      {isDone && confettiCount > 0 && (
        <ConfettiBurst key={`confetti-${confettiCount}`} />
      )}
    </div>
  );
}

// ─── confetti (派手化: 180 枚 + 多色 + 持続長め) ────────────────────────────
/** mount 時に 180 枚の紙吹雪を overlay に注入し、Web Animations で降らせる。
 *  key を変えて再 mount すれば replay 時にもう一度発火する。
 *  user request: 「派手に行こう」→ 粒数 2 倍 + 色を 6→10 色 + 持続時間 +900ms。 */
function ConfettiBurst() {
  useEffect(() => {
    const overlay = document.getElementById('srt-overlay');
    if (!overlay) return;
    const cols = [
      '#C8392F', '#E3B42A', '#3E8E52', '#2F6FB0', '#F1E7D3', '#E0A24E',
      '#FF5A8E', '#7BDCFF', '#B478FF', '#FFD15A',
    ];
    const rect = overlay.getBoundingClientRect();
    const W = rect.width;
    const created: HTMLDivElement[] = [];
    for (let i = 0; i < 180; i++) {
      const el = document.createElement('div');
      const w = 7 + Math.random() * 9;
      const h = 10 + Math.random() * 13;
      // 1/4 を金/銀の丸い粒に変えて vivid 感を増やす
      const isCoin = Math.random() < 0.22;
      const bg = isCoin
        ? 'radial-gradient(circle at 35% 30%,#FCEFBE,#E3B42A 58%,#B98A1E)'
        : cols[i % cols.length];
      const radius = isCoin ? '50%' : '2px';
      el.style.cssText = `position:absolute;left:${Math.random() * W}px;top:-20px;width:${w}px;height:${h}px;background:${bg};border-radius:${radius};pointer-events:none;box-shadow:${isCoin ? '0 0 10px rgba(246,210,120,.7)' : 'none'}`;
      overlay.appendChild(el);
      created.push(el);
      const drift = (Math.random() - 0.5) * 280;
      const dur = 2600 + Math.random() * 2100;
      const spin = (Math.random() > 0.5 ? 1 : -1) * (540 + Math.random() * 900);
      const a = el.animate(
        [
          { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
          { transform: `translate(${drift}px,920px) rotate(${spin}deg)`, opacity: 0.9 },
        ],
        { duration: dur, easing: 'cubic-bezier(.3,.5,.5,1)', delay: Math.random() * 900 },
      );
      a.onfinish = () => el.remove();
    }
    return () => {
      // unmount で残骸を削除
      for (const el of created) {
        try {
          el.remove();
        } catch {
          /* noop */
        }
      }
    };
  }, []);
  return null;
}

// ─── burst 効果 (フラッシュ / 揺れ / 光輪 / コイン / スパーク) ───────────────
/** reveal=1/2/3 のときに呼ばれる視覚演出。設計 .dc.html の burst() / rays() / ring()
 *  / coins() / sparks() を Web Animations API で移植。Audio は使用しない。 */
function burstEffects(place: number) {
  const stage = document.getElementById('srt-stage');
  const flash = document.getElementById('srt-flash');
  const tile = document.getElementById(`srt-tile-${place}`);
  const overlay = document.getElementById('srt-overlay');
  const big = place === 1;
  if (flash) {
    // 派手化: flash duration を long めに伸ばす (epileptic 配慮で 5Hz 未満を維持。
    //         single burst なので連続点滅 != 0.2s+ で十分安全)。
    flash.animate(
      [{ opacity: big ? 0.98 : 0.82 }, { opacity: 0 }],
      { duration: big ? 720 : 520, easing: 'ease-out' },
    );
  }
  if (stage) {
    const a = big ? 15 : 9;
    stage.animate(
      [
        { transform: 'translate(0,0)' },
        { transform: `translate(${a}px,${-a}px)` },
        { transform: `translate(${-a}px,${a * 0.7}px)` },
        { transform: `translate(${a * 0.5}px,${-a * 0.5}px)` },
        { transform: 'translate(0,0)' },
      ],
      { duration: big ? 460 : 340, easing: 'ease-out' },
    );
  }
  if (tile) {
    tile.animate(
      [
        { transform: 'scale(0.2) rotate(-12deg)', opacity: 0 },
        { transform: 'scale(1.28) rotate(4deg)', opacity: 1, offset: 0.55 },
        { transform: 'scale(0.93) rotate(-2deg)', offset: 0.78 },
        { transform: 'scale(1) rotate(0deg)' },
      ],
      { duration: 560, easing: 'cubic-bezier(.2,1.5,.45,1)' },
    );
  }
  const name = document.getElementById(`srt-name-${place}`);
  if (name) {
    name.animate(
      [
        { transform: 'translateY(14px) scale(.85)', opacity: 0 },
        { transform: 'translateY(0) scale(1.06)', opacity: 1, offset: 0.7 },
        { transform: 'translateY(0) scale(1)', opacity: 1 },
      ],
      { duration: 620, delay: 160, easing: 'cubic-bezier(.2,1.3,.4,1)', fill: 'backwards' },
    );
  }
  if (overlay && tile) {
    spawnRays(overlay, tile, big);
    spawnRing(overlay, tile, big);
    // 派手化: コイン/スパーク数を ~1.5 倍に
    spawnCoins(overlay, tile, big ? 64 : place === 2 ? 46 : 36);
    spawnSparks(overlay, tile, big ? 22 : 14);
  }
}

function centerOf(overlay: HTMLElement, tile: HTMLElement) {
  const o = overlay.getBoundingClientRect();
  const t = tile.getBoundingClientRect();
  return { x: t.left - o.left + t.width / 2, y: t.top - o.top + t.height / 2 };
}

function spawnRays(overlay: HTMLElement, tile: HTMLElement, big: boolean) {
  const { x, y } = centerOf(overlay, tile);
  const g = document.createElement('div');
  const gs = big ? 150 : 110;
  g.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${gs}px;height:${gs}px;border-radius:50%;background:radial-gradient(circle,rgba(255,253,240,.95),rgba(255,240,190,.35) 45%,rgba(255,240,190,0) 70%);transform:translate(-50%,-50%) scale(.3);pointer-events:none;mix-blend-mode:screen`;
  overlay.appendChild(g);
  const ag = g.animate(
    [
      { transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 },
      { transform: `translate(-50%,-50%) scale(${big ? 1.9 : 1.5})`, opacity: 0 },
    ],
    { duration: big ? 520 : 400, easing: 'ease-out' },
  );
  ag.onfinish = () => g.remove();
  const el = document.createElement('div');
  const s = big ? 180 : 130;
  el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;border-radius:50%;background:repeating-conic-gradient(rgba(255,242,196,.95) 0deg 6deg,rgba(255,242,196,0) 6deg 17deg);transform:translate(-50%,-50%) scale(.3);pointer-events:none;mix-blend-mode:screen`;
  overlay.appendChild(el);
  const a = el.animate(
    [
      { transform: 'translate(-50%,-50%) scale(.3) rotate(0deg)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1) rotate(16deg)', opacity: 1, offset: 0.28 },
      { transform: `translate(-50%,-50%) scale(${big ? 2.3 : 1.8}) rotate(34deg)`, opacity: 0 },
    ],
    { duration: big ? 720 : 540, easing: 'ease-out' },
  );
  a.onfinish = () => el.remove();
}

function spawnRing(overlay: HTMLElement, tile: HTMLElement, big: boolean) {
  const { x, y } = centerOf(overlay, tile);
  const el = document.createElement('div');
  const s = big ? 150 : 110;
  el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${s}px;height:${s}px;border-radius:50%;border:${big ? 7 : 5}px solid rgba(246,224,160,.95);box-shadow:0 0 16px rgba(246,224,160,.7);transform:translate(-50%,-50%);animation:srtRing ${big ? 620 : 480}ms ease-out forwards;pointer-events:none`;
  overlay.appendChild(el);
  setTimeout(() => el.remove(), 700);
}

function spawnCoins(overlay: HTMLElement, tile: HTMLElement, n: number) {
  const { x, y } = centerOf(overlay, tile);
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    const size = 13 + Math.random() * 15;
    const gold = Math.random() > 0.22;
    const bg = gold
      ? 'radial-gradient(circle at 35% 30%,#FCEFBE,#E3B42A 58%,#B98A1E)'
      : 'radial-gradient(circle at 35% 30%,#FBE3DF,#C8392F 65%,#8E211B)';
    el.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:${gold ? '50%' : '3px'};background:${bg};box-shadow:0 0 12px rgba(246,210,120,.9),inset 0 -2px 3px rgba(0,0,0,.25);pointer-events:none`;
    overlay.appendChild(el);
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.25;
    const dist = 130 + Math.random() * 230;
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist;
    const fall = 230 + Math.random() * 210;
    const dur = 1150 + Math.random() * 1000;
    const spin = (Math.random() > 0.5 ? 1 : -1) * (540 + Math.random() * 540);
    const a = el.animate(
      [
        { transform: 'translate(-50%,-50%) translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) rotate(${spin * 0.6}deg)`, opacity: 1, offset: 0.45 },
        { transform: `translate(-50%,-50%) translate(${dx * 1.08}px,${dy + fall}px) rotate(${spin}deg)`, opacity: 0 },
      ],
      { duration: dur, easing: 'cubic-bezier(.25,.65,.4,1)' },
    );
    a.onfinish = () => el.remove();
  }
}

function spawnSparks(overlay: HTMLElement, tile: HTMLElement, n: number) {
  const { x, y } = centerOf(overlay, tile);
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.textContent = '✦';
    const size = 12 + Math.random() * 12;
    el.style.cssText = `position:absolute;left:${x}px;top:${y}px;color:#FFF7E6;font-size:${size}px;text-shadow:0 0 8px rgba(255,247,230,.9);pointer-events:none;transform:translate(-50%,-50%)`;
    overlay.appendChild(el);
    const ang = Math.random() * Math.PI * 2;
    const dist = 70 + Math.random() * 130;
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist - 40;
    const a = el.animate(
      [
        { transform: 'translate(-50%,-50%) translate(0,0) scale(.3)', opacity: 1 },
        { transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(1.1)`, opacity: 1, offset: 0.6 },
        { transform: `translate(-50%,-50%) translate(${dx * 1.15}px,${dy + 30}px) scale(.4)`, opacity: 0 },
      ],
      { duration: 700 + Math.random() * 400, easing: 'ease-out' },
    );
    a.onfinish = () => el.remove();
  }
}
