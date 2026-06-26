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
      prompt: 'シェアハウスでやりたいことは？',
      choices: [
        'たこ焼き・鍋パーティー',
        '深夜のコンビニ散歩',
        '季節イベント（花火・ハロウィン・クリスマス）',
        '旅行・日帰りお出かけ',
        '映画・アニメ鑑賞会',
        'みんなで何か挑戦',
      ],
    },
    {
      prompt: 'みんなと行きたい場所は?',
      choices: [
        '海',
        '遊園地・テーマパーク',
        '温泉・サウナ',
        'キャンプ・自然スポット',
        '食べ歩き・飲み屋街',
        'フェス・イベント',
      ],
    },
    {
      prompt: '人生で大事にしていることは?',
      choices: [
        '愛・人とのつながり',
        '挑戦すること',
        '楽しむこと',
        '自分らしくいること',
        '安心・安定',
        '成長し続けること',
      ],
    },
    {
      prompt: 'コンビニで気づいたら買ってるものは?',
      choices: ['アイス', 'お菓子', 'カフェラテ', '唐揚げ系', 'グミ', 'お酒・ジュース'],
    },
    {
      prompt: '寝る前にやりがちなこと',
      choices: ['YouTube', 'SNS', '妄想タイム', '音楽聴く', '明日の予定確認', '気づいたら寝落ち'],
    },
    {
      prompt: '住人から言われたら嬉しい一言',
      choices: [
        '「ご飯食べる?」',
        '「今から散歩行かない?」',
        '「話聞こうか?」',
        '「髪切った?」',
        '「コーヒーいる?」',
        '「おかえり!」',
      ],
    },
  ],
};
