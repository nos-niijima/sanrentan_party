'use client';

// host-reveal パターンの汎用フォールバック UI（uiKey 未登録のゲーム用）。
// 装飾は最小限。出題→予想→公開→採点の骨格だけを素朴に提供する。

import { useState } from 'react';
import type { HostRevealState, HostRevealRound } from '@sanrentan-party/shared';
import type { GamePlayProps } from '@/lib/games/types';

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e7e5e4', borderRadius: 10, padding: 16, margin: '12px auto', maxWidth: 560 };
const btn: React.CSSProperties = { background: '#C56A2C', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', cursor: 'pointer', fontWeight: 700 };

function Picker({ round, submitLabel, onSubmit }: { round: HostRevealRound; submitLabel: string; onSubmit: (a: string[]) => Promise<void> }) {
  const [picks, setPicks] = useState<string[]>([]);
  const toggle = (c: string) => setPicks((p) => (p.includes(c) ? p.filter((x) => x !== c) : p.length < 3 ? [...p, c] : p));
  return (
    <div>
      <p style={{ fontWeight: 700 }}>{round.prompt}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {round.choices.map((c) => {
          const r = picks.indexOf(c);
          return (
            <button key={c} onClick={() => toggle(c)} style={{ ...btn, background: r >= 0 ? '#3E6F52' : '#78716c' }}>
              {r >= 0 ? `${r + 1}着: ` : ''}{c}
            </button>
          );
        })}
      </div>
      <button style={{ ...btn, marginTop: 12, opacity: picks.length === 3 ? 1 : 0.5 }} disabled={picks.length !== 3} onClick={() => onSubmit(picks)}>
        {submitLabel}（{picks.length}/3）
      </button>
    </div>
  );
}

export default function HostRevealGeneric({ view, act, join }: GamePlayProps) {
  const state = view.room.state as unknown as HostRevealState;
  const me = view.you;
  const isHost = !!me && me.seat === (state.hostSeat ?? 0);
  const round = state.round ?? null;
  const scores = state.scores ?? {};
  const [prompt, setPrompt] = useState('');
  const [choicesText, setChoicesText] = useState('');

  if (!me) {
    return <div style={card}><p>このルームに参加しますか？</p><button style={btn} onClick={() => join().catch(() => {})}>参加する</button></div>;
  }

  return (
    <div style={{ padding: 16 }}>
      {isHost && (!round || round.status === 'revealed') && (
        <div style={card}>
          <h3>出題（ホスト）</h3>
          <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="お題" style={{ width: '100%', padding: 8, marginBottom: 8, boxSizing: 'border-box' }} />
          <textarea value={choicesText} onChange={(e) => setChoicesText(e.target.value)} placeholder="選択肢を1行に1つ（3つ以上）" rows={4} style={{ width: '100%', padding: 8, marginBottom: 8, boxSizing: 'border-box' }} />
          <button style={btn} onClick={() => act({ action: 'poseRound', payload: { prompt, choices: choicesText.split('\n').map((s) => s.trim()).filter(Boolean) } }).catch(() => {})}>出題する</button>
        </div>
      )}
      {isHost && round && round.status === 'open' && (
        <div style={card}><h3>正解を公開（ホスト）</h3><Picker round={round} submitLabel="公開して採点" onSubmit={(a) => act({ action: 'reveal', payload: { answer: a } })} /></div>
      )}
      {!isHost && round && round.status === 'open' && (
        <div style={card}><h3>予想する</h3><Picker round={round} submitLabel="この予想で提出" onSubmit={(a) => act({ action: 'predict', payload: { answer: a } })} /></div>
      )}
      {!isHost && !round && <div style={card}><p>ホストの出題待ち…</p></div>}
      {round && round.status === 'revealed' && (
        <div style={card}><h3>結果</h3><p>正解: {round.answer?.join(' → ')}</p>{!isHost && <p>あなた: {round.predictions?.[String(me.seat)]?.hand ?? 'ハズレ'}（+{round.predictions?.[String(me.seat)]?.points ?? 0}）</p>}</div>
      )}
      <div style={card}>
        <h3>累積スコア</h3>
        {view.players.map((p) => (<div key={p.seat}>席{p.seat} {p.name ?? ''}: {scores[String(p.seat)] ?? 0} 点</div>))}
      </div>
    </div>
  );
}
