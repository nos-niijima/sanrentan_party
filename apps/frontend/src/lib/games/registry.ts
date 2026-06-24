import type { ComponentType } from 'react';
import type { GamePlayProps } from './types';
import SanrentanPlay from '@/components/games/sanrentan/SanrentanPlay';
import HostRevealGeneric from '@/components/games/HostRevealGeneric';

/**
 * ゲーム UI レジストリ —— 切り分けの境界。
 *
 * GameSpec(JSON) は `ui` キーで「どの UI を使うか」を*参照*するだけ。
 * 実体（レイアウト）はここに登録した React コンポーネント（コード）。
 * 未登録の host-reveal ゲームは汎用 UI にフォールバックするので、
 * 似たゲームは JSON だけ、凝った見た目が欲しいときだけここに足す。
 */
const REGISTRY: Record<string, ComponentType<GamePlayProps>> = {
  sanrentan: SanrentanPlay,
  'host-reveal': HostRevealGeneric,
};

export function resolveGameUI(ui: string | undefined): ComponentType<GamePlayProps> {
  return (ui && REGISTRY[ui]) || HostRevealGeneric;
}
