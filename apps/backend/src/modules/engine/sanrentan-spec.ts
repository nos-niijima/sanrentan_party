import type { HostRevealSpec } from '@sanrentan-party/shared';

/**
 * サンレンタン の固定 GameSpec。
 *
 * 元の playtest-board テンプレートでは Game/GameSpec モデルが DB に存在し
 * ルーム作成時に最新版を読み込んでいたが、サンレンタン Party では単一ゲーム前提のため
 * ここに定数として埋め込み、Game/GameSpec モデルを廃止している。
 */
export const SANRENTAN_SPEC: HostRevealSpec = {
  pattern: 'host-reveal',
  ui: 'sanrentan',
  ruleset: 'ranked-triple',
  round: {
    promptLabel: 'お題',
    choiceLabel: '選択肢',
    choicesMin: 3,
    answer: { kind: 'ranking', size: 3 },
  },
  hands: [
    { points: 6, label: 'サンレンタン' },
    { points: 4, label: 'サンレンプク' },
    { points: 3, label: 'ニレンタン' },
    { points: 2, label: 'プクプク' },
    { points: 1, label: 'タン' },
    { points: 0, label: 'ハズレ' },
  ],
  presets: [
    {
      prompt: '焼いたら美味しい順（1〜3着を予想）',
      choices: ['やきそば', 'ほたて', 'マシュマロ', 'しいたけ', 'ピーマン', 'とうもろこし', 'なす'],
    },
  ],
};
