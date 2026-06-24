import { scoreRankedTriple } from './ranked-triple';

// 仕様の採点テーブル（必ず通すこと）。正解 [やきそば, ほたて, マシュマロ]。
describe('scoreRankedTriple', () => {
  const A = ['やきそば', 'ほたて', 'マシュマロ'];

  const cases: Array<[string[], string, number]> = [
    [['やきそば', 'ほたて', 'マシュマロ'], 'サンレンタン', 6],
    [['ほたて', 'やきそば', 'マシュマロ'], 'サンレンプク', 4],
    [['やきそば', 'ほたて', 'しいたけ'], 'ニレンタン', 3],
    [['ほたて', 'マシュマロ', 'ピーマン'], 'プクプク', 2],
    [['やきそば', 'ピーマン', 'とうもろこし'], 'タン', 1],
    [['ピーマン', 'とうもろこし', 'なす'], 'ハズレ', 0],
  ];

  it.each(cases)('予想 %j -> %s / %i', (G, hand, points) => {
    expect(scoreRankedTriple(A, G)).toEqual({ hand, points });
  });

  it('最高点 1 つだけを採用する（合算しない）', () => {
    // 位置1,2,3一致(6) と 順不同3一致(4) が同時成立 → 6 のみ
    expect(scoreRankedTriple(A, A).points).toBe(6);
  });

  it('位置3だけ一致は役なし（ハズレ）', () => {
    expect(scoreRankedTriple(A, ['ピーマン', 'なす', 'マシュマロ'])).toEqual({ hand: 'ハズレ', points: 0 });
  });

  // §5 表が触れていない非自明ケース（将来のリグレッション防止）
  it('位置1&3一致・位置2不一致 → プクプク/2（一致2要素は順不同でも2件）', () => {
    expect(scoreRankedTriple(A, ['やきそば', 'ピーマン', 'マシュマロ'])).toEqual({ hand: 'プクプク', points: 2 });
  });

  it('位置2&3一致・位置1不一致 → プクプク/2（プクプクは位置1を要しない）', () => {
    expect(scoreRankedTriple(A, ['ピーマン', 'ほたて', 'マシュマロ'])).toEqual({ hand: 'プクプク', points: 2 });
  });

  it('重複入力でも順不同一致を過大評価しない（A=abc, G=aab → サンレンプク(4)にならず プクプク/2）', () => {
    // distinct 一致は {a,b}=2、かつ pos1 一致 → max(プクプク2, タン1)=プクプク。
    // （旧実装は位置数え inter=3 で サンレンプク=4 と誤判定していた）
    expect(scoreRankedTriple(['a', 'b', 'c'], ['a', 'a', 'b'])).toEqual({ hand: 'プクプク', points: 2 });
  });
});
