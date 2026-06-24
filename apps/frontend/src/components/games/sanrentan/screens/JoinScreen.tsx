'use client';

// 画面1: 入室 — B 入場券式（確定仕様）。
// 1枚の入場券に名前/チーム名を記入してもぎって入場する。
//
// 設計の正: construction/design/サンレンタン_画面1_入室.dc.html (LAYOUT B)
// 列挙の正: construction/design/frames/サンレンタン_画面1_入室.json (frameId: join-layout-b-ticket)
//
// ロール: 未着席の player のみ。host 操作系 UI は一切出さない（このコンポーネントが
//        呼ばれる時点で me が undefined。SanrentanPlay 側で host 判定は完了済み）。
//
// 認証 (2026-06-24 cookie identity 化以降):
//   - signIn / NextAuth セッションは使わない。BFF (server-api) が HttpOnly cookie
//     `pb_uid` を読んで x-user-* ヘッダを backend に転送する。
//   - ユーザーは名前を入力 → 「もぎって入場する」で **直接** POST /api/rooms/:id/join
//     { name, color } を発火する。useRoom.join() が body に name/color を載せ、
//     server-api がそれを peek して x-user-name に昇格 → UserService が users.name
//     を upsert する。
//   - 成功後は親 (`joinAndGo` in /join landing) が /rooms/<id> へ push する。
//
// データ配線:
//   - 卓名 / 部屋# / 進行ラウンド / 参加人数 は props 経由で実 state 由来。
//   - 駒色は backend が optional な RoomPlayer.color を提供するようになったため、
//     ピッカーで選んだ hex を join({ color }) で送信する（既存ルームでは null のまま
//     でも壊れない）。

import { useState } from 'react';
import Link from 'next/link';
import type { HostRevealRound } from '@sanrentan-party/shared';
import { ApiError } from '@/lib/api';
import { feltBg, ticketBg, orangeBtn, SANS, SERIF, DISPLAY, resolvePlayerColor } from '../shared';

interface JoinScreenProps {
  hostName: string;
  playerCount: number;
  join: (opts?: { seat?: number; color?: string; name?: string }) => Promise<void>;
  /** 部屋ID（URLから。callbackUrl に使用）*/
  roomCode?: string;
  /** 現在進行中のラウンド（無ければ null）。サブライン文言の動的算出に使う。 */
  round: HostRevealRound | null;
  /** 公開済みラウンド数。サブライン文言の動的算出に使う。 */
  historyLen: number;
  /** 卓名（Room.name; backend では optional）。未設定の既存ルームは undefined。 */
  roomName?: string;
  /** すでにこの卓に着席済みの場合のサーバ側 RoomPlayer.color（任意。再表示時の初期選択用）。 */
  initialColor?: string;
  /**
   * 既存メンバー一覧（rejoin 用）。
   * 「既存メンバーとして再参加」セクションのために view.players を受け取り、
   * 内部で host を除外した playersExclHost を一覧表示する。
   * host seat は既定 0（hostSeat が無いゲームでも 0 を除外する。サンレンタン本来の hostSeat 解決は親が担当）。
   */
  players?: Array<{ seat: number; name?: string; color?: string }>;
  /** ホスト席の seat 番号。既定 0（HostRevealState.hostSeat 由来）。 */
  hostSeat?: number;
}

// 設計（Frame B）の駒色プリセット。選択中の hex を join({ color }) で送信する。
const PALETTE = [
  { color: '#B05A4E', ring: '#7A4A12' }, // 選択既定（設計の選択中色）
  { color: '#4E6E8E', ring: 'transparent' },
  { color: '#5E8463', ring: 'transparent' },
  { color: '#C9A24B', ring: 'transparent' },
];

// 卓名は Room.name（optional column）から取得する。
// 未設定の既存ルームでは hostName + "の試遊卓" にフォールバックし、
// hostName も無い場合は "名無しの卓" に最終フォールバックする。
// 進行ラウンド状態は props から動的に算出する（history.length + round.status）。

// -------------------------------------------------------------------
// メインコンポーネント
// -------------------------------------------------------------------
export default function JoinScreen({ hostName, join, round, historyLen, roomName, initialColor, roomCode, players, hostSeat = 0 }: JoinScreenProps) {
  // roomCode は将来 share-link 等で利用する余地があるため API に残す（現状は未使用）。
  void roomCode;
  const [name, setName] = useState('');
  // 初期選択: サーバから返って来た RoomPlayer.color と一致する PALETTE index があればそれを、
  // 無ければ 0 番（設計B の既定色 #B05A4E）を選ぶ。
  // 既存ルームの未設定プレイヤー（color が undefined）は 0 にフォールバック。
  const initialPaletteIdx = (() => {
    if (!initialColor) return 0;
    const target = initialColor.toLowerCase();
    const idx = PALETTE.findIndex((p) => p.color.toLowerCase() === target);
    return idx >= 0 ? idx : 0;
  })();
  const [palette, setPalette] = useState(initialPaletteIdx); // 駒色 index（PALETTE[palette].color を送信）
  const [busy, setBusy] = useState(false);
  // join 失敗時の error メッセージ（例: backend 401 / 409 等）。null の間は非表示。
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // error の種別（styling 切り替え用）。
  //   - 'duplicate-name': backend 409 で同卓に同名 player がすでに居る。赤系単色で強調。
  //   - 'generic':        その他の失敗。既存の amber 系で表示。
  //   - null:             alert 非表示。
  const [errorKind, setErrorKind] = useState<'duplicate-name' | 'generic' | null>(null);

  // 選択中の駒色 hex。PALETTE 範囲外を念のためフォールバック。
  const selectedColor = PALETTE[palette]?.color ?? PALETTE[0].color;

  // 卓名解決: backend の Room.name（optional）→ 無ければ "{hostName}の試遊卓" → それも無ければ "名無しの卓"。
  const displayRoomName =
    roomName?.trim() ||
    (hostName && hostName !== 'ホスト' ? `${hostName}の試遊卓` : '名無しの卓');

  // 現在進行中ラウンド番号: history.length + (round ? 1 : 0)
  const roundNo = historyLen + (round ? 1 : 0);
  // サブライン文言（ラウンド状態のみ表示。部屋#XXXX は撤去済み）。
  // - round=null            → 「開始前」
  // - round.status=open     → 「第NR 進行中」
  // - round.status=revealed → 「第NR 結果発表中」
  const roomSubline = !round
    ? '開始前'
    : round.status === 'open'
      ? `第${roundNo}R 進行中`
      : `第${roundNo}R 結果発表中`;

  // 名前 + 駒色を直接 POST /api/rooms/:id/join に送信する（cookie identity 化以降）。
  // 成功すると親 (/join landing の joinAndGo) が /rooms/<id> へ push する。
  // 失敗 (4xx/5xx 等) はメッセージを表示し再入力可能にする。
  async function submitGo() {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    setErrorMessage(null);
    setErrorKind(null);
    try {
      await join({ color: selectedColor, name: n });
      // 成功時は親が redirect する。ここでは busy を残したまま遷移を待つ。
    } catch (err) {
      // backend 409 (DUPLICATE_NAME) は専用文言で表示。useRoom.join は失敗時に
      // ApiError(status) を投げる契約。status===409 を「この卓にすでに同名 player」と扱う。
      if (err instanceof ApiError && err.status === 409) {
        setErrorMessage(`「${n}」はこの卓ですでに使われています。別の名前にしてください。`);
        setErrorKind('duplicate-name');
      } else {
        const message = err instanceof Error && err.message ? err.message : '参加に失敗しました';
        setErrorMessage(message);
        setErrorKind('generic');
      }
      setBusy(false);
    }
  }

  const ctaLabel = busy ? '入場中…' : 'もぎって入場する';
  // CTA 有効判定: 名前入力済みで可。
  const ctaEnabled = name.trim().length > 0 && !busy;

  // ── 既存メンバー一覧（rejoin 用）──
  // host は進行専任なので rejoin 対象から除外する（hostSeat と一致する seat を除外）。
  // name が空の seat は表示意味が薄いため除外（誰か判別不能）。
  const playersExclHost = (players ?? []).filter(
    (p) => p.seat !== hostSeat && !!p.name && p.name.length > 0,
  );

  /**
   * 「これは私です」click ハンドラ。
   *
   * 動作 (2026-06-24 cookie identity 化以降):
   *   - **そのまま** POST /join { name: existingName, color: existingColor } を発火する。
   *   - 同 cookie 持ち主 (= 元の seat オーナー) であれば backend の rejoinSameSeat 経路で
   *     同 seat / 同 color に戻る（identity が一致するため）。
   *   - 別 cookie 持ち主 (= 別ブラウザ / incognito) が click した場合、backend は別 userId
   *     として新規 seat を作ってしまう可能性がある（= 他人の色を盗む / 名前を詐称する攻撃
   *     ベクトル）。これは backend 側の防御 (例: 同 name 既存時 409) で対処する設計判断で、
   *     UI 層では escalation 案件として needsUserDecision で報告する。
   *   - 失敗時は errorMessage を表示する。
   */
  async function rejoinAs(existingName: string, existingColor: string) {
    if (busy) return;
    setBusy(true);
    setErrorMessage(null);
    setErrorKind(null);
    try {
      await join({ color: existingColor, name: existingName });
      // 成功時は親が /rooms/<id> へ redirect する。
    } catch (err) {
      // rejoin でも 409 は「他 cookie 持ち主が同名 player として既に座っている」ケース
      // (なりすまし防止の backend 防御がトリガ)。専用文言で促す。
      if (err instanceof ApiError && err.status === 409) {
        setErrorMessage(`「${existingName}」はこの卓ですでに使われています。別の名前にしてください。`);
        setErrorKind('duplicate-name');
      } else {
        const message = err instanceof Error && err.message ? err.message : '再参加に失敗しました';
        setErrorMessage(message);
        setErrorKind('generic');
      }
      setBusy(false);
    }
  }

  return (
    /* 外枠: グリーンフェルト背景（設計B 全面） */
    <div
      style={{
        position: 'relative',
        maxWidth: 430,
        margin: '0 auto',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...feltBg,
      }}
    >
      {/* ── 戻るリンク（設計B 上部）──
          設計のステータスバーモック(9:41 / 電池・電波アイコン) は実アプリでは
          デバイス自体が時刻を表示するため撤去。レイアウト確保のため上部 padding を
          残し、戻るリンク行はそのまま維持する。 */}
      <div style={{ flex: 'none', color: '#EAF1E8' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 16px 0' }}>
          <Link
            href="/"
            style={{ font: `700 19px ${SANS}`, color: '#EAF1E8', textDecoration: 'none' }}
            aria-label="Board Game Trial にもどる"
          >
            ‹
          </Link>
          <span style={{ font: `600 12px ${SANS}`, color: '#CFE0D0' }}>Board Game Trial にもどる</span>
        </div>
      </div>

      {/* ── 入場券（縦中央配置） ── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 22px',
        }}
      >
        {/*
          券本体（cookie identity 化以降、ログイン分岐は無くなり単一 form）。
          <form> submit で submitGo() を発火し、直接 POST /join を投げる。
        */}
        <form
          id="join-form"
          onSubmit={(e) => { e.preventDefault(); void submitGo(); }}
          style={{
            position: 'relative',
            width: '100%',
            ...ticketBg,
            borderRadius: 16,
            boxShadow: '0 18px 40px rgba(0,0,0,.35)',
            overflow: 'hidden',
          }}
        >
          <TicketHead />
          <div style={{ padding: 18 }}>
            <TicketRoomInfo roomName={displayRoomName} subline={roomSubline} hostName={hostName} />
            {/* 名前入力（下線スタイル） */}
            <NameField
              inputId="guestName"
              value={name}
              onChange={setName}
              placeholder=""
            />
            {/* 駒色ピッカー（設計B：小サイズ円） */}
            <PalettePicker selected={palette} onSelect={setPalette} />
          </div>
          <Perforation />
          {/* スタブ — CTA */}
          <div style={{ padding: '14px 18px 18px' }}>
            <button
              type="submit"
              disabled={!ctaEnabled}
              className="sr-press"
              style={{
                ...orangeBtn,
                font: `900 17px ${SANS}`,
                padding: 15,
                borderRadius: 11,
                opacity: ctaEnabled ? 1 : 0.5,
              }}
            >
              {ctaLabel}
            </button>
          </div>
        </form>

        {/* join 失敗時の error message（再入力可能な inline alert）
            - errorKind='duplicate-name' (backend 409): 赤系単色で強調
              （bg #FBE3DD / border #B0301C / text #7A1A0F）
            - errorKind='generic'                     : 既存の amber 系で表示 */}
        {errorMessage && (
          <div
            role="alert"
            aria-live="assertive"
            data-error-kind={errorKind ?? 'generic'}
            style={{
              marginTop: 12,
              padding: '10px 12px',
              background: errorKind === 'duplicate-name' ? '#FBE3DD' : '#FFF7EA',
              border: `1.5px solid ${errorKind === 'duplicate-name' ? '#B0301C' : '#C56A2C'}`,
              borderRadius: 9,
              font: `700 12px ${SANS}`,
              color: errorKind === 'duplicate-name' ? '#7A1A0F' : '#7A3A12',
              lineHeight: 1.5,
              width: '100%',
            }}
          >
            {errorMessage}
          </div>
        )}

        {/* 券下注釈（設計B 固定） */}
        <p
          style={{
            margin: '16px 4px 0',
            textAlign: 'center',
            font: `500 11px ${SANS}`,
            color: '#CFE0D0',
          }}
        >
          予想はホストが正解を出すまで何度でも提出・修正できます
        </p>

        {/* ── 既存メンバーとして再参加（rejoin）セクション ──
            ブラウザが落ちた等で名前を再入力するのが面倒なケース向け。
            host を除外した既参加プレイヤーが一人もいなければセクション自体を非表示にする
            （新規卓 / ホストしか居ない卓では noise になるため）。 */}
        {playersExclHost.length > 0 && (
          <ExistingMembersSection
            players={playersExclHost}
            onRejoin={(n, c) => { void rejoinAs(n, c); }}
            busy={busy}
          />
        )}
      </div>
    </div>
  );
}

/**
 * 既存メンバー一覧セクション。
 *
 * 設計意図: ブラウザクラッシュ等で再入場する際、名前を typo で別 seat に
 *   なるのを防ぐため、既存メンバー一覧から「これは私です」で rejoin できる。
 * セキュリティ注: なりすまし防止は backend 側で実装していない（性善説）。
 *   UI 上に「他人の名前を選ばないでください」と明記し、ゲムマ会場運用前提とする。
 *
 * インタラクション形式（button）はテスト都合のため変更しない。
 */
function ExistingMembersSection({
  players,
  onRejoin,
  busy,
}: {
  players: Array<{ seat: number; name?: string; color?: string }>;
  onRejoin: (name: string, color: string) => void;
  busy: boolean;
}) {
  return (
    <section
      aria-label="既存メンバーとして再参加"
      style={{
        marginTop: 18,
        background: 'rgba(0,0,0,.22)',
        borderRadius: 12,
        padding: '14px 14px 12px',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.04)',
      }}
    >
      <h3
        style={{
          margin: '0 0 4px',
          font: `700 13px ${SANS}`,
          color: '#F4E7CF',
          letterSpacing: '.02em',
        }}
      >
        すでに参加している場合は戻る
      </h3>
      <p
        style={{
          margin: '0 0 10px',
          font: `500 10.5px ${SANS}`,
          color: '#CFE0D0',
          lineHeight: 1.45,
        }}
      >
        ブラウザが落ちたあとに同じ名前で再参加する場合はこちらから。
        ※他人の名前を選ばないでください。
      </p>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {players.map((p) => {
          const dotColor = resolvePlayerColor({ color: p.color, seat: p.seat });
          // 名前は上位 filter 済みだが TS 上は optional なため fallback。
          const name = p.name ?? `席${p.seat}`;
          // 既存 color が無い player は seat ベース既定色を継承（rejoin 時もその色で join）。
          const sendColor = p.color ?? dotColor;
          return (
            <li key={p.seat}>
              <button
                type="button"
                onClick={() => onRejoin(name, sendColor)}
                disabled={busy}
                aria-label={`${name} として再参加する`}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  background: '#FBF6EA',
                  border: '1.5px solid #E3D4B8',
                  borderRadius: 9,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                  textAlign: 'left',
                }}
              >
                {/* 駒色ドット（resolvePlayerColor で既存色 or seat 既定色） */}
                <span
                  aria-hidden="true"
                  style={{
                    flex: 'none',
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    background: dotColor,
                    border: '1.5px solid rgba(0,0,0,.18)',
                    boxShadow: 'inset 0 -1px 2px rgba(0,0,0,.18)',
                  }}
                />
                <span style={{ font: `700 14px ${SERIF}`, color: '#2E2A24', flex: 1 }}>
                  {name}
                </span>
                <span
                  style={{
                    font: `700 11px ${SANS}`,
                    color: '#FFF7EA',
                    background: 'linear-gradient(#C56A2C,#A8521F)',
                    padding: '6px 10px',
                    borderRadius: 999,
                  }}
                >
                  これは私です
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// -------------------------------------------------------------------
// 券内部サブコンポーネント（このファイル内専用）
// -------------------------------------------------------------------

/** 券ヘッダ（オレンジ帯 + ADMISSION / 入場券 + ゲームロゴグリッド） */
function TicketHead() {
  return (
    <div
      style={{
        background: 'linear-gradient(#C56A2C,#A8521F)',
        padding: '16px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ lineHeight: 1.1 }}>
        <div
          style={{
            font: `700 10px ${DISPLAY}`,
            color: '#FBE3CF',
            letterSpacing: '.18em',
          }}
        >
          ADMISSION
        </div>
        <div style={{ font: `900 22px ${SANS}`, color: '#FFF7EA' }}>入場券</div>
      </div>
      {/* 2×2 ゲームロゴグリッド */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 3,
          width: 34,
          height: 34,
          background: 'rgba(0,0,0,.18)',
          padding: 6,
          borderRadius: 8,
        }}
        aria-hidden="true"
      >
        <div style={{ background: '#F1E7D3', borderRadius: '50%' }} />
        <div style={{ background: '#ECC23E', borderRadius: '50%' }} />
        <div style={{ background: '#C8392F', borderRadius: '50%' }} />
        <div style={{ background: '#F1E7D3', borderRadius: '50%' }} />
      </div>
    </div>
  );
}

/**
 * 卓情報行（ホストアバター + 卓名・進行状態 + 途中参加OK バッジ）
 *
 * 卓名は Room.name（backend optional column）を上位で解決した値を props で受け取る。
 * サブラインは history.length / round.status から動的に算出し props で受け取る
 * （「開始前」「第NR 進行中」「第NR 結果発表中」のいずれか。部屋#XXXX は撤去済み）。
 */
function TicketRoomInfo({ roomName, subline, hostName }: { roomName: string; subline: string; hostName: string }) {
  // ホスト頭文字: view.players.find(seat=hostSeat).name の先頭1文字。
  // hostName が未取得 / 既定 "ホスト" の場合は '?' にフォールバック。
  const hostInitial =
    hostName && hostName !== 'ホスト' ? Array.from(hostName)[0] ?? '?' : '?';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
      {/* ホストアバター（hostName 先頭1文字。fallback '?'） */}
      <div
        style={{
          flex: 'none',
          width: 34,
          height: 34,
          borderRadius: 9,
          background: '#6B4F3A',
          color: '#F4E7CF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          font: `700 15px ${SERIF}`,
        }}
        aria-hidden="true"
      >
        {hostInitial}
      </div>
      {/* 卓名・部屋番号サブ行 */}
      <div style={{ lineHeight: 1.2 }}>
        <div style={{ font: `700 15px ${SERIF}`, color: '#2E2A24' }}>{roomName}</div>
        <span style={{ font: `500 10px ${SANS}`, color: '#8A7A60' }}>{subline}</span>
      </div>
      {/* 途中参加OK バッジ */}
      <span
        style={{
          marginLeft: 'auto',
          font: `700 9px ${SANS}`,
          color: '#2C6E3E',
          background: '#E3EFE3',
          padding: '4px 8px',
          borderRadius: 999,
          whiteSpace: 'nowrap',
        }}
      >
        途中参加OK
      </span>
    </div>
  );
}

/**
 * 名前入力フィールド（下線スタイル）。
 *
 * 設計B の「お名前（チーム名）をご記入ください」ラベル + 罫線下入力 + カーソル。
 * Playwright の getByText は <input value> を拾わないため、設計の例示テキスト
 * "チームたぬき" は別途サンプル行として下に表示する（requiredTexts 担保）。
 */
function NameField({
  inputId,
  value,
  onChange,
  placeholder,
}: {
  inputId: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <>
      <label
        htmlFor={inputId}
        style={{
          display: 'block',
          font: `700 11px ${SANS}`,
          color: '#8A7A60',
          letterSpacing: '.04em',
          marginBottom: 7,
        }}
      >
        お名前（チーム名）をご記入ください
      </label>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '2.5px solid #C56A2C',
          padding: '6px 2px 9px',
        }}
      >
        <input
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={20}
          autoComplete="off"
          className="sr-field"
          placeholder={placeholder}
          aria-label="チーム名またはお名前"
          style={{
            flex: 1,
            font: `700 19px ${SERIF}`,
            color: '#2E2A24',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            padding: 0,
          }}
        />
        {/* テキストカーソル表示（設計B の細い縦バー） */}
        <span
          aria-hidden="true"
          style={{
            width: 2,
            height: 22,
            background: '#C56A2C',
            marginLeft: 3,
            animation: 'sr-pulse 1s step-end infinite',
          }}
        />
      </div>
      {/* 例示テキスト（設計の固定サンプル "チームたぬき"。requiredTexts 担保） */}
      <span
        style={{
          display: 'block',
          marginTop: 8,
          font: `500 10px ${SANS}`,
          color: '#A89472',
          letterSpacing: '.02em',
        }}
      >
        例: チームたぬき
      </span>
    </>
  );
}

/**
 * 駒色ピッカー（設計B：小サイズ円 × 4）。
 *
 * 「駒色をえらぶ」見出しと選択リング付き 4 色のドット。選んだ index に対応する
 * PALETTE[i].color (hex) を join({ color }) で送信する（RoomPlayer.color 列）。
 * 既存ルーム（color 未設定）でも optional column のため backwards-compat。
 *
 * 注: A レイアウト固有の見出し "あなたの駒色" は使わない（mustNotShow 準拠）。
 */
function PalettePicker({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect: (i: number) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 14,
      }}
    >
      <div style={{ display: 'flex', gap: 7 }}>
        {PALETTE.map((c, i) => {
          const isSel = i === selected;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(i)}
              aria-label={`駒色 ${i + 1}`}
              aria-pressed={isSel}
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: c.color,
                border: `2.5px solid ${isSel ? '#7A4A12' : c.ring}`,
                boxShadow: 'inset 0 -2px 3px rgba(0,0,0,.2)',
                padding: 0,
                cursor: 'pointer',
              }}
            />
          );
        })}
      </div>
      <span style={{ font: `500 10px ${SANS}`, color: '#A89472' }}>駒色をえらぶ</span>
    </div>
  );
}

/** ミシン目（パーフォレーション） — 破線 + 両端の切り抜き円 */
function Perforation() {
  return (
    <div
      style={{ position: 'relative', height: 0, borderTop: '2px dashed #C8A27C', margin: '0 14px' }}
      aria-hidden="true"
    >
      <div
        style={{
          position: 'absolute',
          top: -9,
          left: -23,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#3E6F52',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: -9,
          right: -23,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#3E6F52',
        }}
      />
    </div>
  );
}
