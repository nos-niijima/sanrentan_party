'use client';

// 画面3（結果発表）: 正解発表・役バナー・馬券・累積順位。
// round.status === 'revealed' のプレイヤー向け。
// 設計: construction/design/サンレンタン_画面3_結果発表.dc.html Layout 1（払戻票式）を忠実移植。

import type { HostRevealRound } from '@sanrentan-party/shared';
import {
  Shell, Confetti, PlayerColorDot,
  feltBg, ticketBg,
  HAND_PT, SANS, SERIF, DISPLAY, gateOf, Row,
} from '../shared';

interface ResultScreenProps {
  round: HostRevealRound;
  mySeat: number;
  rows: Row[];
  roundNo?: number; // 第NR。SanrentanPlay から history.length で渡す（revealed は既に history 反映後）
  roomId?: string;  // 部屋番号バッジ表示用 (末尾4文字)
  roomName?: string; // 卓名 (backend.Room.name)。topbar 入場券エリアに控えめ表示
}

// ---- 内部: 役チップ行 ----
function YakuStrip({ hand }: { hand: string | undefined }) {
  const yaku = Object.entries(HAND_PT).filter(([h]) => h !== 'ハズレ');
  return (
    <div style={{ display: 'flex', gap: 6, padding: '13px 16px 4px' }}>
      {yaku.map(([h, pt]) => {
        const on = hand === h;
        return (
          <div
            key={h}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '7px 2px',
              borderRadius: 8,
              background: on ? '#FBE3DF' : '#FBF6EA',
              border: `1.5px solid ${on ? '#C8392F' : '#E0CFAD'}`,
            }}
          >
            <div style={{ font: `700 9px ${SANS}`, color: on ? '#A22C24' : '#8A7A60', whiteSpace: 'nowrap' }}>{h}</div>
            <div style={{ font: `900 14px ${DISPLAY}`, color: on ? '#A22C24' : '#8A7A60' }}>{pt}</div>
          </div>
        );
      })}
    </div>
  );
}

// ---- 内部: 馬券チップ（的中チェック付き）----
// ✓ チェックは「位置ごとに picks[i] === answer[i] か」で独立判定する（役名と独立）。
// 例: ニレンタン (1・2着 のみ一致) では 1着・2着 に ✓ が出て 3着 には出ない。
// 「的中」大スタンプは overall hit (points > 0) で出す（従来挙動）。
function MyBetWithStamp({ picks, answer, choices, hit }: { picks: string[]; answer: string[]; choices: string[]; hit: boolean }) {
  const posLabels = ['1着', '2着', '3着'];
  return (
    <div style={{ position: 'relative', padding: '14px 16px 16px', borderTop: '2px dashed #C8A27C' }}>
      {/* 切り取り穴（半円ノッチ）*/}
      <div style={{ position: 'absolute', top: -9, left: -9, width: 18, height: 18, borderRadius: '50%', background: '#F1E7D3' }} />
      <div style={{ position: 'absolute', top: -9, right: -9, width: 18, height: 18, borderRadius: '50%', background: '#F1E7D3' }} />

      <span style={{ display: 'block', font: `700 10px ${DISPLAY}`, color: '#8A7A60', letterSpacing: '.1em', marginBottom: 10 }}>あなたの馬券</span>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
        {picks.map((c, idx) => {
          const g = gateOf(choices, c);
          const isLast = idx === picks.length - 1;
          // 位置ごとの絶対一致のみ ✓（役名に依存しない）。
          const posHit = answer[idx] !== undefined && c === answer[idx];
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <span style={{ font: `700 9px ${SANS}`, color: '#A14A3F' }}>{posLabels[idx]}</span>
                <div style={{ position: 'relative', width: 44, height: 44, borderRadius: 10, background: g.bg, border: `2.5px solid ${g.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 22px ${DISPLAY}`, color: g.fg }}>
                  {g.n}
                  {posHit && (
                    <span style={{ position: 'absolute', right: -6, bottom: -6, width: 18, height: 18, borderRadius: '50%', background: '#3E8E52', color: '#fff', font: `700 11px ${SANS}`, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #FBF6EA' }}>✓</span>
                  )}
                </div>
              </div>
              {!isLast && <span style={{ font: `700 16px ${DISPLAY}`, color: '#C56A2C' }}>→</span>}
            </div>
          );
        })}
      </div>

      {/* 的中スタンプ（overall hit = points > 0 のときのみ）*/}
      {hit && (
        <div
          className="sr-stamp"
          style={{ position: 'absolute', right: 14, bottom: 12, transform: 'rotate(-13deg)', border: '3px solid #C8392F', color: '#C8392F', font: `900 15px ${SANS}`, padding: '4px 9px', borderRadius: 8, opacity: 0.9, letterSpacing: '.05em', pointerEvents: 'none' }}
        >
          的中
        </div>
      )}
    </div>
  );
}

// ---- 内部: ランキング行（デルタ付き）----
function RankingWithDelta({ rows, round }: { rows: Row[]; round: HostRevealRound }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {rows.map((r, i) => {
        const delta = round.predictions?.[String(r.seat)]?.points ?? 0;
        const rankBg = i === 0 ? '#E3B42A' : i === 1 ? '#C4C0B4' : i === 2 ? '#C8956A' : '#E0CFAD';
        const rankFg = i <= 2 ? '#fff' : '#8A7A60';
        return (
          <div
            key={r.seat}
            style={{ display: 'flex', alignItems: 'center', gap: 11, background: r.isMe ? '#FBEFD9' : '#FBF6EA', border: `1.5px solid ${r.isMe ? '#E3B42A' : '#E3D4B8'}`, borderRadius: 10, padding: '9px 12px' }}
          >
            <span style={{ flex: 'none', width: 24, height: 24, borderRadius: '50%', background: rankBg, color: rankFg, font: `700 13px ${DISPLAY}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
            {/* 駒色ドット（additive）。row.color が無くても seat → 既定色で安全描画。 */}
            <PlayerColorDot row={r} />
            <span style={{ font: `600 14px ${SANS}`, color: '#2E2A24' }}>{r.name}</span>
            {(r.isMe || r.isHost) && (
              <span style={{ font: `600 10px ${SANS}`, color: '#FBF6EA', background: r.isMe ? '#C56A2C' : '#3E6F52', padding: '3px 7px', borderRadius: 999 }}>
                {r.isMe ? 'あなた' : 'ホスト'}
              </span>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'baseline', gap: 7 }}>
              {delta > 0 && <span style={{ font: `600 11px ${SANS}`, color: '#3E8E52' }}>+{delta}</span>}
              <span style={{ font: `900 17px ${DISPLAY}`, color: '#2E2A24' }}>{r.pts}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- 内部: 正解表彰台（ラウンドバッジ付き）----
function PodiumSection({ round, roundNo, roomId, roomName }: { round: HostRevealRound; roundNo: number; roomId?: string; roomName?: string }) {
  const answer = round.answer ?? [];
  const choices = round.choices;
  const shortCode = roomId ? roomId.slice(-4).toUpperCase() : '----';
  // 卓名(室名): backend.Room.name 由来。値が無い時は generic fallback「試遊卓」。
  // ホスト名(hostName) は絶対に表示しない (= 共有画面と同じ匿名性方針)。
  const displayRoomName = roomName?.trim() ? roomName.trim() : '試遊卓';

  // 着順ラベルは SanrentanPlay の history.length から渡される（revealed は履歴反映後）。
  // デザインは「第NR」ラベル + 「結果確定」バッジを表示する
  return (
    <div
      style={{
        flex: 'none',
        padding: '13px 16px 16px',
        ...feltBg,
        borderBottom: '3px solid #2C4F3A',
      }}
    >
      {/* 部屋番号バッジ + 卓名（デザインのアプリバーバッジを画面内に表示）*/}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9, minWidth: 0 }}>
        <span
          style={{ flex: 'none', font: `600 11px ${SANS}`, color: '#CFE0D0', background: 'rgba(255,255,255,.12)', padding: '5px 10px', borderRadius: 999 }}
        >
          部屋 #{shortCode}
        </span>
        {/* 卓名: backend.Room.name 由来 (空時は generic fallback「試遊卓」)。
            ホスト名は出さない (= 入場券エリアでも匿名性維持)。 */}
        <span
          data-testid="sr-room-name-topbar"
          style={{
            font: `600 11px ${SANS}`,
            color: '#F4E7CF',
            opacity: 0.9,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          ◇ {displayRoomName}
        </span>
      </div>

      {/* バッジ行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
        <span
          style={{ font: `700 11px/1 ${DISPLAY}`, color: '#fff', background: '#C56A2C', padding: '5px 9px', borderRadius: 6, boxShadow: '0 1px 0 #9A4E1C' }}
        >
          第{roundNo}R
        </span>
        <span
          style={{ font: `700 11px ${SANS}`, color: '#2C4F3A', background: '#F3D9A8', padding: '5px 9px', borderRadius: 999 }}
        >
          結果確定
        </span>
        <span style={{ marginLeft: 'auto', font: `600 11px ${SANS}`, color: '#CFE0D0', whiteSpace: 'nowrap' }}>ホストの本命</span>
      </div>

      {/* 表彰台 */}
      <PodiumFull answer={answer} choices={choices} />
    </div>
  );
}

// ---- 内部: 設計に忠実な表彰台（2着左/1着中/3着右、各自高さ違い）----
function PodiumFull({ answer, choices }: { answer: string[]; choices: string[] }) {
  if (!answer || answer.length < 3) return null;

  const g1 = gateOf(choices, answer[0]); // 1着
  const g2 = gateOf(choices, answer[1]); // 2着
  const g3 = gateOf(choices, answer[2]); // 3着

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 9 }}>
      {/* 2着 */}
      <div className="sr-rise" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 100, animationDelay: '0.12s' }}>
        <div style={{ width: 46, height: 46, borderRadius: 11, background: g2.bg, border: `2.5px solid ${g2.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 23px ${DISPLAY}`, color: g2.fg, boxShadow: '0 3px 6px rgba(0,0,0,.3)', marginBottom: 5 }}>{g2.n}</div>
        <span style={{ font: `600 11px ${SANS}`, color: '#FBF6EA', marginBottom: 5 }}>{answer[1]}</span>
        <div style={{ width: '100%', height: 58, borderRadius: '8px 8px 0 0', background: 'linear-gradient(#EDE0C4,#D7C49E)', border: '1px solid #CBB489', borderBottom: 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 6, boxShadow: 'inset 0 2px 0 rgba(255,255,255,.5)' }}>
          <span style={{ font: `700 14px ${DISPLAY}`, color: '#7A6748' }}>2</span>
        </div>
      </div>

      {/* 1着（中央・最大） */}
      <div className="sr-rise" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 108, animationDelay: '0.24s' }}>
        <div style={{ position: 'relative', marginBottom: 5 }}>
          <div style={{ position: 'absolute', top: -11, left: '50%', transform: 'translateX(-50%)', font: `700 10px ${SANS}`, color: '#7A4A12', background: '#F3D9A8', padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>🌹 1着</div>
          <div style={{ width: 56, height: 56, borderRadius: 12, background: g1.bg, border: '3px solid #E3B42A', display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 29px ${DISPLAY}`, color: g1.fg, boxShadow: '0 4px 8px rgba(0,0,0,.35),0 0 0 2px rgba(236,194,62,.4)' }}>{g1.n}</div>
        </div>
        <span style={{ font: `700 12px ${SANS}`, color: '#FBF6EA', marginBottom: 5 }}>{answer[0]}</span>
        <div style={{ width: '100%', height: 78, borderRadius: '8px 8px 0 0', background: 'linear-gradient(#F6E7B8,#E6CE86)', border: '1px solid #D8BC74', borderBottom: 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 7, boxShadow: 'inset 0 2px 0 rgba(255,255,255,.6)' }}>
          <span style={{ font: `700 18px ${DISPLAY}`, color: '#9A7A2E' }}>1</span>
        </div>
      </div>

      {/* 3着 */}
      <div className="sr-rise" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 100, animationDelay: '0.36s' }}>
        <div style={{ width: 42, height: 42, borderRadius: 11, background: g3.bg, border: `2.5px solid ${g3.bd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 21px ${DISPLAY}`, color: g3.fg, boxShadow: '0 3px 6px rgba(0,0,0,.3)', marginBottom: 5 }}>{g3.n}</div>
        <span style={{ font: `600 11px ${SANS}`, color: '#FBF6EA', marginBottom: 5 }}>{answer[2]}</span>
        <div style={{ width: '100%', height: 44, borderRadius: '8px 8px 0 0', background: 'linear-gradient(#E8D2B0,#D2B584)', border: '1px solid #C3A576', borderBottom: 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 5, boxShadow: 'inset 0 2px 0 rgba(255,255,255,.45)' }}>
          <span style={{ font: `700 13px ${DISPLAY}`, color: '#7A6748' }}>3</span>
        </div>
      </div>
    </div>
  );
}

export default function ResultScreen({ round, mySeat, rows, roundNo = 1, roomId, roomName }: ResultScreenProps) {
  const myPred = round.predictions?.[String(mySeat)];
  const myPts = myPred?.points ?? 0;
  const myHand = myPred?.hand ?? 'ハズレ';
  const hit = myPts > 0;
  // 倍率内訳 (frame: result-with-multiplier-breakdown)
  //   multiplier > 1 のときのみ役ヘッダ右下に「base × N倍」丸枠タグ + 内訳行を表示。
  //   1x のときは内訳バッジ/行ともに非表示 (= 既存表示と完全一致) — user 4 確定仕様。
  //   base は HAND_PT[myHand] (engine の score 計算と整合)。
  //   フォールバック: points = base * multiplier の関係から base を逆算しても良いが、
  //   役名 → base 点数の lookup の方が直感的なので HAND_PT を直接参照する。
  const multiplier = round.multiplier ?? 1;
  const showBreakdown = multiplier > 1;
  const basePts = HAND_PT[myHand] ?? 0;

  return (
    <Shell>
      {myPts === 6 && <Confetti />}

      {/* ---- 正解表彰台（フェルト bg） ---- */}
      <PodiumSection round={round} roundNo={roundNo} roomId={roomId} roomName={roomName} />

      {/* ---- スクロール可能コンテンツ ---- */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* 払戻チケット */}
        <div
          className="sr-pop"
          style={{
            flex: 'none',
            margin: '16px 16px 0',
            position: 'relative',
            ...ticketBg,
            border: '1.5px solid #E0CFAD',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: '0 6px 16px rgba(70,50,30,.16)',
          }}
        >
          {/* 役ヘッダ */}
          <div
            className={hit ? 'sr-glow' : undefined}
            style={{
              background: hit ? 'linear-gradient(#C8392F,#A22C24)' : 'linear-gradient(#9C9A93,#7E7C75)',
              padding: '13px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 11,
            }}
          >
            <div
              style={{ flex: 'none', width: 42, height: 42, borderRadius: '50%', background: 'radial-gradient(circle at 38% 32%,#F6E0A0,#E3B42A 60%,#B98A1E)', display: 'flex', alignItems: 'center', justifyContent: 'center', font: `700 18px ${DISPLAY}`, color: '#7A4A12', boxShadow: '0 2px 4px rgba(0,0,0,.3),inset 0 0 0 2px rgba(255,255,255,.35)' }}
            >★</div>
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ font: `900 22px ${SANS}`, color: '#FFF7EA', textShadow: '0 1px 2px rgba(0,0,0,.3)' }}>
                {myHand}{hit ? '！' : ''}
              </div>
              <span style={{ font: `600 11px ${SANS}`, color: '#FBE3DF' }}>
                {HAND_PT_DESC[myHand] ?? ''}
              </span>
            </div>
            <div style={{ marginLeft: 'auto', textAlign: 'center', lineHeight: 1.05 }}>
              <div style={{ font: `900 30px ${DISPLAY}`, color: '#FFF7EA' }}>+{myPts}</div>
              {showBreakdown ? (
                // 倍率 > 1: 「base × N倍」丸枠タグ (設計準拠)
                <div
                  data-testid="sr-result-multiplier-pill"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'rgba(255,255,255,.18)',
                    padding: '3px 8px',
                    borderRadius: 999,
                    marginTop: 2,
                  }}
                >
                  <span style={{ font: `700 10px ${DISPLAY}`, color: '#FFF7EA' }}>
                    {basePts} × {multiplier}倍
                  </span>
                </div>
              ) : (
                <span style={{ font: `600 10px ${SANS}`, color: '#FBE3DF' }}>点 払戻</span>
              )}
            </div>
          </div>

          {/* 倍率内訳行 (multiplier > 1 のみ)
              設計準拠: 「内訳 / base × multiplier倍 = total点 / 役 base点 ・ 倍率 Nx」 */}
          {showBreakdown && (
            <div
              data-testid="sr-result-breakdown-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                background: '#FBEFD9',
                borderTop: '1px solid #ECCfa0',
              }}
            >
              <span style={{ font: `700 11px ${SANS}`, color: '#6B4F3A' }}>内訳</span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  font: `700 13px ${DISPLAY}`,
                  color: '#A22C24',
                }}
              >
                <span>{basePts}</span>
                <span style={{ color: '#C56A2C' }}>×</span>
                <span>{multiplier}倍</span>
                <span style={{ color: '#C56A2C' }}>=</span>
                <span style={{ font: `900 16px ${DISPLAY}`, color: '#C8392F' }}>
                  {myPts}点
                </span>
              </div>
              <span
                style={{
                  marginLeft: 'auto',
                  font: `500 10px ${SANS}`,
                  color: '#8A7A60',
                }}
              >
                役 {basePts}点 ・ 倍率 {multiplier}x
              </span>
            </div>
          )}

          {/* 馬券（的中スタンプ付き） */}
          {myPred && (
            <MyBetWithStamp picks={myPred.answer} answer={round.answer ?? []} choices={round.choices} hit={hit} />
          )}
        </div>

        {/* 倍率内訳バッジは 1x のときは表示されない旨の注記 (常時表示)
            user 確定仕様: 末尾常時表示 — どの設問でも見えるよう、breakdown 有無に関わらず描画。 */}
        <div style={{ padding: '14px 16px 0' }}>
          <div
            data-testid="sr-result-multiplier-note"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 9,
              background: '#FBF6EA',
              border: '1px dashed #D8C6A4',
              borderRadius: 11,
              padding: '12px 13px',
            }}
          >
            <span style={{ flex: 'none', font: `700 14px ${SANS}`, color: '#8A7A60' }}>ℹ</span>
            <span style={{ font: `500 11px/1.6 ${SANS}`, color: '#6B4F3A' }}>
              倍率が <b>1x</b> の設問では内訳バッジは表示されず、役の点数がそのまま払戻になります（既存表示と完全一致）。
            </span>
          </div>
        </div>

        {/* 役早見 */}
        <YakuStrip hand={myHand} />

        {/* 累積順位 */}
        <div style={{ flex: 1, padding: '11px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
            <span style={{ font: `700 14px ${SERIF}`, color: '#2E2A24' }}>部屋の累積順位</span>
            <span style={{ font: `500 11px ${SANS}`, color: '#8A7A60' }}>{roundNo}レース終了</span>
          </div>
          <RankingWithDelta rows={rows} round={round} />
        </div>

        {/* パディング */}
        <div style={{ height: 16 }} />
      </div>

      {/* ---- フッター：次レース待機 ---- */}
      <div
        style={{ flex: 'none', padding: '11px 16px 16px', background: '#FBF6EA', borderTop: '1px solid #E3D4B8', display: 'flex', alignItems: 'center', gap: 11 }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ font: `700 12px ${SANS}`, color: '#2E2A24' }}>次のレースを待っています</div>
          <span style={{ font: `500 10px ${SANS}`, color: '#8A7A60' }}>ホストが次のお題を公開します</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#E3EFE3', border: '1px solid #BFD8C2', padding: '9px 13px', borderRadius: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3E8E52', boxShadow: '0 0 0 3px rgba(62,142,82,.2)' }} />
          <span style={{ font: `600 12px ${SANS}`, color: '#2C6E3E' }}>待機中</span>
        </div>
      </div>
    </Shell>
  );
}

// ---- 役説明文（役ヘッダのサブコピー）----
const HAND_PT_DESC: Record<string, string> = {
  サンレンタン: '1〜3着すべて順位までぴったり',
  サンレンプク: '3つ当たり（順不同）',
  ニレンタン: '1・2着がぴったり',
  プクプク: '2つ当たり（順不同）',
  タン: '1着がぴったり',
  ハズレ: '1着も一致せず',
};
