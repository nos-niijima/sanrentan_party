'use client';

// 共有プリミティブ — サンレンタン UI 全画面で使うコンポーネント・定数・ユーティリティ。
// ここに置いたものを各 Screen と SanrentanPlay が import する。

import { useState } from 'react';
import Link from 'next/link';
import type { HostRevealRound } from '@sanrentan-party/shared';

// ---- フォント定数 ----
export const SANS = "'Noto Sans JP',sans-serif";
export const SERIF = "'Noto Serif JP',serif";
export const DISPLAY = "'Zilla Slab',serif";

// ---- 枠番カラー（出走馬＝選択肢）。8 枠までで循環 ----
export const GATES = [
  { bg: '#F7F4EC', fg: '#2E2A24', bd: '#D8CDB8' },
  { bg: '#2E2A24', fg: '#F7F4EC', bd: '#2E2A24' },
  { bg: '#C8392F', fg: '#ffffff', bd: '#A22C24' },
  { bg: '#2F6FB0', fg: '#ffffff', bd: '#235487' },
  { bg: '#ECC23E', fg: '#2E2A24', bd: '#D3A626' },
  { bg: '#3E8E52', fg: '#ffffff', bd: '#2E6E3E' },
  { bg: '#8A5A9E', fg: '#ffffff', bd: '#6E4680' },
  { bg: '#D98A3D', fg: '#ffffff', bd: '#B06A22' },
];

export const HAND_PT: Record<string, number> = { サンレンタン: 6, サンレンプク: 4, ニレンタン: 3, プクプク: 2, タン: 1, ハズレ: 0 };

// 枠番表示ラベル: 数字 1-6 から英字 A-F に変更（純粋な表示層）。
// 8 枠まで対応するため A-H を用意（GATES と同じ循環長）。
// gateOf の n は LETTER_LABELS[i] を返し、配列外（>= 8 番目）は String(i+1) に fallback する。
export const LETTER_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export function gateOf(choices: string[], choice: string) {
  const i = Math.max(0, choices.indexOf(choice));
  return { n: LETTER_LABELS[i] ?? String(i + 1), ...GATES[i % GATES.length] };
}

// ---- 背景スタイル定数 ----
export const feltBg: React.CSSProperties = {
  background: '#3E6F52',
  backgroundImage:
    'radial-gradient(rgba(0,0,0,.10) 1px,transparent 1.2px),radial-gradient(rgba(255,255,255,.05) 1px,transparent 1.2px)',
  backgroundSize: '5px 5px,7px 7px',
};
export const ticketBg: React.CSSProperties = {
  backgroundColor: '#FBF6EA',
  backgroundImage:
    'repeating-linear-gradient(60deg,rgba(62,111,82,.06) 0 2px,transparent 2px 7px),repeating-linear-gradient(-60deg,rgba(197,106,44,.05) 0 2px,transparent 2px 7px)',
};

// ---- ボタンスタイル定数 ----
export const orangeBtn: React.CSSProperties = {
  background: 'linear-gradient(#E0A24E,#C56A2C)', color: '#FFF7EA', font: `900 16px ${SANS}`,
  padding: 14, border: 'none', borderRadius: 10, boxShadow: '0 3px 0 #9A4E1C,0 5px 12px rgba(0,0,0,.22)', cursor: 'pointer', width: '100%',
};
export const brownBtn: React.CSSProperties = {
  background: 'linear-gradient(#8A6A47,#6B4F3A)', color: '#F7EEDD', font: `700 14px ${SANS}`,
  padding: 12, border: 'none', borderRadius: 9, boxShadow: '0 2px 0 #5A412E', cursor: 'pointer',
};

// ---- Row 型（Ranking で使用） ----
// color は RoomPlayer.color (任意。hex code)。未設定の既存プレイヤー / 未登録の
// 既存ルームでは undefined。描画側で `fallbackPlayerColor(seat)` でフォールバック。
export type Row = { seat: number; name: string; pts: number; isMe: boolean; isHost: boolean; color?: string };

/** プレイヤー駒色のフォールバック。
 *  color (RoomPlayer.color) が無い既存プレイヤー / 既存ルームでも、
 *  視覚的に色付きアバターを出せるように seat → 枠番カラーを既定にする。
 *  GATES は 8 色周期で、白黒や赤など視認性も担保される。 */
export function fallbackPlayerColor(seat: number): string {
  return GATES[seat % GATES.length].bg;
}

/** Row.color が指定されていればそれを、無ければ seat ベースの既定色を返す。
 *  既存 row（color 列が無い時代に作られたもの）でも壊れない契約。 */
export function resolvePlayerColor(row: { color?: string; seat: number }): string {
  return row.color ?? fallbackPlayerColor(row.seat);
}

// ---- コンポーネント ----

export function Confetti() {
  const colors = ['#C8392F', '#ECC23E', '#2F6FB0', '#3E8E52', '#E3B42A', '#F7F4EC', '#C56A2C'];
  const pieces = Array.from({ length: 40 }, (_, i) => {
    const r = (n: number) => ((Math.sin((i + 1) * (n + 1) * 12.9898) * 43758.5453) % 1 + 1) % 1;
    return { left: r(1) * 100, delay: r(2) * 0.6, dur: 1.8 + r(3) * 1.4, size: 6 + r(4) * 7, color: colors[i % colors.length] };
  });
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 5 }}>
      {pieces.map((p, i) => (
        <div key={i} style={{ position: 'absolute', top: -24, left: `${p.left}%`, width: p.size, height: p.size * 1.4, background: p.color, borderRadius: 2, animation: `sr-fall ${p.dur}s linear ${p.delay}s forwards` }} />
      ))}
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'relative', maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#F1E7D3', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ ...feltBg, borderBottom: '3px solid #2C4F3A', padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/" style={{ font: `700 19px ${SANS}`, color: '#EAF1E8', textDecoration: 'none' }}>‹</Link>
          <span style={{ font: `700 16px ${DISPLAY}`, color: '#F4E7CF' }}>サンレンタン</span>
        </div>
      </div>
      {children}
    </div>
  );
}

export function GateChip({ n, bg, fg, bd, size = 38 }: { n: string; bg: string; fg: string; bd: string; size?: number }) {
  return (
    <div style={{ flex: 'none', width: size, height: size, borderRadius: 8, background: bg, border: `2px solid ${bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 ${Math.round(size * 0.5)}px ${DISPLAY}`, color: fg, boxShadow: '0 1px 2px rgba(0,0,0,.18)' }}>
      {n}
    </div>
  );
}

export function BetSlip({ picks, choices, label }: { picks: string[]; choices: string[]; label?: string }) {
  const pos = ['1着', '2着', '3着'];
  return (
    <div style={{ ...ticketBg, border: '1.5px solid #E0CFAD', borderRadius: 12, padding: 14, boxShadow: '0 4px 12px rgba(70,50,30,.12)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 11 }}>
        <span style={{ font: `700 11px ${DISPLAY}`, color: '#8A7A60', letterSpacing: '.1em' }}>三連単 馬券</span>
        {label && <span style={{ font: `600 10px ${SANS}`, color: '#3E6F52', background: '#E3EFE3', padding: '4px 8px', borderRadius: 999 }}>{label}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {pos.map((p, i) => {
          const c = picks[i];
          const g = c ? gateOf(choices, c) : null;
          return (
            <div key={p} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '9px 4px', borderRadius: 10, background: g ? '#FBEFD9' : '#F4ECD8', border: `2px ${g ? 'solid' : 'dashed'} ${g ? '#E3B42A' : '#C8A27C'}` }}>
              <span style={{ font: `700 10px ${SANS}`, color: '#A14A3F' }}>{p}</span>
              {g ? <GateChip {...g} size={44} /> : <div style={{ width: 44, height: 44, borderRadius: 9, background: '#EFE2C6', display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 22px ${DISPLAY}`, color: '#B7A582' }}>?</div>}
              <span style={{ font: `600 10px ${SANS}`, color: '#5a5347', textAlign: 'center', lineHeight: 1.2, height: 24, overflow: 'hidden' }}>{c ?? '未選択'}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** お題＋選択肢を順位に割り当てるピッカー（予想 / ホストの正解 共通）。roundId で remount。 */
export function TriplePicker({ round, initial, submitLabel, onSubmit }: {
  round: HostRevealRound; initial: string[]; submitLabel: string; onSubmit: (answer: string[]) => Promise<void>;
}) {
  const [picks, setPicks] = useState<string[]>(initial.slice(0, 3));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (c: string) =>
    setPicks((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : prev.length < 3 ? [...prev, c] : prev));

  async function submit() {
    setBusy(true); setErr(null);
    try { await onSubmit(picks); } catch (e) { setErr(e instanceof Error ? e.message : '送信に失敗しました'); } finally { setBusy(false); }
  }

  return (
    <>
      <div style={{ padding: '12px 16px 8px', font: `700 13px ${SANS}`, color: '#2E2A24' }}>
        出走から 1着 → 2着 → 3着 を選ぶ <span style={{ font: `500 11px ${SANS}`, color: '#8A7A60' }}>タップで指定 / もう一度で取消</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {round.choices.map((c) => {
          const g = gateOf(round.choices, c);
          const rank = picks.indexOf(c);
          const assigned = rank >= 0;
          return (
            <button key={c} onClick={() => toggle(c)} className={`sr-tap${assigned ? ' sr-tap-on' : ''}`} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, background: assigned ? '#FFFDF7' : '#FBF6EA', border: `1.5px solid ${assigned ? '#C56A2C' : '#E3D4B8'}`, borderRadius: 11, padding: '10px 12px', boxShadow: '0 2px 4px rgba(70,50,30,.07)', cursor: 'pointer' }}>
              <GateChip {...g} />
              <span style={{ font: `600 15px ${SANS}`, color: '#2E2A24' }}>{c}</span>
              <span style={{ marginLeft: 'auto', font: `700 13px ${SANS}`, color: assigned ? '#FFF7EA' : '#A89472', background: assigned ? '#C56A2C' : '#F1E7D3', border: `1.5px solid ${assigned ? '#9A4E1C' : '#E0CFAD'}`, padding: '6px 11px', borderRadius: 999 }}>
                {assigned ? `${rank + 1}着` : '指定'}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ padding: '12px 16px 18px', background: '#FBF6EA', borderTop: '1px solid #E3D4B8' }}>
        <div style={{ marginBottom: 10 }}><BetSlip picks={picks} choices={round.choices} label={picks.length === 3 ? '完成' : `あと${3 - picks.length}つ`} /></div>
        {err && <p style={{ margin: '0 0 8px', font: `600 12px ${SANS}`, color: '#A22C24' }}>{err}</p>}
        <button onClick={submit} disabled={picks.length !== 3 || busy} className="sr-press" style={{ ...(picks.length === 3 ? orangeBtn : { ...orangeBtn, background: 'linear-gradient(#9C9A93,#7E7C75)', boxShadow: '0 3px 0 #5F5D57', cursor: 'not-allowed' }), opacity: busy ? 0.7 : 1 }}>
          {busy ? '送信中…' : picks.length === 3 ? submitLabel : '3着まで選んでください'}
        </button>
      </div>
    </>
  );
}

export function Podium({ answer, choices }: { answer: string[]; choices: string[] }) {
  const order: Array<[string, number]> = [[answer[1], 58], [answer[0], 80], [answer[2], 44]];
  const labels = ['2', '1', '3'];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 9 }}>
      {order.map(([c, h], i) => {
        const g = gateOf(choices, c);
        const first = i === 1;
        return (
          <div key={i} className="sr-rise" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: first ? 108 : 100, animationDelay: `${0.12 + i * 0.12}s` }}>
            <GateChip {...g} size={first ? 56 : 44} />
            <span style={{ font: `700 11px ${SANS}`, color: '#FBF6EA', margin: '5px 0' }}>{c}</span>
            <div style={{ width: '100%', height: h, borderRadius: '8px 8px 0 0', background: first ? 'linear-gradient(#F6E7B8,#E6CE86)' : 'linear-gradient(#EDE0C4,#D7C49E)', border: '1px solid #D8BC74', borderBottom: 'none', display: 'flex', justifyContent: 'center', paddingTop: 7, boxShadow: 'inset 0 2px 0 rgba(255,255,255,.5)' }}>
              <span style={{ font: `700 ${first ? 18 : 14}px ${DISPLAY}`, color: '#9A7A2E' }}>{labels[i]}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** プレイヤー駒色を示す小さな円形ドット（順位バッジの隣に並べる additive 要素）。
 *  視覚デザインは維持しつつ、色情報を一目で確認できる「アバターチップ」相当。
 *  color が無いプレイヤーは fallbackPlayerColor(seat) で埋める。 */
export function PlayerColorDot({ row, size = 14 }: { row: { color?: string; seat: number }; size?: number }) {
  const c = resolvePlayerColor(row);
  return (
    <span
      aria-label={`プレイヤー駒色 #${row.seat}`}
      style={{
        flex: 'none',
        width: size,
        height: size,
        borderRadius: '50%',
        background: c,
        border: '1.5px solid rgba(0,0,0,.18)',
        boxShadow: 'inset 0 -1px 2px rgba(0,0,0,.18)',
        display: 'inline-block',
      }}
    />
  );
}

export function Ranking({ rows }: { rows: Row[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {rows.map((r, i) => (
        <div key={r.seat} style={{ display: 'flex', alignItems: 'center', gap: 11, background: r.isMe ? '#FBEFD9' : '#FBF6EA', border: `1.5px solid ${r.isMe ? '#E3B42A' : '#E3D4B8'}`, borderRadius: 10, padding: '9px 12px' }}>
          <span style={{ flex: 'none', width: 24, height: 24, borderRadius: '50%', background: i === 0 ? '#E3B42A' : i === 1 ? '#C4C0B4' : i === 2 ? '#C8956A' : '#E0CFAD', color: i <= 2 ? '#fff' : '#8A7A60', font: `700 13px ${DISPLAY}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
          {/* 駒色ドット（additive）。色が未設定でも seat → 既定色でフォールバック描画する。 */}
          <PlayerColorDot row={r} />
          <span style={{ font: `600 14px ${SANS}`, color: '#2E2A24' }}>{r.name}</span>
          {(r.isMe || r.isHost) && <span style={{ font: `600 10px ${SANS}`, color: '#FBF6EA', background: r.isMe ? '#C56A2C' : '#3E6F52', padding: '3px 7px', borderRadius: 999 }}>{r.isMe ? 'あなた' : 'ホスト'}</span>}
          <span style={{ marginLeft: 'auto', font: `900 17px ${DISPLAY}`, color: '#2E2A24' }}>{r.pts}</span>
        </div>
      ))}
    </div>
  );
}

export function PromptBanner({ round, host }: { round: HostRevealRound; host?: string }) {
  return (
    <div style={{ ...feltBg, padding: '14px 16px', borderBottom: '3px solid #2C4F3A' }}>
      <div style={{ background: '#FBF6EA', borderRadius: 10, padding: '12px 14px', boxShadow: '0 4px 10px rgba(0,0,0,.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          <span style={{ font: `600 11px ${SANS}`, color: round.status === 'open' ? '#3E6F52' : '#A22C24', background: round.status === 'open' ? '#E3EFE3' : '#FBE3DF', padding: '5px 9px', borderRadius: 999 }}>
            {round.status === 'open' ? '予想受付中' : '結果確定'}
          </span>
          {host && <span style={{ marginLeft: 'auto', font: `500 11px ${SANS}`, color: '#8A7A60' }}>出題 {host}</span>}
        </div>
        <h2 style={{ margin: 0, font: `700 18px/1.35 ${SERIF}`, color: '#2E2A24' }}>{round.prompt}</h2>
      </div>
    </div>
  );
}

export function RankingFooter({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
    <div style={{ padding: '14px 16px 20px', background: '#FBF6EA', borderTop: '1px solid #E3D4B8' }}>
      <div style={{ font: `700 14px ${SERIF}`, color: '#2E2A24', marginBottom: 9 }}>部屋の累積順位</div>
      <Ranking rows={rows} />
    </div>
  );
}
