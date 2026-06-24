import type { ScoreResult } from '@sanrentan-party/shared';
import type { ScoringStrategy } from './strategy';

/**
 * 拡張メモ: この ruleset は「ちょうど 3 要素の順位付け」専用（名前のとおり）。
 * 似たお題（選択肢・プリセットだけ違う）は GameSpec(JSON) の差し替えだけで追加できる。
 * 要素数が 3 でない／採点が異なるゲームは、新しい ScoringStrategy を実装して
 * registry に登録する（spec.config / answer.kind / hands は現状この ruleset では未使用）。
 *
 * サンレンタンの採点。正解 A=[A1,A2,A3]、予想 G=[G1,G2,G3]。
 * 成立する役のうち「最高点 1 つだけ」を採用（合算しない）。
 *
 *   サンレンタン  6  位置1,2,3 すべて一致
 *   サンレンプク  4  3 要素が順不同で一致
 *   ニレンタン    3  位置1,2 が一致
 *   プクプク      2  2 要素が順不同で一致
 *   タン          1  位置1 が一致
 *   ハズレ        0  上記いずれも不成立
 */
const LABELS: Record<number, string> = {
  6: 'サンレンタン',
  4: 'サンレンプク',
  3: 'ニレンタン',
  2: 'プクプク',
  1: 'タン',
  0: 'ハズレ',
};

export function scoreRankedTriple(A: string[], G: string[]): ScoreResult {
  const pos1 = G[0] === A[0];
  const pos2 = G[1] === A[1];
  const pos3 = G[2] === A[2];

  const setA = new Set(A);
  // 順不同の一致数（distinct 要素で数える。重複入力でも過大カウントしない）。
  const inter = new Set(G.filter((g) => setA.has(g))).size;

  const cands: number[] = [];
  if (pos1 && pos2 && pos3) cands.push(6); // サンレンタン
  if (inter === 3) cands.push(4); // サンレンプク
  if (pos1 && pos2) cands.push(3); // ニレンタン
  if (inter === 2) cands.push(2); // プクプク
  if (pos1) cands.push(1); // タン

  const points = cands.length ? Math.max(...cands) : 0;
  return { hand: LABELS[points], points };
}

/** size 件・選択肢内・相異なる、を検証する汎用バリデータ。 */
function validateDistinctFromChoices(answer: string[], choices: string[], size: number): string | null {
  if (!Array.isArray(answer) || answer.length !== size) {
    return `回答は ${size} 件で指定してください`;
  }
  if (new Set(answer).size !== size) {
    return '回答に重複があります';
  }
  const choiceSet = new Set(choices);
  if (!answer.every((a) => choiceSet.has(a))) {
    return '回答に選択肢以外の要素が含まれています';
  }
  return null;
}

export const rankedTriple: ScoringStrategy = {
  id: 'ranked-triple',
  validateAnswer(answer, choices) {
    return validateDistinctFromChoices(answer, choices, 3);
  },
  score(answer, prediction) {
    return scoreRankedTriple(answer, prediction);
  },
};
