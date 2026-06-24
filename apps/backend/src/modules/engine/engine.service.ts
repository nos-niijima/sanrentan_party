import { Injectable, Logger } from '@nestjs/common';
import type {
  GameSpecDocument,
  GameState,
  HostRevealSpec,
  HostRevealState,
  RoomActionDto,
} from '@sanrentan-party/shared';
import {
  initialHostRevealState,
  applyHostRevealAction,
  redactHostRevealFor,
} from './host-reveal.engine';

/**
 * 宣言的ゲームエンジンのシーム（接合部）。
 *
 * GameSpec を解釈してサーバ権威のゲーム状態を生成・遷移・視点絞り込みする。
 * spec.pattern で解釈方法を分岐する。実装済みパターン:
 *   - 'host-reveal' : ホスト出題 → プレイヤー回答 → ホスト公開＆採点（サンレンタン等）。
 * 未対応の pattern は placeholder にフォールバックする（TODO(next-pass): 宣言的解釈）。
 *
 * このサービスは純粋（副作用・DB アクセスなし）。永続化は Room モジュールの責務。
 */
@Injectable()
export class EngineService {
  private readonly logger = new Logger(EngineService.name);

  /**
   * パターン判定は state を最優先する（state は自分のパターンを保持しており不変）。
   * GameSpec は別バージョン管理の可変ドキュメントなので、spec.pattern だけに依存すると
   * spec が v2 で pattern を失った場合に既存ルームのリダクションが外れて全漏洩しうる。
   */
  private isHostReveal(spec: GameSpecDocument, state?: GameState): boolean {
    const statePattern = (state as { pattern?: string } | undefined)?.pattern;
    if (statePattern) return statePattern === 'host-reveal';
    return spec?.pattern === 'host-reveal';
  }

  initialState(spec: GameSpecDocument, seatCount: number): GameState {
    if (this.isHostReveal(spec)) {
      return initialHostRevealState(spec as unknown as HostRevealSpec) as unknown as GameState;
    }
    // TODO(next-pass): 宣言的 GameSpec（zones/setup）の解釈。
    void seatCount;
    return { turn: 0, shared: {}, log: ['ルーム作成'] };
  }

  applyAction(
    spec: GameSpecDocument,
    state: GameState,
    action: RoomActionDto,
    seat: number,
  ): { state: GameState } {
    if (this.isHostReveal(spec, state)) {
      const { state: next } = applyHostRevealAction(
        spec as unknown as HostRevealSpec,
        state as unknown as HostRevealState,
        action,
        seat,
      );
      return { state: next as unknown as GameState };
    }
    // TODO(next-pass): action を GameSpecAction と突き合わせ when/effect を評価。
    const next: GameState = { ...state };
    next.log = [...(state.log ?? []), `seat ${seat}: ${action.action}`];
    next.turn = (state.turn ?? 0) + 1;
    return { state: next };
  }

  redactFor(
    spec: GameSpecDocument,
    state: GameState,
    seat: number | null,
  ): GameState {
    if (this.isHostReveal(spec, state)) {
      return redactHostRevealFor(
        spec as unknown as HostRevealSpec,
        state as unknown as HostRevealState,
        seat,
      ) as unknown as GameState;
    }
    // TODO(next-pass): spec.zones の hidden / ownerScoped によるマスク。
    return { ...state };
  }
}
