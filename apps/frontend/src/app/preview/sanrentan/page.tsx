'use client';

// 開発用プレビュー: 実プレイは Google 認証が要るため、モックデータで
// SanrentanPlay の各状態（予想 / 結果 / ホスト出題 / ホスト公開）を一覧表示する。

import type { RoomView } from '@sanrentan-party/shared';
import SanrentanPlay from '@/components/games/sanrentan/SanrentanPlay';

const choices = ['やきそば', 'ほたて', 'マシュマロ', 'しいたけ', 'とうもろこし', 'おにぎり'];
const players = [
  { id: 'p0', seat: 0, userId: 'h', name: 'こぐま' },
  { id: 'p1', seat: 1, userId: 'me', name: 'チームたぬき' },
  { id: 'p2', seat: 2, userId: 'a', name: 'きつね組' },
  { id: 'p3', seat: 3, userId: 'b', name: 'ふくろう亭' },
];
const scores = { '0': 0, '1': 14, '2': 11, '3': 9 };
const noop = async () => {};

function mk(partial: { you: number; round: unknown; presets?: unknown }): RoomView {
  return {
    room: {
      id: 'preview', status: 'playing',
      createdAt: new Date('2026-01-01') as unknown as Date, updatedAt: new Date('2026-01-01') as unknown as Date,
      state: { pattern: 'host-reveal', version: 5, hostSeat: 0, scores, round: partial.round, history: [] },
    } as unknown as RoomView['room'],
    players,
    you: { id: `p${partial.you}`, roomId: 'preview', seat: partial.you, userId: players[partial.you].userId, privateState: {}, createdAt: new Date() } as unknown as RoomView['you'],
    ui: 'sanrentan',
    presets: partial.presets as RoomView['presets'],
  };
}

const predict = mk({ you: 1, round: { roundId: 'r1', prompt: 'BBQで肉以外に焼きたいのは？', choices, status: 'open', predictions: {}, submittedSeats: [2], createdAt: '' } });
const result = mk({
  you: 1,
  round: { roundId: 'r1', prompt: 'BBQで肉以外に焼きたいのは？', choices, status: 'revealed', answer: ['やきそば', 'ほたて', 'マシュマロ'], revealedAt: '', createdAt: '', predictions: { '1': { seat: 1, answer: ['やきそば', 'ほたて', 'マシュマロ'], hand: 'サンレンタン', points: 6, submittedAt: '' } } },
});
const hostPose = mk({ you: 0, round: null, presets: [{ prompt: '焼いたら美味しい順（1〜3着を予想）', choices: ['やきそば', 'ほたて', 'マシュマロ', 'しいたけ', 'ピーマン', 'とうもろこし', 'なす'] }] });
const hostReveal = mk({ you: 0, round: { roundId: 'r1', prompt: 'BBQで肉以外に焼きたいのは？', choices, status: 'open', predictions: {}, submittedSeats: [1, 2, 3], createdAt: '' } });

const FRAMES: Array<[string, RoomView]> = [
  ['プレイヤー / 予想受付', predict],
  ['プレイヤー / 結果発表', result],
  ['ホスト / 出題', hostPose],
  ['ホスト / 正解公開', hostReveal],
];

export default function SanrentanPreview() {
  return (
    <div style={{ minHeight: '100vh', background: '#e7e5df', padding: 24, fontFamily: "'Noto Sans JP',sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Noto+Serif+JP:wght@600;700&family=Zilla+Slab:wght@600;700&display=swap" />
      <h1 style={{ font: "700 22px 'Zilla Slab',serif", color: '#2E2A24', marginBottom: 16 }}>サンレンタン UI プレビュー（モックデータ）</h1>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {FRAMES.map(([label, view]) => (
          <div key={label}>
            <div style={{ font: "600 13px 'Noto Sans JP'", color: '#4a4034', marginBottom: 10 }}>{label}</div>
            <div style={{ width: 412, height: 820, overflow: 'hidden', borderRadius: 24, boxShadow: '0 12px 32px rgba(0,0,0,.22)', background: '#1c1712', padding: 6 }}>
              <div style={{ width: '100%', height: '100%', overflow: 'auto', borderRadius: 20 }}>
                <SanrentanPlay view={view} act={noop} join={noop} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
