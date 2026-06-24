import { BadRequestException } from '@nestjs/common';
import type { ScoringStrategy } from './strategy';
import { rankedTriple } from './ranked-triple';

/**
 * 採点戦略のレジストリ。GameSpec.ruleset でここから 1 つ選ばれる。
 * 新しい採点を持つゲームは、ScoringStrategy を実装してここに足すだけでよい。
 */
const STRATEGIES: Record<string, ScoringStrategy> = {
  [rankedTriple.id]: rankedTriple,
};

export function getStrategy(ruleset: string): ScoringStrategy {
  const strategy = STRATEGIES[ruleset];
  if (!strategy) {
    throw new BadRequestException(`未対応のルールセットです: ${ruleset}`);
  }
  return strategy;
}

export function hasStrategy(ruleset: string): boolean {
  return ruleset in STRATEGIES;
}
