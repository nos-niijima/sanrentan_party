'use client';

// frameId: host-setup-init (host-room-create-initial / order=1)
// 設計の正: construction/design/サンレンタン_画面2_ホスト管理.dc.html FRAME 1
// 「新しい卓をひらく」pre-creation form。
//
// データ配線方針:
//   - 「卓の名前」: POST /api/rooms の body に name として送信 (空文字なら省略)。
//                  backend は Room.name (optional) に保存する。
//   - 「リンクを知っている人が参加」トグル: POST /api/rooms の body に isPublic として送信。
//                                          backend は Room.isPublic (default true) に保存する。
//
// 2026-06-24 簡素化: 「あいことば（部屋コード）」UI を撤去。招待は作成後の
// /rooms/[id] InviteCard で「URL コピー」1ボタンに統一する（DIGEST.md / conformance-spec
// 参照）。pre-creation で発行できないコードを表示する意味がなくなったため。
//
// 2026-06-24 dead UI 撤去: 副 CTA「プリセットを用意して始める」を削除。
// preset 機能の専用ページ/モーダルが frontend/backend ともに存在せず、
// 設計の遷移先も未確定 (deviations/pending.md N-3) だったため dead button 化していた。
// プリセット呼び出し動線は卓を開いた後のホスト管理画面 (HostPose のプリセットタブ) に集約。

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';

const SANS = "'Noto Sans JP',sans-serif";
const SERIF = "'Noto Serif JP',serif";
const ZILLA = "'Zilla Slab',serif";

function GoogleFonts() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Noto+Serif+JP:wght@600;700&family=Zilla+Slab:wght@600;700&display=swap"
      />
    </>
  );
}

const shellOuter: CSSProperties = {
  background: '#1c1712',
  borderRadius: 38,
  padding: 11,
  boxShadow: '0 12px 32px rgba(0,0,0,.28)',
  width: 390,
};
const shellInner: CSSProperties = {
  position: 'relative',
  borderRadius: 28,
  overflow: 'auto',
  background: '#F1E7D3',
  height: 838,
  maxHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
};

const ROOM_NAME_MAX = 40;

export default function NewRoomPage() {
  const router = useRouter();
  // UI state. roomName / isOpenToLinks は POST /api/rooms の body に乗せる。
  // 2026-06-24 Med-4: 初期値「たけの試遊卓」を撤去。空文字で開始する。
  // 2026-06-24 user 指示: placeholder「たけの試遊卓」も不要のため撤去。空 input を表示する。
  const [roomName, setRoomName] = useState('');
  const [isOpenToLinks, setIsOpenToLinks] = useState(true);
  const [busy, setBusy] = useState(false);
  // 2026-06-24 Med-5: 卓名 input の maxLength=40 silent truncate に visible feedback を付ける。
  // paste 等で 40 文字超を投入したとき、native input は黙って 40 字に切り詰めるため、
  // user 観点では「打ったはずの文字が消えた」状態になる。これを補うため、
  // (a) 残り文字カウンタ N/40 を input 下に常時表示、
  // (b) 残り 5 文字以下で警告色 (#C56A2C)、
  // (c) truncate が直近で起きた場合は赤系 (#B0301C) + 注意文に切り替える。
  //
  // 2026-06-24 low-rooms-new-typing-warning: typing で 41 文字目に達した時も警告を出す。
  // 旧実装は paste 時のみ didTruncate=true にしていたが、typing で値が 40 文字に達し
  // さらに 1 文字打鍵すると native maxLength が黙って block し、ユーザーには「何も起こらない」
  // ように見えていた。onBeforeInput (maxLength 適用前に発火) で「insertText 系で
  // 値長 = MAX かつ selection で置換しない」状況を検知し、didTruncate=true を立てる。
  // paste 経路 (onPaste) も既存ロジックで継続検知。
  const [didTruncate, setDidTruncate] = useState(false);
  // 2026-06-24 med-typing-maxlength-warning:
  // React の onBeforeInput は IME 変換中などで合成イベントを発火しない / 仕様外の挙動が多く、
  // 41 文字目入力試行を確実に拾えない。そのため raw DOM <input> に native addEventListener
  // ('beforeinput', ...) を直接 attach し、maxLength 適用前に projected 長を判定する。
  // value を closure キャプチャしないように roomNameRef 経由で最新値を参照する。
  const inputRef = useRef<HTMLInputElement | null>(null);
  const roomNameRef = useRef(roomName);
  roomNameRef.current = roomName;
  // 2026-06-24 cookie-identity 移行:
  // signin step を全廃した。room 作成は anonymous cookie (pb_uid) ベースで完結するため、
  // 401/403 はもはや「未ログイン」を意味しない (cookie 発行失敗等のシステム異常)。
  // 401/403 redirect は撤廃し、同画面に明示エラーを出して retry させる。
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Native beforeinput listener: React の SyntheticEvent では typing/IME 経路で
  // 確実に拾えないため、raw DOM <input> に直接 attach する。
  // insert 系のみ対象 (deleteContent*/historyUndo は無視)。paste は onPaste で扱うので除外。
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const handler = (e: Event) => {
      const ie = e as InputEvent;
      const type = ie.inputType ?? '';
      if (!type.startsWith('insert')) return;
      if (type === 'insertFromPaste') return; // onPaste 側で扱う
      const selStart = el.selectionStart ?? roomNameRef.current.length;
      const selEnd = el.selectionEnd ?? roomNameRef.current.length;
      const selLen = selEnd - selStart;
      const inserted = ie.data?.length ?? 1;
      const projected = roomNameRef.current.length - selLen + inserted;
      if (projected > ROOM_NAME_MAX) setDidTruncate(true);
    };
    el.addEventListener('beforeinput', handler);
    return () => {
      el.removeEventListener('beforeinput', handler);
    };
  }, []);

  const nameLen = roomName.length;
  const remaining = ROOM_NAME_MAX - nameLen;
  const counterColor = didTruncate
    ? '#B0301C'
    : remaining <= 5
      ? '#C56A2C'
      : '#8A7A60';
  const counterWeight = didTruncate || remaining <= 5 ? 700 : 500;

  async function handleOpen() {
    if (busy) return;
    setBusy(true);
    setErrorMsg(null);
    try {
      const trimmedName = roomName.trim();
      // **重要**: ここで送る body.name は **卓名 (Room.name)** であり、
      // ホスト本人の表示名 (user.name) ではない。BFF (server-api) は
      // POST /rooms に限り body から user.name を一切拾わない契約に修正済み。
      // ホスト表示名は cookie identity (pb_uid) に紐づく既存 user.name を維持し、
      // 未設定時は backend 側 "ホスト" fallback を使う。
      // 将来「卓名と別にホスト表示名を入力する」ことが必要になれば、
      // 別 input + 別フィールド (例: hostDisplayName) を専用に追加すること。
      // 旧実装の body.creatorName 送信は卓名でホスト名を上書きする root cause だったため撤去。
      // サンレンタン Party では gameId は持たない (単一ゲーム前提)。
      const body: {
        name?: string;
        isPublic?: boolean;
      } = {};
      if (trimmedName.length > 0) {
        body.name = trimmedName;
      }
      body.isPublic = isOpenToLinks;
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const room = (await res.json()) as { id: string };
        router.push(`/rooms/${room.id}`);
        return;
      }
      // 2026-06-24 cookie-identity: 401/403 はもはや signin 要求ではない。
      // pb_uid cookie の発行に失敗した等の異常系のみ想定 (通常起こらない)。
      if (res.status === 401 || res.status === 403) {
        setErrorMsg(
          '卓を作成できませんでした (cookie発行失敗等)。ページを再読み込みしてもう一度お試しください。',
        );
        return;
      }
      // その他 (4xx 入力エラー / 5xx server エラー) → 同画面で alert 表示し retry 可能に。
      let detail = '';
      try {
        const data = (await res.json()) as { message?: string } | null;
        if (data && typeof data.message === 'string') detail = data.message;
      } catch {
        // body parse 失敗は detail なしで続行
      }
      setErrorMsg(
        `卓を作成できませんでした (server エラー: ${res.status})${detail ? ` ${detail}` : ''}。もう一度お試しください。`,
      );
    } catch {
      // network 失敗 (fetch reject) → redirect せず alert で通知し retry させる。
      setErrorMsg(
        '卓を作成できませんでした (ネットワークエラー)。接続を確認してもう一度お試しください。',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#e7e5df',
        fontFamily: SANS,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: 48,
      }}
    >
      <GoogleFonts />

      <div style={shellOuter}>
        <div data-screen-label="画面2 ホスト / 部屋作成" style={shellInner}>
          {/* walnut host bar */}
          <div
            style={{
              flex: 'none',
              background: 'linear-gradient(#6B4F3A,#5A4226)',
              boxShadow: 'inset 0 -2px 4px rgba(0,0,0,.22)',
            }}
          >
            {/* 2026-06-24 cleanup: モック status bar (時刻 '9:41' + バッテリー/電波アイコン)
                を撤去。ブラウザアプリには OS status bar が無く、固定 literal '9:41' が
                ユーザーに見えると実時刻と矛盾して混乱の元になる (TRIAGE.md M-2)。
                WalnutBar 本体 (戻る/タイトル/バッジ) はそのまま維持。 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '14px 16px 13px',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  // 2026-06-24 low-rooms-new-unsaved-warning:
                  // 卓名 input に未保存の文字が残っているまま戻ると silent に破棄され、
                  // user は「打った内容が消えた」と感じる。trim 後 length > 0 なら
                  // window.confirm で明示的に確認する (cancel すると navigation 中止)。
                  // length===0 のときは確認なしで素直に戻る。
                  if (
                    roomName.trim().length > 0 &&
                    typeof window !== 'undefined' &&
                    !window.confirm(
                      '入力中の卓名が破棄されます。よろしいですか？',
                    )
                  ) {
                    return;
                  }
                  router.push('/');
                }}
                aria-label="戻る"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#F4E7CF',
                  font: `700 19px/1 ${SANS}`,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                ‹
              </button>
              <span style={{ font: `700 16px/1 ${ZILLA}`, color: '#F4E7CF' }}>
                サンレンタン
              </span>
              <span
                style={{
                  font: `700 10px ${SANS}`,
                  color: '#FFF7EA',
                  background: '#C56A2C',
                  padding: '4px 9px',
                  borderRadius: 999,
                  boxShadow: '0 1px 0 #9A4E1C',
                }}
              >
                ホスト操作卓
              </span>
            </div>
          </div>

          {/* body */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              padding: '22px 18px 140px',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 22 }}>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 56,
                  height: 56,
                  borderRadius: 15,
                  background: '#6B4F3A',
                  color: '#F4E7CF',
                  font: `700 26px ${SERIF}`,
                  marginBottom: 11,
                  boxShadow: '0 3px 7px rgba(70,50,30,.3)',
                }}
                aria-label="ホストアバター"
              >
                {/* 旧実装は literal 'た' (固定 mock) で、卓名と無関係に常に同じ文字を表示し
                    dead UI 化していた。入力中の卓名先頭 1 字に動的化する。
                    Array.from で surrogate-pair safe (絵文字 1 字を 2 半角扱いしない)。
                    入力が空のときは '?' をプレースホルダにする (ホスト未定の含意)。 */}
                {Array.from(roomName.trim())[0] ?? '?'}
              </div>
              <h2
                style={{
                  margin: 0,
                  font: `700 23px/1.2 ${SERIF}`,
                  color: '#2E2A24',
                }}
              >
                新しい卓をひらく
              </h2>
              <p
                style={{
                  margin: '6px 0 0',
                  font: `500 12px ${SANS}`,
                  color: '#8A7A60',
                }}
              >
                あなたがこのレースのホストです
              </p>
            </div>

            {/* 卓の名前 */}
            <span
              id="roomNameLabel"
              style={{
                font: `700 12px ${SANS}`,
                color: '#2E2A24',
                marginBottom: 8,
              }}
            >
              卓の名前
            </span>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: '#FFFDF7',
                border: '2px solid #C56A2C',
                borderRadius: 11,
                padding: '13px 14px',
                marginBottom: 6,
                boxShadow: '0 2px 5px rgba(70,50,30,.07)',
              }}
            >
              {/* fix iter 6: native <input> に戻す。
                  contentEditable は日本語 IME (compositionstart/end) の挙動が
                  不安定で「入力がうまくできない」報告があった。
                  native input ならブラウザが composition を正しく扱う。
                  視覚スタイル (オレンジボーダー/padding/font/角丸) は親 div で維持し、
                  input 自身は透明で border/padding なし。 */}
              <input
                id="roomName"
                ref={inputRef}
                type="text"
                value={roomName}
                onChange={(e) => {
                  const next = e.target.value;
                  // typing で長さが減った (= 自分で削除/編集した) ときだけ truncate 警告を解除。
                  // 同じ長さ (maxLength で値が変わらない再 onChange は基本起きないが防御) や
                  // 増加方向では警告を維持する。
                  if (didTruncate && next.length < roomName.length) {
                    setDidTruncate(false);
                  }
                  setRoomName(next);
                }}
                onPaste={(e) => {
                  // paste content の長さが残りバッファより大きければ truncate される。
                  // native maxLength は silent truncate するので、明示的に
                  // visible feedback (赤色カウンタ) を発火する。
                  const pasted = e.clipboardData.getData('text');
                  const target = e.currentTarget;
                  const selLen =
                    (target.selectionEnd ?? roomName.length) -
                    (target.selectionStart ?? 0);
                  const projected =
                    roomName.length - selLen + pasted.length;
                  if (projected > ROOM_NAME_MAX) setDidTruncate(true);
                }}
                maxLength={ROOM_NAME_MAX}
                aria-labelledby="roomNameLabel"
                aria-describedby="roomNameCounter"
                style={{
                  flex: 1,
                  font: `600 16px ${SANS}`,
                  color: '#2E2A24',
                  minWidth: 0,
                  outline: 'none',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  margin: 0,
                }}
              />
              <span
                style={{
                  width: 2,
                  height: 20,
                  background: '#C56A2C',
                  marginLeft: 2,
                }}
              />
            </div>
            {/* Med-5: 残り文字カウンタ + truncate 警告。
                aria-live=polite で SR にも残り文字 / truncate を伝える。 */}
            <div
              id="roomNameCounter"
              aria-live="polite"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                margin: '0 2px 18px',
                font: `${counterWeight} 11px ${SANS}`,
                color: counterColor,
              }}
            >
              <span>
                {didTruncate
                  ? '40文字を超えた分は切り詰めました'
                  : remaining <= 5
                    ? `残り ${remaining} 文字`
                    : ''}
              </span>
              <span>
                {nameLen}/{ROOM_NAME_MAX}
              </span>
            </div>

            {/* 公開トグル */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                background: '#FBF6EA',
                border: '1px solid #E3D4B8',
                borderRadius: 11,
                padding: '13px 14px',
              }}
            >
              <div style={{ lineHeight: 1.3 }}>
                <div
                  style={{
                    font: `700 13px ${SANS}`,
                    color: '#2E2A24',
                  }}
                >
                  リンクを知っている人が参加
                </div>
                <span
                  style={{
                    font: `500 10px ${SANS}`,
                    color: '#8A7A60',
                  }}
                >
                  途中参加もいつでもOK
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isOpenToLinks}
                aria-label="リンクを知っている人が参加"
                onClick={() => setIsOpenToLinks((v) => !v)}
                style={{
                  marginLeft: 'auto',
                  width: 46,
                  height: 27,
                  borderRadius: 999,
                  background: isOpenToLinks ? '#3E8E52' : '#B8AE94',
                  position: 'relative',
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,.25)',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 2.5,
                    right: isOpenToLinks ? 2.5 : 'auto',
                    left: isOpenToLinks ? 'auto' : 2.5,
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: '#FBF6EA',
                    boxShadow: '0 1px 2px rgba(0,0,0,.3)',
                    transition: 'left .15s,right .15s',
                  }}
                />
              </button>
            </div>
          </div>

          {/* footer */}
          <div
            style={{
              flex: 'none',
              position: 'sticky',
              bottom: 0,
              zIndex: 10,
              padding: '14px 18px 18px',
              background: '#F1E7D3',
              borderTop: '1px solid #E3D4B8',
              boxShadow: '0 -6px 14px rgba(70,50,30,.12)',
            }}
          >
            {/* med-rooms-new-error-feedback: visible alert.
                role='alert' + aria-live='assertive' で SR にも即時通知。
                cookie-identity 移行で signin redirect は撤廃したため、
                全ての error は同画面で表示し retry を許す (handleOpen finally で busy=false)。 */}
            {errorMsg ? (
              <div
                id="roomCreateError"
                role="alert"
                aria-live="assertive"
                style={{
                  marginBottom: 12,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #B0301C',
                  background: '#FBE3DD',
                  color: '#7A1A0F',
                  font: `700 12px ${SANS}`,
                  lineHeight: 1.4,
                }}
              >
                {errorMsg}
              </div>
            ) : null}
            <button
              type="button"
              onClick={handleOpen}
              disabled={busy}
              aria-describedby={errorMsg ? 'roomCreateError' : undefined}
              style={{
                width: '100%',
                background: 'linear-gradient(#E0A24E,#C56A2C)',
                color: '#FFF7EA',
                font: `900 17px ${SANS}`,
                padding: 15,
                border: 'none',
                borderRadius: 11,
                boxShadow: '0 3px 0 #9A4E1C,0 5px 12px rgba(0,0,0,.22)',
                cursor: busy ? 'wait' : 'pointer',
                opacity: busy ? 0.7 : 1,
              }}
            >
              この卓をひらく
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
