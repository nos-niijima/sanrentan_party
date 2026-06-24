import { randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import type {
  HostRevealSpec,
  HostRevealState,
  HostRevealRound,
  HostRevealMultiplier,
  RoomActionDto,
  PoseRoundPayload,
  PredictPayload,
  RevealPayload,
} from '@sanrentan-party/shared';
import { HOST_REVEAL_MULTIPLIERS } from '@sanrentan-party/shared';
import { getStrategy } from './rulesets/registry';

/**
 * payload.multiplier を valid な HostRevealMultiplier に正規化する。
 * 不正値・未指定はすべて 1 にフォールバックする（throw しない＝出題自体は壊さない）。
 */
function normalizeMultiplier(raw: unknown): HostRevealMultiplier {
  if (typeof raw !== 'number') return 1;
  return (HOST_REVEAL_MULTIPLIERS as readonly number[]).includes(raw)
    ? (raw as HostRevealMultiplier)
    : 1;
}

/**
 * Host-Reveal パターンの状態機械（純粋関数）。
 * ホスト出題 → プレイヤー回答（open のみ）→ ホスト公開＆採点（冪等）。
 *
 * 永続化・席解決は Room モジュールの責務。ここは state の遷移のみを担う。
 */

export function initialHostRevealState(spec: HostRevealSpec): HostRevealState {
  void spec;
  return {
    pattern: 'host-reveal',
    version: 0,
    hostSeat: 0, // ルーム作成者が seat 0 = ホスト
    scores: {},
    round: null,
    history: [],
  };
}

export function applyHostRevealAction(
  spec: HostRevealSpec,
  state: HostRevealState,
  action: RoomActionDto,
  seat: number,
): { state: HostRevealState } {
  const isHost = seat === state.hostSeat;

  switch (action.action) {
    case 'poseRound':
      return { state: poseRound(spec, state, action.payload as unknown as PoseRoundPayload, isHost) };
    case 'predict':
      return { state: predict(spec, state, action.payload as unknown as PredictPayload, seat, isHost) };
    case 'reveal':
      return { state: reveal(spec, state, action.payload as unknown as RevealPayload, isHost) };
    case 'announceStart':
      return { state: announceStart(state, isHost) };
    case 'announceFinish':
      return { state: announceFinish(state, isHost) };
    case 'announceReplay':
      return { state: announceReplay(state, isHost) };
    default:
      throw new BadRequestException(`未知のアクション: ${action.action}`);
  }
}

function poseRound(spec: HostRevealSpec, state: HostRevealState, payload: PoseRoundPayload, isHost: boolean): HostRevealState {
  if (!isHost) throw new ForbiddenException('出題できるのはホストだけです');
  if (state.round && state.round.status === 'open') {
    throw new ConflictException('進行中のラウンドがあります（先に正解を公開してください）');
  }

  const prompt = (payload?.prompt ?? '').trim();
  const choices = payload?.choices ?? [];
  if (!prompt) throw new BadRequestException('お題が空です');
  if (!Array.isArray(choices) || choices.length < spec.round.choicesMin) {
    throw new BadRequestException(`選択肢は ${spec.round.choicesMin} 件以上必要です`);
  }
  if (new Set(choices).size !== choices.length) {
    throw new BadRequestException('選択肢に重複があります');
  }

  const multiplier = normalizeMultiplier(payload?.multiplier);

  const round: HostRevealRound = {
    roundId: randomUUID(),
    prompt,
    choices,
    status: 'open',
    predictions: {},
    multiplier,
    createdAt: new Date().toISOString(),
  };
  return { ...state, round, version: state.version + 1 };
}

function predict(spec: HostRevealSpec, state: HostRevealState, payload: PredictPayload, seat: number, isHost: boolean): HostRevealState {
  if (!state.round || state.round.status !== 'open') {
    throw new ConflictException('現在は予想を受け付けていません');
  }
  if (isHost) {
    throw new ForbiddenException('ホストは予想できません');
  }

  const strategy = getStrategy(spec.ruleset);
  const answer = payload?.answer ?? [];
  const err = strategy.validateAnswer(answer, state.round.choices, spec.config);
  if (err) throw new BadRequestException(err);

  // upsert（open 中は何度でも修正可）
  const predictions = {
    ...state.round.predictions,
    [String(seat)]: { seat, answer, submittedAt: new Date().toISOString() },
  };
  return {
    ...state,
    round: { ...state.round, predictions },
    version: state.version + 1,
  };
}

function reveal(spec: HostRevealSpec, state: HostRevealState, payload: RevealPayload, isHost: boolean): HostRevealState {
  if (!isHost) throw new ForbiddenException('正解を公開できるのはホストだけです');
  if (!state.round) throw new ConflictException('公開するラウンドがありません');
  if (state.round.status === 'revealed') {
    throw new ConflictException('このラウンドは既に公開済みです'); // 冪等化（二重採点防止）
  }

  const strategy = getStrategy(spec.ruleset);
  const answer = payload?.answer ?? [];
  const err = strategy.validateAnswer(answer, state.round.choices, spec.config);
  if (err) throw new BadRequestException(`正解が不正です: ${err}`);

  // 全予想（ホスト以外のみ）を採点し、累積スコアへ反映する。
  // 設問単位の倍率 (round.multiplier) を base points に乗算する（既定 1）。
  // scoreRankedTriple は変更しない — 倍率の適用は engine 側の責務。
  const multiplier = normalizeMultiplier(state.round.multiplier);
  const scores = { ...state.scores };
  const scored: HostRevealRound['predictions'] = {};
  for (const [key, p] of Object.entries(state.round.predictions)) {
    const result = strategy.score(answer, p.answer, spec.config);
    const points = result.points * multiplier;
    scored[key] = { ...p, hand: result.hand, points };
    scores[key] = (scores[key] ?? 0) + points;
  }

  const round: HostRevealRound = {
    ...state.round,
    status: 'revealed',
    answer,
    predictions: scored,
    // リビール演出（B 案）: reveal 完了時点で announce を idle に初期化。
    // ホストが「結果発表をはじめる」(announceStart) を押すまで waiting 状態。
    announce: { phase: 'idle', reveal: 0, cardsShown: 0 },
    revealedAt: new Date().toISOString(),
  };
  return {
    ...state,
    round,
    scores,
    history: [...state.history, { roundId: round.roundId, prompt: round.prompt, answer }],
    version: state.version + 1,
  };
}

/**
 * リビール演出: ホスト「結果発表をはじめる」。
 * idle → buildup に遷移。share 画面はこの phase 切替を polling で検知し、自動再生を開始する。
 * 既に buildup / done の場合は 409（idempotent ではない＝二重発火を防止）。
 */
function announceStart(state: HostRevealState, isHost: boolean): HostRevealState {
  if (!isHost) throw new ForbiddenException('リビール演出を操作できるのはホストだけです');
  if (!state.round || state.round.status !== 'revealed') {
    throw new ConflictException('公開済みのラウンドがありません');
  }
  const current = state.round.announce?.phase ?? 'idle';
  if (current !== 'idle') {
    throw new ConflictException(`リビール演出は既に開始済みです (phase=${current})`);
  }
  const announce = {
    phase: 'buildup' as const,
    reveal: 0,
    cardsShown: 0,
    startedAt: new Date().toISOString(),
  };
  return {
    ...state,
    round: { ...state.round, announce },
    version: state.version + 1,
  };
}

/**
 * リビール演出: 「次のお題を出す」または share 画面側「終了」。
 * buildup → done に遷移。done になるとプレイヤー (非ホスト) 視点にも全結果が解禁される。
 * idle / done から呼ばれた場合は 409。
 */
function announceFinish(state: HostRevealState, isHost: boolean): HostRevealState {
  if (!isHost) throw new ForbiddenException('リビール演出を操作できるのはホストだけです');
  if (!state.round || state.round.status !== 'revealed') {
    throw new ConflictException('公開済みのラウンドがありません');
  }
  const current = state.round.announce?.phase ?? 'idle';
  if (current === 'done') {
    throw new ConflictException('リビール演出は既に完了しています');
  }
  if (current === 'idle') {
    throw new ConflictException('リビール演出がまだ開始されていません');
  }
  const announce: HostRevealRound['announce'] = {
    ...(state.round.announce ?? { phase: 'buildup', reveal: 0, cardsShown: 0 }),
    phase: 'done',
    finishedAt: new Date().toISOString(),
  };
  return {
    ...state,
    round: { ...state.round, announce },
    version: state.version + 1,
  };
}

/**
 * リビール演出: 「もう一度見る」。
 * done → buildup に戻す（share 画面が再度自動再生する）。
 * idle / buildup から呼ばれた場合は 409。
 *
 * 注: 再演出中は再びプレイヤー (非ホスト) 視点で結果が伏せられる。
 * 「一度見せた結果を引っ込める」挙動になるが、現状の最小実装ではこの仕様で進める
 * （ホスト操作の責任で再演出するため、ユーザー体験として許容範囲）。
 */
function announceReplay(state: HostRevealState, isHost: boolean): HostRevealState {
  if (!isHost) throw new ForbiddenException('リビール演出を操作できるのはホストだけです');
  if (!state.round || state.round.status !== 'revealed') {
    throw new ConflictException('公開済みのラウンドがありません');
  }
  const current = state.round.announce?.phase ?? 'idle';
  if (current !== 'done') {
    throw new ConflictException('リビール演出が完了していません（再生し直せません）');
  }
  const announce = {
    phase: 'buildup' as const,
    reveal: 0,
    cardsShown: 0,
    startedAt: new Date().toISOString(),
  };
  return {
    ...state,
    round: { ...state.round, announce },
    version: state.version + 1,
  };
}

/**
 * 指定席の視点に絞り込む。
 * - 公開前(open): 正解は出さない。他人の予想内容も隠し、自分の予想のみ見せる。
 *   ただし「誰が回答済みか」(submittedSeats) は見せる。
 * - 公開後(revealed) かつ announce.phase !== 'done' (リビール演出中・未開始):
 *   ホストおよびホスト席 = share 画面には全公開（演出進行・大画面表示のため）。
 *   プレイヤー (非ホスト) には正解・採点 (hand/points) を伏せ、自分の予想 answer のみ見せる。
 *   「大画面で発表中」待機状態（手元 UI は WaitingScreen）。
 * - 公開後(revealed) かつ announce.phase === 'done' (演出完了): 全開示。
 * - 観戦者(seat=null): プレイヤー扱い（hostSeat と一致しないため非公開）。
 */
export function redactHostRevealFor(
  spec: HostRevealSpec,
  state: HostRevealState,
  seat: number | null,
): HostRevealState {
  void spec;
  if (!state.round) return state;

  if (state.round.status === 'open') {
    const submittedSeats = Object.values(state.round.predictions).map((p) => p.seat);
    const own =
      seat != null && state.round.predictions[String(seat)]
        ? { [String(seat)]: state.round.predictions[String(seat)] }
        : {};
    return {
      ...state,
      round: {
        ...state.round,
        answer: undefined,
        predictions: own,
        submittedSeats,
      },
    };
  }

  // revealed: リビール演出進行中はプレイヤー (非ホスト) に対し正解・採点を伏せる。
  // ホスト席 = share 画面はホストの責任で常に全公開（演出再生のため）。
  const announcePhase = state.round.announce?.phase ?? 'done'; // 後方互換: announce 未設定なら全公開扱い
  const isHostView = seat === state.hostSeat;

  if (announcePhase !== 'done' && !isHostView) {
    // プレイヤー視点: 自分の予想 (answer のみ) を残し、正解・他人の予想・採点を伏せる
    // 累積スコア (state.scores) もこのラウンドの加算を反映させたままだと「いま何点取った」が
    // 演出前にバレるため、history からこの round 分を取り除いた前ラウンド時点の scores を返す。
    const own =
      seat != null && state.round.predictions[String(seat)]
        ? {
            [String(seat)]: {
              seat: state.round.predictions[String(seat)].seat,
              answer: state.round.predictions[String(seat)].answer,
              submittedAt: state.round.predictions[String(seat)].submittedAt,
              // hand / points は伏せる（演出完了まで明かさない）
            },
          }
        : {};
    // scores を「前ラウンド時点」に戻す: 今 round の各 prediction.points を差し引く。
    // （base points × multiplier は既に reveal() で乗算済み）
    const rolledBackScores = { ...state.scores };
    for (const [key, p] of Object.entries(state.round.predictions)) {
      const delta = p.points ?? 0;
      if (delta && rolledBackScores[key] !== undefined) {
        rolledBackScores[key] = rolledBackScores[key] - delta;
        if (rolledBackScores[key] === 0) {
          // 0 は削除せず残す（席は存在し続けるため、UI で「0 点表示」を維持するほうが自然）
        }
      }
    }
    return {
      ...state,
      scores: rolledBackScores,
      round: {
        ...state.round,
        answer: undefined,
        predictions: own,
      },
    };
  }

  // revealed + announce.phase==='done' (またはホスト視点): 全開示
  return state;
}
