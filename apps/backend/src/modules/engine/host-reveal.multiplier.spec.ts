import {
  applyHostRevealAction,
  initialHostRevealState,
} from './host-reveal.engine';
import type {
  HostRevealSpec,
  RoomActionDto,
} from '@sanrentan-party/shared';

/**
 * Stage 2: 設問単位の得点倍率 (1x/2x/3x/5x/10x) の engine 配線テスト。
 *
 * - poseRound payload.multiplier を round.multiplier に保存する
 * - reveal 時、base points × multiplier を points に反映する
 * - 不正/未指定の multiplier は 1 にフォールバック（throw しない）
 *
 * scoreRankedTriple (ruleset) は変更しないため、base points は §5 表のまま。
 */

const A = ['やきそば', 'ほたて', 'マシュマロ']; // 正解
// 全プレイヤーが「サンレンタン (base=6)」を引く想定の予想。
const SANRENTAN_GUESS = ['やきそば', 'ほたて', 'マシュマロ'];

function spec(): HostRevealSpec {
  return {
    pattern: 'host-reveal',
    ruleset: 'ranked-triple',
    round: {
      choicesMin: 3,
      answer: { kind: 'ranking', size: 3 },
    },
  };
}

function poseAction(prompt: string, choices: string[], multiplier?: unknown): RoomActionDto {
  return {
    action: 'poseRound',
    payload: {
      prompt,
      choices,
      ...(multiplier !== undefined ? { multiplier } : {}),
    },
  };
}

describe('host-reveal engine: scoring multiplier', () => {
  it('poseRound with multiplier=2 stores multiplier in round', () => {
    const s = spec();
    const state0 = initialHostRevealState(s);

    const { state: state1 } = applyHostRevealAction(
      s,
      state0,
      poseAction('お題', A, 2),
      0, // host seat
    );

    expect(state1.round).not.toBeNull();
    expect(state1.round?.multiplier).toBe(2);
  });

  it('reveal with multiplier=2 doubles each player points', () => {
    const s = spec();
    let state = initialHostRevealState(s);

    // host 出題（multiplier=2）
    state = applyHostRevealAction(s, state, poseAction('お題', A, 2), 0).state;

    // 2 名のプレイヤー (seat=1, seat=2) がサンレンタン (base=6) を引く予想
    state = applyHostRevealAction(
      s,
      state,
      { action: 'predict', payload: { answer: SANRENTAN_GUESS } },
      1,
    ).state;
    state = applyHostRevealAction(
      s,
      state,
      { action: 'predict', payload: { answer: SANRENTAN_GUESS } },
      2,
    ).state;

    // host が正解公開
    const revealed = applyHostRevealAction(
      s,
      state,
      { action: 'reveal', payload: { answer: A } },
      0,
    ).state;

    // base 6 × multiplier 2 = 12 が各プレイヤーに加算される
    expect(revealed.round?.status).toBe('revealed');
    expect(revealed.round?.predictions['1']?.points).toBe(12);
    expect(revealed.round?.predictions['2']?.points).toBe(12);
    expect(revealed.round?.predictions['1']?.hand).toBe('サンレンタン');
    expect(revealed.scores['1']).toBe(12);
    expect(revealed.scores['2']).toBe(12);
  });

  it('poseRound with invalid multiplier defaults to 1', () => {
    const s = spec();
    let state = initialHostRevealState(s);

    // 不正値 (4 は valid set [1,2,3,5,10] に含まれない) → 1 にフォールバック
    state = applyHostRevealAction(s, state, poseAction('お題', A, 4), 0).state;
    expect(state.round?.multiplier).toBe(1);

    // 予想 → reveal で base 6 × 1 = 6 になることを併せて確認（採点側にもフォールバックが効く）
    state = applyHostRevealAction(
      s,
      state,
      { action: 'predict', payload: { answer: SANRENTAN_GUESS } },
      1,
    ).state;
    const revealed = applyHostRevealAction(
      s,
      state,
      { action: 'reveal', payload: { answer: A } },
      0,
    ).state;
    expect(revealed.round?.predictions['1']?.points).toBe(6);
    expect(revealed.scores['1']).toBe(6);
  });

  it('poseRound without multiplier defaults to 1 (no carry-over expectation; engine just normalizes)', () => {
    const s = spec();
    const state = applyHostRevealAction(
      s,
      initialHostRevealState(s),
      poseAction('お題', A),
      0,
    ).state;
    expect(state.round?.multiplier).toBe(1);
  });

  it.each([
    [1, 6],
    [2, 12],
    [3, 18],
    [5, 30],
    [10, 60],
  ])('multiplier %i multiplies base 6 to %i', (m, expected) => {
    const s = spec();
    let state = initialHostRevealState(s);
    state = applyHostRevealAction(s, state, poseAction('お題', A, m), 0).state;
    state = applyHostRevealAction(
      s,
      state,
      { action: 'predict', payload: { answer: SANRENTAN_GUESS } },
      1,
    ).state;
    const revealed = applyHostRevealAction(
      s,
      state,
      { action: 'reveal', payload: { answer: A } },
      0,
    ).state;
    expect(revealed.round?.predictions['1']?.points).toBe(expected);
    expect(revealed.scores['1']).toBe(expected);
  });
});
