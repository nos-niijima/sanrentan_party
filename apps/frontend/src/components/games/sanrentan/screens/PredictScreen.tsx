'use client';

// 画面3（予想受付中）: プレイヤーが 1〜3着を選んで馬券を提出する。
// 設計: construction/design/サンレンタン_画面3_予想受付.dc.html (Layout A — 馬券マークシート式)
// frameId: predict-layout-a-list-badges (ユーザー承認済み採用案)
// round=null のときは「出題待ち」待機画面を担う。
//
// 設計準拠ポイント:
//  - アプリバー(戻る ‹ / サンレンタン / 部屋番号バッジ)
//  - レースバナー(第NR / 予想受付中 / ⏳ ホスト確定待ち / お題 / 出題者)
//  - 出走馬一覧(枠番チップ + 名称 + 順位バッジ)
//  - 三連単 馬券スリップ(ミシン目上辺 + 1→2→3着 + CTA)
// ホスト操作系UIは絶対に出さない (mustNotShow)。

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { HostRevealRound } from '@sanrentan-party/shared';
import {
  GateChip, gateOf, orangeBtn, ticketBg, feltBg,
  SANS, SERIF, DISPLAY, Row, RankingFooter,
} from '../shared';

// ---- WaitingScreen（出題待ち）----
// round=null の状態はプレイヤーに表示する待機画面。
// 2026-06-24: プレイヤーが /join/<id> から着席直後、ホストがまだお題を出していない初期状態でも
//   「どの卓に着いたか」を確認できるよう、トップバー直下に卓名 (backend.Room.name) の控えめ
//   サブ行を表示する。HostScreen/PredictScreen/ResultScreen と同形式 (12px, opacity 0.92, ellipsis,
//   data-testid="sr-room-name-topbar")。ホスト名は絶対に表示しない (= 共有画面と同じ匿名性方針)。
//   roomName が空または未指定のときは「試遊卓」の generic fallback。
//   ResultScreen が独自に sr-room-name-topbar を出すため、共通 Shell は変更せず、ここでは
//   WaitingScreen 専用の WaitingShell でトップバーを内製する (PredictShell と同じ流儀)。
function WaitingShell({ roomName, children }: { roomName?: string; children: React.ReactNode }) {
  const displayRoomName = roomName?.trim() ? roomName.trim() : '試遊卓';
  return (
    <div style={{ position: 'relative', maxWidth: 430, margin: '0 auto', minHeight: '100vh', background: '#F1E7D3', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ ...feltBg, borderBottom: '3px solid #2C4F3A', padding: '12px 16px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/" style={{ font: `700 19px ${SANS}`, color: '#EAF1E8', textDecoration: 'none' }}>‹</Link>
          <span style={{ font: `700 16px ${DISPLAY}`, color: '#F4E7CF' }}>サンレンタン</span>
        </div>
        {/* 卓名(室名) のサブ行 (控えめ)。ホスト名は出さない。 */}
        <div
          data-testid="sr-room-name-topbar"
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}
        >
          <span aria-hidden="true" style={{ font: `500 10px ${SANS}`, color: '#D8C6A4', opacity: 0.8 }}>◇</span>
          <span
            style={{
              font: `600 12px ${SANS}`,
              color: '#F4E7CF',
              opacity: 0.92,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {displayRoomName}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

export function WaitingScreen({ rows, roomName }: { rows: Row[]; roomName?: string }) {
  return (
    <WaitingShell roomName={roomName}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }}>
        <div style={{ display: 'flex', gap: 7 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="sr-pulse" style={{ width: 10, height: 10, borderRadius: '50%', background: '#3E6F52', animationDelay: `${i * 0.2}s` }} />
          ))}
        </div>
        <span style={{ font: `700 18px ${SERIF}`, color: '#2E2A24' }}>ホストの出題待ち</span>
        <span style={{ font: `500 12px ${SANS}`, color: '#8A7A60' }}>まもなく次のお題が公開されます</span>
      </div>
      <RankingFooter rows={rows} />
    </WaitingShell>
  );
}

/**
 * リビール演出 (B 案) 中のプレイヤー手元 frame。
 * round.status='revealed' かつ round.announce.phase !== 'done' の間に表示する。
 *
 * 役割:
 *   - ホストの大画面 (/rooms/:id/share) が演出を再生中であることを伝える
 *   - シルエット表彰台 + 「大画面で結果発表中」見出し + 「ホストの画面をご覧ください」
 *   - 累積順位は前ラウンド時点 (backend redactHostRevealFor が rolledBackScores を返す) を表示
 *   - announce.phase='done' に server が遷移したら通常 ResultScreen に切り替わる (SanrentanPlay)
 *
 * 注意: ここでは正解 (answer) / 役 / 点数 を一切表示しない (backend が redact 済だが
 *       defense-in-depth として client 側でも該当 UI を出さない)。
 */
export function AnnounceWaitingScreen({ rows, roomName }: { rows: Row[]; roomName?: string }) {
  return (
    <WaitingShell roomName={roomName}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 18px', gap: 16 }}>
        {/* シルエット表彰台 (3 段、? チップ) */}
        <div
          data-testid="sr-announce-silhouette-podium"
          aria-hidden="true"
          style={{
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            gap: 12, marginBottom: 8,
          }}
        >
          {[
            { place: 2, h: 58, w: 64 },
            { place: 1, h: 84, w: 78 },
            { place: 3, h: 44, w: 56 },
          ].map(({ place, h, w }) => (
            <div key={place} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: w * 0.6, height: w * 0.6, borderRadius: 10,
                background: '#2C4A39', border: '2.5px solid #22402E',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                font: `700 ${w * 0.42}px ${DISPLAY}`, color: '#6E9079',
              }}>
                ?
              </div>
              <div style={{
                width: w, height: h, borderRadius: '10px 10px 0 0',
                background: 'linear-gradient(#EDE0C4,#D7C49E)',
                border: '1px solid #CBB489',
                borderBottom: 'none',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                paddingTop: 6,
                boxShadow: 'inset 0 3px 0 rgba(255,255,255,.5)',
              }}>
                <span style={{ font: `700 16px ${DISPLAY}`, color: '#A48E68' }}>{place}</span>
              </div>
            </div>
          ))}
        </div>
        <span
          data-testid="sr-announce-waiting-heading"
          style={{ font: `700 18px ${SERIF}`, color: '#2E2A24', textAlign: 'center' }}
        >
          大画面で結果発表中
        </span>
        <span
          data-testid="sr-announce-waiting-sub"
          style={{ font: `500 13px ${SANS}`, color: '#8A7A60', textAlign: 'center', lineHeight: 1.5 }}
        >
          ホストの画面をご覧ください
        </span>
      </div>
      <RankingFooter rows={rows} />
    </WaitingShell>
  );
}

// ---- PredictShell（PredictScreen 専用シェル）----
// 設計の上端: app bar(戻る/サンレンタン/部屋番号バッジ)。
// 通常の Shell とは別物として用意し、設計に忠実なヘッダを再現する。
// 2026-06-24 (low UX): backend.Room.name を控えめに表示するサブ行を追加。
//   /rooms/new で「○○卓」と入力された卓名を、対戦中の自端末でも確認できるようにする。
//   ホスト名(hostName) は絶対に表示しない (= 共有画面と同じ匿名性方針)。
//   値が空のときは「試遊卓」の generic fallback。
function PredictShell({ roomCode, roomName, children }: { roomCode?: string; roomName?: string; children: React.ReactNode }) {
  const shortCode = roomCode ? roomCode.slice(-4).toUpperCase() : '----';
  const displayRoomName = roomName?.trim() ? roomName.trim() : '試遊卓';
  return (
    <div style={{
      position: 'relative', maxWidth: 430, margin: '0 auto', minHeight: '100vh',
      background: '#F1E7D3', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* 上部 felt 領域: app bar */}
      <div style={{ ...feltBg }}>
        {/* app bar (戻る / サンレンタン / 部屋番号) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px 13px' }}>
          <Link href="/" style={{ font: `700 19px/1 ${SANS}`, color: '#EAF1E8', textDecoration: 'none' }}>‹</Link>
          <span style={{ font: `700 16px/1 ${DISPLAY}`, color: '#F4E7CF' }}>サンレンタン</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ font: `600 11px ${SANS}`, color: '#CFE0D0', background: 'rgba(255,255,255,.12)', padding: '5px 10px', borderRadius: 999 }}>
              部屋 #{shortCode}
            </span>
          </div>
        </div>
        {/* 卓名(室名) のサブ行 (控えめ)。ホスト名は出さない。 */}
        <div
          data-testid="sr-room-name-topbar"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px 8px' }}
        >
          <span aria-hidden="true" style={{ font: `500 10px ${SANS}`, color: '#CFE0D0', opacity: 0.7 }}>◇</span>
          <span
            style={{
              font: `600 12px ${SANS}`,
              color: '#F4E7CF',
              opacity: 0.92,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {displayRoomName}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

// ---- RaceBanner（お題バナー）----
// 設計: race banner セクション。第NR + 予想受付中ピル + ⏳ホスト確定待ち + お題 + 出題者名。
// 倍率対応 (frame: predict-with-multiplier-badge):
//   round.multiplier > 1 のときのみ右上に円形 ×N バッジ + お題下に「🔥 倍率設問」赤帯を表示。
//   1x のときはバッジも赤帯も非表示 (= 通常画面と同形式) — user 4 確定仕様。
function RaceBanner({ round, roundNo, host }: { round: HostRevealRound; roundNo: number; host?: string }) {
  const m = round.multiplier ?? 1;
  const showMultiplier = m > 1;
  return (
    <div style={{
      flex: 'none',
      padding: '14px 16px 12px',
      ...feltBg,
      borderBottom: '3px solid #2C4F3A',
    }}>
      <div style={{ position: 'relative', background: '#FBF6EA', borderRadius: 10, padding: '12px 14px', boxShadow: '0 4px 10px rgba(0,0,0,.2)' }}>
        {/* 倍率バッジ (round.multiplier > 1 のみ)
            位置: お題ヘッダ右上に円形 (rotate 7deg)。設計準拠。 */}
        {showMultiplier && (
          <div
            data-testid="sr-multiplier-badge"
            aria-label={`このラウンドは×${m}倍`}
            style={{
              position: 'absolute',
              top: -13,
              right: -6,
              transform: 'rotate(7deg)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: 52,
              height: 52,
              borderRadius: '50%',
              background:
                'radial-gradient(circle at 38% 30%,#E2584C,#C8392F 65%,#A22C24)',
              border: '3px solid #FBF6EA',
              boxShadow: '0 4px 9px rgba(162,44,36,.4)',
              pointerEvents: 'none',
            }}
          >
            <span style={{ font: `900 22px ${DISPLAY}`, color: '#FFF7EA', lineHeight: 1 }}>
              ×{m}
            </span>
            <span style={{ font: `700 7px ${SANS}`, color: '#FBE3DF', letterSpacing: '.05em' }}>
              倍率
            </span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
          {/* 第NR バッジ */}
          <span style={{ font: `700 12px/1 ${DISPLAY}`, color: '#fff', background: '#C56A2C', padding: '5px 9px', borderRadius: 6, boxShadow: '0 1px 0 #9A4E1C', whiteSpace: 'nowrap' }}>
            第{roundNo}R
          </span>
          {/* 予想受付中 ピル */}
          <span style={{ font: `600 11px ${SANS}`, color: '#3E6F52', background: '#E3EFE3', padding: '5px 9px', borderRadius: 999 }}>
            予想受付中
          </span>
          {/* ホスト確定待ち */}
          <span style={{ marginLeft: 'auto', whiteSpace: 'nowrap', font: `500 11px ${SANS}`, color: '#A14A3F' }}>
            ⏳ ホスト確定待ち
          </span>
        </div>
        {/* お題 (倍率バッジが被らないよう右側にパディング) */}
        <h2 style={{ margin: 0, paddingRight: showMultiplier ? 48 : 0, font: `700 18px/1.35 ${SERIF}`, color: '#2E2A24' }}>{round.prompt}</h2>
        {/* 倍率設問 赤帯 (multiplier > 1 のみ)
            設計準拠: 「🔥 倍率設問 / この設問は通常の N倍 で採点されます」 */}
        {showMultiplier && (
          <div
            data-testid="sr-multiplier-banner"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              marginTop: 8,
              background: '#FBE3DF',
              border: '1px solid #EBB7B1',
              borderRadius: 8,
              padding: '7px 10px',
            }}
          >
            <span style={{ font: `700 12px ${SANS}`, color: '#C8392F' }}>🔥 倍率設問</span>
            <span style={{ font: `600 11px ${SANS}`, color: '#A22C24' }}>
              この設問は通常の <b>{m}倍</b> で採点されます
            </span>
          </div>
        )}
        {/* 出題者 */}
        {host && (
          <span style={{ font: `500 11px ${SANS}`, color: '#8A7A60' }}>出題 {host}</span>
        )}
      </div>
    </div>
  );
}

// ---- ChoiceRow（選択肢リスト行）----
// 設計: choices list の各行。枠番チップ + 選択肢名 + 割当バッジ（指定/1着/2着/3着）。
function ChoiceRow({
  choice, g, assigned, onClick,
}: {
  choice: string;
  g: ReturnType<typeof gateOf>;
  assigned: number | null; // picks 中の index (0-based) or null
  onClick: () => void;
}) {
  const badge = assigned !== null ? `${assigned + 1}着` : '指定';
  const badgeBg = assigned !== null ? '#C56A2C' : '#F1E7D3';
  const badgeFg = assigned !== null ? '#FFF7EA' : '#A89472';
  const badgeBd = assigned !== null ? '#9A4E1C' : '#E0CFAD';
  const rowBd = assigned !== null ? '#C56A2C' : '#E3D4B8';

  return (
    <button
      onClick={onClick}
      className={`sr-tap${assigned !== null ? ' sr-tap-on' : ''}`}
      style={{
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        background: assigned !== null ? '#FFFDF7' : '#FBF6EA',
        border: `1.5px solid ${rowBd}`,
        borderRadius: 11,
        padding: '10px 12px',
        boxShadow: '0 2px 4px rgba(70,50,30,.07)',
        cursor: 'pointer',
        width: '100%',
      }}
    >
      {/* 枠番チップ */}
      <GateChip {...g} size={38} />
      {/* 選択肢名 */}
      <span style={{ font: `600 15px ${SANS}`, color: '#2E2A24' }}>{choice}</span>
      {/* 割当バッジ */}
      <span style={{
        marginLeft: 'auto',
        font: `700 13px ${SANS}`,
        color: badgeFg,
        background: badgeBg,
        border: `1.5px solid ${badgeBd}`,
        padding: '6px 11px',
        borderRadius: 999,
      }}>
        {badge}
      </span>
    </button>
  );
}

// ---- BetSlipA（馬券スリップ — Layout A スタイル）----
// 設計: 馬券スリップ。ミシン目上辺(dashed)、コーナーパンチ穴、1着→2着→3着 矢印表示、CTA ボタン。
// 2026-06-24: visible feedback 追加。submitted=true で「✓ 提出済み (変更可能)」ヒント表示 +
// CTA ラベルを「予想を変更する」に切替（open 中は upsert 可能なため clickable は維持）。
// 2026-06-24 low fix: 「サーバ保存値 と ローカル picks が一致しているか」を picksMatchServer で
// 受け取り、一致時=「✓ 提出済み」/ 差分時=「修正中 (未送信)」を視覚化する。
// reload 直後と「再編集途中」を見分けられないという混乱を解消する。
// 2026-06-24 follow-up: backend は open 中の predict upsert を許可する (sanrentan-scenario /
// multi-player-check で assertion 済) のに synced 時に disable していたのは仕様矛盾。
// CTA は synced 時も clickable に戻し、ラベルで「同じ予想を再送」と明示する。
// 同じ answer での再送は backend が冪等に扱うため no-op となる。
function BetSlipA({
  picks, choices, onSubmit, busy, submitted, picksMatchServer, multiplier,
}: {
  picks: string[];
  choices: string[];
  onSubmit: () => void;
  busy: boolean;
  submitted: boolean;
  picksMatchServer: boolean;
  /** round.multiplier (1/2/3/5/10)。> 1 のときヘッダに「・ ×N倍」サフィックスを追加。 */
  multiplier: number;
}) {
  const slots = ['1着', '2着', '3着'] as const;
  const complete = picks.length === 3;
  // 「サーバに保存済みかつローカル picks がそれと一致」している状態。
  // 仕様: open 中は upsert 許容のため、synced でも CTA は clickable に維持する (冪等再送)。
  const synced = submitted && picksMatchServer;
  const ctaLabel = busy
    ? '送信中…'
    : !complete
      ? 'この目で馬券を買う'
      : synced
        ? '同じ予想を再送'
        : submitted
          ? '修正を送信する'
          : 'この目で馬券を買う';

  return (
    <div style={{
      flex: 'none',
      position: 'relative',
      margin: '12px 14px 0',
      padding: '14px 16px 16px',
      ...ticketBg,
      border: '1.5px solid #E0CFAD',
      borderTop: '2px dashed #C8A27C',
      borderRadius: '12px 12px 0 0',
      boxShadow: '0 -4px 14px rgba(70,50,30,.12)',
    }}>
      {/* ミシン目パンチ穴 */}
      <div style={{ position: 'absolute', top: -9, left: -9, width: 18, height: 18, borderRadius: '50%', background: '#F1E7D3' }} />
      <div style={{ position: 'absolute', top: -9, right: -9, width: 18, height: 18, borderRadius: '50%', background: '#F1E7D3' }} />

      {/* ヘッダ行
          倍率対応 (multiplier > 1 のみ): 「三連単 馬券 ・ ×N倍」とサフィックスを付ける。
          1x のときは「三連単 馬券」のみ (= 通常画面と同形式)。 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ font: `700 11px ${DISPLAY}`, color: '#8A7A60', letterSpacing: '.1em' }}>
          三連単 馬券
          {multiplier > 1 && (
            <span data-testid="sr-betslip-multiplier-suffix"> ・ ×{multiplier}倍</span>
          )}
        </span>
        {/*
          ヒント 3 状態:
            1) 未提出           → 「確定まで買い直し可」 (灰)
            2) 提出済み & 一致  → 「✓ 提出済み」        (緑) ※サーバ確定と一致
            3) 提出済み & 差分  → 「修正中 (未送信)」    (橙) ※ローカル編集が未送信
          (3) の判別は reload 後にも残るのが肝(ローカル picks ≠ サーバ確定値)。
        */}
        {!submitted ? (
          <span style={{ font: `500 10px ${SANS}`, color: '#8A7A60' }}>確定まで買い直し可</span>
        ) : synced ? (
          <span
            data-testid="sr-submitted-hint"
            style={{ font: `700 10px ${SANS}`, color: '#3E6F52', background: '#E3EFE3', border: '1px solid #B6D6BA', padding: '3px 8px', borderRadius: 999 }}
          >
            ✓ 提出済み
          </span>
        ) : (
          <span
            data-testid="sr-dirty-hint"
            style={{ font: `700 10px ${SANS}`, color: '#A14A3F', background: '#FBE9D8', border: '1px solid #E3B98C', padding: '3px 8px', borderRadius: 999 }}
          >
            修正中 (未送信)
          </span>
        )}
      </div>

      {/* 1着 → 2着 → 3着 チップ列 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 13 }}>
        {slots.map((pos, i) => {
          const choice = picks[i] ?? null;
          const g = choice ? gateOf(choices, choice) : null;
          return (
            <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <span style={{ font: `700 10px ${SANS}`, color: '#A14A3F' }}>{pos}</span>
                {g ? (
                  <div style={{
                    width: 46, height: 46, borderRadius: 10,
                    background: g.bg, border: `2.5px solid ${g.bd}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    font: `700 24px ${DISPLAY}`, color: g.fg,
                    boxShadow: '0 2px 4px rgba(0,0,0,.2)',
                  }}>
                    {g.n}
                  </div>
                ) : (
                  <div style={{
                    width: 46, height: 46, borderRadius: 10,
                    background: '#EFE2C6', border: '2.5px solid #D3C09A',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    font: `700 24px ${DISPLAY}`, color: '#B7A582',
                    boxShadow: '0 2px 4px rgba(0,0,0,.2)',
                  }}>
                    ?
                  </div>
                )}
              </div>
              {/* 矢印セパレータ（3着の後は出さない） */}
              {i < 2 && (
                <span style={{ font: `700 18px ${DISPLAY}`, color: '#C56A2C' }}>→</span>
              )}
            </div>
          );
        })}
      </div>

      {/* CTA ボタン
          disabled 条件 (synced は disable しない — backend が open 中 upsert を許可するため):
            - 未完成 (3着まで選んでない)
            - busy (送信中)
          synced 時もクリック可。同じ answer の再送は backend が冪等に処理する (no-op)。
       */}
      <button
        onClick={onSubmit}
        disabled={!complete || busy}
        aria-disabled={!complete || busy}
        aria-describedby={!complete ? 'sr-cta-reason' : undefined}
        className="sr-press"
        style={{
          ...(complete ? orangeBtn : {
            ...orangeBtn,
            background: 'linear-gradient(#9C9A93,#7E7C75)',
            boxShadow: '0 3px 0 #5F5D57',
            cursor: 'not-allowed',
          }),
          opacity: busy ? 0.7 : 1,
        }}
      >
        {ctaLabel}
      </button>
      {/* CTA disabled 理由(a11y: スクリーンリーダーのみ。視覚レイアウト維持のため不可視) */}
      {!complete && (
        <span
          id="sr-cta-reason"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0,0,0,0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          3着まで選んでください
        </span>
      )}
    </div>
  );
}

// ---- PredictScreen（予想受付中）----

interface PredictScreenProps {
  round: HostRevealRound;
  hostName: string;
  mySeat: number;
  roundNo?: number; // 第NR。SanrentanPlay から history.length+1 で渡す
  roomId?: string;  // 部屋番号バッジ表示用 (末尾4文字)
  roomName?: string; // 卓名 (backend.Room.name)。topbar の控えめサブ行に表示
  act: (dto: { action: string; payload?: Record<string, unknown> }) => Promise<void>;
}

export default function PredictScreen({ round, hostName, mySeat, roundNo = 1, roomId, roomName, act }: PredictScreenProps) {
  const myAnswer = round.predictions?.[String(mySeat)]?.answer ?? [];
  const [picks, setPicks] = useState<string[]>(myAnswer.slice(0, 3));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // toast: 送信成功直後の一時通知 (auto-dismiss 4s)。永続フィードバックは submitted hint が担う。
  const [toast, setToast] = useState<string | null>(null);
  // 連打回避: 直近の submit クリック時刻を保持し、300ms 以内の二度押しを無視する。
  const lastSubmitAt = useRef<number>(0);

  // server からの submittedSeats を権威に置く。自分の席が含まれていれば「提出済み」。
  const submitted = !!round.submittedSeats?.includes(mySeat);
  // サーバ確定値(= round.predictions[mySeat].answer の先頭3件) と ローカル picks の差分判定。
  // reload 後は「サーバ保存値 = ローカル picks」となり synced 表示 / button disabled。
  // ユーザーが picks を変えた瞬間に「修正中 (未送信)」表示 / button 再活性 となる。
  //
  // 2026-06-24 false-positive fix:
  //   serverAnswer.length === 3 を必須条件にする。
  //   理由: サーバ未提出時は serverAnswer=[] となり、picks=[] (まだ何も選んでいない) のとき
  //   両者の length が等しく Array.prototype.every が空配列で true を返すため、
  //   picksMatchServer===true と誤って評価され、(submitted も別経路で true になる稀ケースで)
  //   「✓ 提出済み」緑バッジが誤表示される。submittedSeats との二重防御として
  //   「サーバが 3 件保存している証拠」を picksMatchServer 側にも組み込む。
  const serverAnswer = myAnswer.slice(0, 3);
  const picksMatchServer =
    serverAnswer.length === 3 &&
    picks.length === 3 &&
    picks.every((c, i) => c === serverAnswer[i]);

  // toast auto-dismiss
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // タップでトグル（割当順に追加、もう一度で取消）
  function toggle(c: string) {
    setPicks((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : prev.length < 3 ? [...prev, c] : prev
    );
  }

  async function submit() {
    // 連打 debounce 300ms。busy state と二重防御。
    const now = Date.now();
    if (busy || now - lastSubmitAt.current < 300) return;
    lastSubmitAt.current = now;

    setBusy(true);
    setErr(null);
    try {
      await act({ action: 'predict', payload: { answer: picks } });
      // 提出 success の visible feedback。1→2→3 着の実選択を含めて確認感を出す。
      const [a, b, c] = picks;
      setToast(`ご予想 ${a} → ${b} → ${c} を提出しました ✓`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '送信に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PredictShell roomCode={roomId} roomName={roomName}>
      {/* レースバナー: 第NR / 予想受付中 / ⏳ ホスト確定待ち / お題 / 出題者 */}
      <RaceBanner round={round} roundNo={roundNo} host={hostName} />

      {/* インストラクション */}
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 18px 8px' }}>
        <span style={{ font: `700 13px ${SANS}`, color: '#2E2A24' }}>出走から1着→2着→3着を予想</span>
        <span style={{ font: `500 11px ${SANS}`, color: '#8A7A60' }}>タップで順に指定</span>
      </div>

      {/* 選択肢リスト */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {round.choices.map((c) => {
          const g = gateOf(round.choices, c);
          const rank = picks.indexOf(c);
          return (
            <ChoiceRow
              key={c}
              choice={c}
              g={g}
              assigned={rank >= 0 ? rank : null}
              onClick={() => toggle(c)}
            />
          );
        })}
      </div>

      {/* エラー表示 */}
      {err && (
        <p style={{ margin: '4px 16px 0', font: `600 12px ${SANS}`, color: '#A22C24' }}>{err}</p>
      )}

      {/* 馬券スリップ（Layout A: ミシン目上辺 + →矢印 + CTA） */}
      <BetSlipA
        picks={picks}
        choices={round.choices}
        onSubmit={submit}
        busy={busy}
        submitted={submitted}
        picksMatchServer={picksMatchServer}
        multiplier={round.multiplier ?? 1}
      />

      {/* 送信成功 toast (4s auto-dismiss)。a11y: role=status / aria-live=polite で SR にもアナウンス。 */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          data-testid="sr-submit-toast"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 24,
            transform: 'translateX(-50%)',
            maxWidth: 400,
            width: 'calc(100% - 32px)',
            background: '#2E2A24',
            color: '#FFF7EA',
            font: `700 13px ${SANS}`,
            padding: '12px 16px',
            borderRadius: 10,
            boxShadow: '0 6px 18px rgba(0,0,0,.28)',
            zIndex: 50,
            textAlign: 'center',
            border: '1.5px solid #3E6F52',
          }}
        >
          {toast}
        </div>
      )}
    </PredictShell>
  );
}
