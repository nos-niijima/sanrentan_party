import type { ScoreResult } from '@sanrentan-party/shared';

/**
 * Host-Reveal の採点戦略。GameSpec.ruleset で 1 つ選ばれる。
 *
 * 拡張の要点: 似たゲームは既存戦略を JSON(config) で再利用、
 * 全く新しい採点だけ新しい ScoringStrategy をコードで足してレジストリに登録する。
 */
export interface ScoringStrategy {
  /** レジストリのキー（GameSpec.ruleset と一致）。 */
  id: string;

  /**
   * 回答（正解・予想とも同じ形）の妥当性を検証する。
   * 問題があればエラーメッセージ、なければ null を返す。
   * @param answer  検証する回答（正解 or 予想）。
   * @param choices お題の選択肢。
   * @param cfg     GameSpec.config。
   */
  validateAnswer(answer: string[], choices: string[], cfg?: Record<string, unknown>): string | null;

  /**
   * 予想を採点する。
   * @param answer     正解。
   * @param prediction プレイヤーの予想。
   * @param cfg        GameSpec.config。
   */
  score(answer: string[], prediction: string[], cfg?: Record<string, unknown>): ScoreResult;
}
