import {
  applyHostRevealAction,
  initialHostRevealState,
  redactHostRevealFor,
} from './host-reveal.engine';
import type {
  HostRevealSpec,
  HostRevealState,
  RoomActionDto,
} from '@sanrentan-party/shared';

/**
 * Stage 3: リビール演出 (B 案) の announce 状態機械 + redact 連動テスト。
 *
 * - reveal 完了で round.announce が { phase:'idle', reveal:0, cardsShown:0 } に初期化される
 * - announceStart: idle → buildup（ホストのみ、startedAt 付与）
 * - announceFinish: buildup → done（ホストのみ、finishedAt 付与）
 * - announceReplay: done → buildup（再演出。ホストのみ）
 * - 非ホストが announce* を呼ぶと 403 (ForbiddenException)
 * - 不正遷移は 409 (ConflictException)
 * - redact: phase !== 'done' のときプレイヤー視点で answer/hand/points/scores を伏せる
 *           ホスト視点 (seat === hostSeat) では常に全公開
 */

const CHOICES = ['やきそば', 'ほたて', 'マシュマロ'];
const ANSWER = ['やきそば', 'ほたて', 'マシュマロ'];

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

/** seat=0 をホスト、seat=1 をプレイヤーとして reveal 直後 (announce=idle) まで進める */
function setupRevealed(): { s: HostRevealSpec; state: HostRevealState } {
  const s = spec();
  let state = initialHostRevealState(s);
  state = applyHostRevealAction(s, state, {
    action: 'poseRound',
    payload: { prompt: 'お題', choices: CHOICES },
  } as RoomActionDto, 0).state;
  state = applyHostRevealAction(s, state, {
    action: 'predict',
    payload: { answer: ANSWER },
  } as RoomActionDto, 1).state;
  state = applyHostRevealAction(s, state, {
    action: 'reveal',
    payload: { answer: ANSWER },
  } as RoomActionDto, 0).state;
  return { s, state };
}

describe('host-reveal engine: リビール演出 (announce)', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // announce 初期化
  // ─────────────────────────────────────────────────────────────────────────
  describe('reveal initializes announce', () => {
    it('reveal completion sets announce.phase=idle with reveal=0, cardsShown=0', () => {
      const { state } = setupRevealed();
      expect(state.round?.status).toBe('revealed');
      expect(state.round?.announce).toBeDefined();
      expect(state.round?.announce?.phase).toBe('idle');
      expect(state.round?.announce?.reveal).toBe(0);
      expect(state.round?.announce?.cardsShown).toBe(0);
      expect(state.round?.announce?.startedAt).toBeUndefined();
      expect(state.round?.announce?.finishedAt).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // announceStart
  // ─────────────────────────────────────────────────────────────────────────
  describe('announceStart', () => {
    it('host transitions idle → buildup with startedAt', () => {
      const { s, state } = setupRevealed();
      const next = applyHostRevealAction(
        s,
        state,
        { action: 'announceStart' } as RoomActionDto,
        0,
      ).state;
      expect(next.round?.announce?.phase).toBe('buildup');
      expect(next.round?.announce?.startedAt).toBeDefined();
      expect(next.version).toBe(state.version + 1);
    });

    it('non-host (seat=1) gets 403', () => {
      const { s, state } = setupRevealed();
      expect(() =>
        applyHostRevealAction(
          s,
          state,
          { action: 'announceStart' } as RoomActionDto,
          1,
        ),
      ).toThrow(/ホスト/);
    });

    it('calling start twice returns 409', () => {
      const { s, state } = setupRevealed();
      const after1 = applyHostRevealAction(
        s,
        state,
        { action: 'announceStart' } as RoomActionDto,
        0,
      ).state;
      expect(() =>
        applyHostRevealAction(
          s,
          after1,
          { action: 'announceStart' } as RoomActionDto,
          0,
        ),
      ).toThrow(/既に開始/);
    });

    it('calling start when no revealed round returns 409', () => {
      const s = spec();
      const state = initialHostRevealState(s);
      expect(() =>
        applyHostRevealAction(
          s,
          state,
          { action: 'announceStart' } as RoomActionDto,
          0,
        ),
      ).toThrow(/公開済み/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // announceFinish
  // ─────────────────────────────────────────────────────────────────────────
  describe('announceFinish', () => {
    it('host transitions buildup → done with finishedAt', () => {
      const { s, state } = setupRevealed();
      const buildup = applyHostRevealAction(
        s,
        state,
        { action: 'announceStart' } as RoomActionDto,
        0,
      ).state;
      const done = applyHostRevealAction(
        s,
        buildup,
        { action: 'announceFinish' } as RoomActionDto,
        0,
      ).state;
      expect(done.round?.announce?.phase).toBe('done');
      expect(done.round?.announce?.finishedAt).toBeDefined();
      expect(done.round?.announce?.startedAt).toBeDefined(); // 引継ぎ
      expect(done.version).toBe(buildup.version + 1);
    });

    it('finish from idle returns 409', () => {
      const { s, state } = setupRevealed();
      expect(() =>
        applyHostRevealAction(
          s,
          state,
          { action: 'announceFinish' } as RoomActionDto,
          0,
        ),
      ).toThrow(/開始されていません/);
    });

    it('finish twice returns 409', () => {
      const { s, state } = setupRevealed();
      const buildup = applyHostRevealAction(s, state, { action: 'announceStart' } as RoomActionDto, 0).state;
      const done = applyHostRevealAction(s, buildup, { action: 'announceFinish' } as RoomActionDto, 0).state;
      expect(() =>
        applyHostRevealAction(s, done, { action: 'announceFinish' } as RoomActionDto, 0),
      ).toThrow(/既に完了/);
    });

    it('non-host (seat=1) gets 403', () => {
      const { s, state } = setupRevealed();
      const buildup = applyHostRevealAction(s, state, { action: 'announceStart' } as RoomActionDto, 0).state;
      expect(() =>
        applyHostRevealAction(s, buildup, { action: 'announceFinish' } as RoomActionDto, 1),
      ).toThrow(/ホスト/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // announceReplay
  // ─────────────────────────────────────────────────────────────────────────
  describe('announceReplay', () => {
    it('host transitions done → buildup (resets startedAt)', () => {
      const { s, state } = setupRevealed();
      let cur = applyHostRevealAction(s, state, { action: 'announceStart' } as RoomActionDto, 0).state;
      cur = applyHostRevealAction(s, cur, { action: 'announceFinish' } as RoomActionDto, 0).state;
      const replayed = applyHostRevealAction(s, cur, { action: 'announceReplay' } as RoomActionDto, 0).state;
      expect(replayed.round?.announce?.phase).toBe('buildup');
      expect(replayed.round?.announce?.startedAt).toBeDefined();
    });

    it('replay from buildup returns 409', () => {
      const { s, state } = setupRevealed();
      const buildup = applyHostRevealAction(s, state, { action: 'announceStart' } as RoomActionDto, 0).state;
      expect(() =>
        applyHostRevealAction(s, buildup, { action: 'announceReplay' } as RoomActionDto, 0),
      ).toThrow(/完了していません/);
    });

    it('replay from idle returns 409', () => {
      const { s, state } = setupRevealed();
      expect(() =>
        applyHostRevealAction(s, state, { action: 'announceReplay' } as RoomActionDto, 0),
      ).toThrow(/完了していません/);
    });

    it('non-host (seat=1) gets 403', () => {
      const { s, state } = setupRevealed();
      let cur = applyHostRevealAction(s, state, { action: 'announceStart' } as RoomActionDto, 0).state;
      cur = applyHostRevealAction(s, cur, { action: 'announceFinish' } as RoomActionDto, 0).state;
      expect(() =>
        applyHostRevealAction(s, cur, { action: 'announceReplay' } as RoomActionDto, 1),
      ).toThrow(/ホスト/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // redact 連動
  // ─────────────────────────────────────────────────────────────────────────
  describe('redact during announce', () => {
    it('player view (seat=1) at announce=idle hides answer / hand / points', () => {
      const { s, state } = setupRevealed();
      const playerView = redactHostRevealFor(s, state, 1);
      // 自分の予想 answer は残す
      expect(playerView.round?.predictions['1']?.answer).toEqual(ANSWER);
      // 採点は隠す
      expect(playerView.round?.predictions['1']?.hand).toBeUndefined();
      expect(playerView.round?.predictions['1']?.points).toBeUndefined();
      // 正解は隠す
      expect(playerView.round?.answer).toBeUndefined();
      // scores はロールバック（このラウンドの加算分が差し引かれる）
      expect(playerView.scores['1']).toBe(0); // before round 1: 0
    });

    it('host view (seat=0) at announce=idle shows everything', () => {
      const { s, state } = setupRevealed();
      const hostView = redactHostRevealFor(s, state, 0);
      expect(hostView.round?.answer).toEqual(ANSWER);
      expect(hostView.round?.predictions['1']?.hand).toBe('サンレンタン');
      expect(hostView.round?.predictions['1']?.points).toBe(6);
      expect(hostView.scores['1']).toBe(6);
    });

    it('player view at announce=buildup still hides results', () => {
      const { s, state } = setupRevealed();
      const buildup = applyHostRevealAction(s, state, { action: 'announceStart' } as RoomActionDto, 0).state;
      const playerView = redactHostRevealFor(s, buildup, 1);
      expect(playerView.round?.answer).toBeUndefined();
      expect(playerView.round?.predictions['1']?.points).toBeUndefined();
      expect(playerView.scores['1']).toBe(0);
    });

    it('player view at announce=done shows everything', () => {
      const { s, state } = setupRevealed();
      let cur = applyHostRevealAction(s, state, { action: 'announceStart' } as RoomActionDto, 0).state;
      cur = applyHostRevealAction(s, cur, { action: 'announceFinish' } as RoomActionDto, 0).state;
      const playerView = redactHostRevealFor(s, cur, 1);
      expect(playerView.round?.answer).toEqual(ANSWER);
      expect(playerView.round?.predictions['1']?.hand).toBe('サンレンタン');
      expect(playerView.round?.predictions['1']?.points).toBe(6);
      expect(playerView.scores['1']).toBe(6);
    });

    it('spectator (seat=null) at announce=idle is treated as non-host (hidden)', () => {
      const { s, state } = setupRevealed();
      const spectatorView = redactHostRevealFor(s, state, null);
      expect(spectatorView.round?.answer).toBeUndefined();
      // 他人の予想は spectator には元々見せない
      // predictions['1'] は spectator にとっては自分の予想ではないので空のまま
      expect(spectatorView.round?.predictions['1']).toBeUndefined();
      expect(spectatorView.scores['1']).toBe(0);
    });

    it('player view after replay (done → buildup) again hides results', () => {
      const { s, state } = setupRevealed();
      let cur = applyHostRevealAction(s, state, { action: 'announceStart' } as RoomActionDto, 0).state;
      cur = applyHostRevealAction(s, cur, { action: 'announceFinish' } as RoomActionDto, 0).state;
      // ここまでで done。プレイヤーは結果が見えている。
      const playerViewDone = redactHostRevealFor(s, cur, 1);
      expect(playerViewDone.round?.answer).toEqual(ANSWER);

      // replay で buildup に戻す
      const replayed = applyHostRevealAction(s, cur, { action: 'announceReplay' } as RoomActionDto, 0).state;
      const playerViewReplay = redactHostRevealFor(s, replayed, 1);
      expect(playerViewReplay.round?.answer).toBeUndefined();
      expect(playerViewReplay.round?.predictions['1']?.points).toBeUndefined();
    });

    it('backward compat: legacy revealed round without announce field is treated as done (no redact)', () => {
      const { s, state } = setupRevealed();
      // announce フィールドを取り除く（古いデータの想定）
      const legacy: HostRevealState = {
        ...state,
        round: { ...state.round!, announce: undefined },
      };
      const playerView = redactHostRevealFor(s, legacy, 1);
      // announce 未設定は done 扱い → 全公開
      expect(playerView.round?.answer).toEqual(ANSWER);
      expect(playerView.round?.predictions['1']?.points).toBe(6);
      expect(playerView.scores['1']).toBe(6);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // version monotone
  // ─────────────────────────────────────────────────────────────────────────
  describe('version monotone', () => {
    it('announce* increments version by 1 each transition', () => {
      const { s, state } = setupRevealed();
      const v0 = state.version;
      const after1 = applyHostRevealAction(s, state, { action: 'announceStart' } as RoomActionDto, 0).state;
      expect(after1.version).toBe(v0 + 1);
      const after2 = applyHostRevealAction(s, after1, { action: 'announceFinish' } as RoomActionDto, 0).state;
      expect(after2.version).toBe(v0 + 2);
      const after3 = applyHostRevealAction(s, after2, { action: 'announceReplay' } as RoomActionDto, 0).state;
      expect(after3.version).toBe(v0 + 3);
    });
  });
});
