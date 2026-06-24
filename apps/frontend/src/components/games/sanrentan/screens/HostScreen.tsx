'use client';

// 画面2: ホスト管理。設計HTMLから忠実移植。
// ウォルナット調アプリバー＋「ホスト操作卓」バッジ。
// 状態遷移: 初期（部屋作成） → 出題作成/プリセット → open（正解選択） → revealed（公開後進行）
// ホスト＝進行専任（予想しない）。累積順位には含まない。

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { HostRevealRound, HostRevealMultiplier } from '@sanrentan-party/shared';
import { HOST_REVEAL_MULTIPLIERS } from '@sanrentan-party/shared';
import {
  Ranking, GATES, LETTER_LABELS, gateOf, PlayerColorDot,
  SANS, SERIF, DISPLAY, Row,
} from '../shared';
import { yakuStylePill } from '../yaku-style';

// ─── ウォルナットアプリバー ─────────────────────────────────────────────────────
// roomName: backend.Room.name (任意)。/rooms/new で入力された卓名を控えめに表示する。
// 値が無い (=ホストが卓名を省略した) 場合は generic fallback「試遊卓」を表示し、
// ホスト名 (hostName) は絶対に表示しない (= 共有画面でもホスト名は出さない設計に揃える)。
function WalnutBar({
  title,
  roomName,
  asHeading = false,
}: {
  title: string;
  roomName?: string;
  asHeading?: boolean;
}) {
  const router = useRouter();
  const displayRoomName = roomName?.trim() ? roomName.trim() : '試遊卓';
  return (
    <div
      style={{
        flex: 'none',
        background: 'linear-gradient(#6B4F3A,#5A4226)',
        boxShadow: 'inset 0 -2px 4px rgba(0,0,0,.22)',
      }}
    >
      {/* nav row
          設計のステータスバーモック(9:41 / 電池・電波アイコン) は実アプリでは
          デバイス自体が時刻を表示するため撤去。レイアウト確保のため上部 padding を
          増やし、ナビ行(戻る + タイトル + ホスト操作卓バッジ) は元の構造を維持。 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '16px 16px 13px',
        }}
      >
        {/* 戻る: 履歴がある場合は router.back() で前ページへ。履歴が無い場合
            (直リンクで開いた場合など) は dead button になるため、安全な fallback
            として /browse(公開作品一覧) に push する。Med-8 fix:
            history.length > 1 で履歴有無を判定（history.length===1 は当該タブで
            初めて開いたエントリ）。設計の「‹」記号を維持しつつ <button> 化して
            キーボード/SR にも到達可能にする(背景/枠線は透過のまま、視覚は元の span
            表示を踏襲)。 */}
        <button
          type="button"
          onClick={() => {
            if (typeof window !== 'undefined' && window.history.length > 1) {
              router.back();
            } else {
              router.push('/');
            }
          }}
          aria-label="戻る"
          style={{
            font: `700 19px/1 ${SANS}`,
            color: '#F4E7CF',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ‹
        </button>
        {asHeading ? (
          <h2
            style={{
              margin: 0,
              font: `700 15px/1 ${SERIF}`,
              color: '#F4E7CF',
            }}
          >
            {title}
          </h2>
        ) : (
          <span style={{ font: `700 15px/1 ${SERIF}`, color: '#F4E7CF' }}>
            {title}
          </span>
        )}
        <span
          style={{
            marginLeft: 'auto',
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
      {/* 卓名(室名) を控えめに表示。backend.Room.name 由来。
          /rooms/new で「○○卓」と入力した値を、対戦中の自端末でも確認できるようにする。
          ホスト名(hostName) は表示しない (= 共有画面と同じ匿名性方針)。
          値が空のときは「試遊卓」の generic fallback。 */}
      <div
        data-testid="sr-room-name-topbar"
        style={{
          padding: '0 16px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            font: `500 10px ${SANS}`,
            color: '#D8C6A4',
            opacity: 0.8,
          }}
        >
          ◇
        </span>
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
  );
}

// ─── 招待カード（部屋作成フレーム相当・常時表示）──────────────────────────────
// collapsible=true のとき、初期状態は折りたたまれたコンパクト帯のみ表示し、
// 「招待リンクを表示」トグルで全展開する。出題フレーム ②③ では主CTA
// 「選択肢を公開して予想スタート」をモバイル(高さ932px)ビューポート内に確実に
// 収めるため collapsible=true で渡す。全展開時の内容は collapsible=false と同一。
function InviteCard({
  roomId,
  others,
  collapsible = false,
}: {
  roomId: string;
  others: number;
  collapsible?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [copyErr, setCopyErr] = useState(false);
  // 連打時のフィードバックちらつき防止 (Low-12 fix):
  // 直近の reset timeout を ref に保持し、コピーボタン連打のたびに
  // 前回タイマーを clear → 改めて 1500ms カウントし直す。
  // これにより「コピー済 ✓」表示が連打中に一瞬消えてちらつく現象を回避する。
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyErrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // collapsible のときデフォルトで折りたたみ。collapsible=false なら常に展開。
  const [expanded, setExpanded] = useState(!collapsible);

  // unmount 時に未発火のタイマーを掃除（setState on unmounted を回避）。
  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = null;
      }
      if (copyErrTimerRef.current !== null) {
        clearTimeout(copyErrTimerRef.current);
        copyErrTimerRef.current = null;
      }
    };
  }, []);
  // 2026-06-24: 招待リンクは /join/<id> (招待 landing) を指す。
  // /rooms/<id> はホスト/着席プレイヤー専用ビューになったため、リンクを共有された
  // 受け手が「すでに着席済みなら room へ自動 redirect、未着席なら入室フォーム」と
  // いう自然な flow になる。
  const link =
    typeof window !== 'undefined'
      ? `${window.location.origin}/join/${roomId}`
      : `/join/${roomId}`;
  const panelId = `invite-card-panel-${roomId}`;

  /** secure context (HTTPS/localhost) で navigator.clipboard が無効な
   *  環境向けのレガシーフォールバック。document.execCommand('copy') は
   *  非推奨だが多くのブラウザで依然動作する。 */
  function legacyCopy(text: string): boolean {
    if (typeof document === 'undefined') return false;
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '0';
      ta.style.left = '0';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  async function copy() {
    let ok = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      ok = legacyCopy(link);
    }
    if (ok) {
      setCopied(true);
      setCopyErr(false);
      // 連打時: 前回の reset timer を clear して 1500ms 表示を維持し続ける。
      if (copiedTimerRef.current !== null) {
        clearTimeout(copiedTimerRef.current);
      }
      if (copyErrTimerRef.current !== null) {
        clearTimeout(copyErrTimerRef.current);
        copyErrTimerRef.current = null;
      }
      copiedTimerRef.current = setTimeout(() => {
        setCopied(false);
        copiedTimerRef.current = null;
      }, 1500);
    } else {
      setCopyErr(true);
      // err 側も同様にちらつき防止。
      if (copyErrTimerRef.current !== null) {
        clearTimeout(copyErrTimerRef.current);
      }
      copyErrTimerRef.current = setTimeout(() => {
        setCopyErr(false);
        copyErrTimerRef.current = null;
      }, 2200);
    }
  }

  // ── 折りたたみ時のコンパクト帯 (高さ ~48px) ───────────────────────────────
  // 「N人 参加中」+ コピー(招待URL) + 共有画面リンク + 展開トグル。
  // 2026-06-24: あいことば(#XXXX) とコード横コピーは撤去。招待 URL コピー1本に収束。
  if (collapsible && !expanded) {
    return (
      <div
        style={{
          margin: '14px 16px 0',
          background: '#FBF6EA',
          border: '1px solid #E3D4B8',
          borderRadius: 12,
          boxShadow: '0 2px 5px rgba(70,50,30,.07)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 10px',
          minHeight: 48,
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            font: `700 11px ${SANS}`,
            color: '#3E6F52',
            background: '#E3EFE3',
            padding: '4px 9px',
            borderRadius: 999,
          }}
        >
          {others}人 参加中
        </span>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          aria-controls={panelId}
          aria-label="招待リンクを表示"
          style={{
            font: `700 11px ${SANS}`,
            color: '#6B4F3A',
            background: 'transparent',
            border: '1px solid #D8C6A4',
            padding: '6px 10px',
            borderRadius: 8,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span>招待リンクを表示</span>
          <span aria-hidden="true">▾</span>
        </button>
        <button
          onClick={copy}
          aria-label="招待 URL をコピー"
          style={{
            marginLeft: 'auto',
            font: `700 11px ${SANS}`,
            color: '#C56A2C',
            background: '#FBEFD9',
            border: '1px solid #ECCfa0',
            padding: '6px 12px',
            borderRadius: 8,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {copied ? 'コピー済 ✓' : copyErr ? 'コピー失敗' : 'コピー'}
        </button>
        <a
          href={`/rooms/${roomId}/share`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            font: `700 11px ${SANS}`,
            color: '#6B4F3A',
            textDecoration: 'underline',
            whiteSpace: 'nowrap',
          }}
        >
          共有画面
        </a>
      </div>
    );
  }

  return (
    <div
      id={panelId}
      style={{
        margin: '14px 16px 0',
        background: '#FBF6EA',
        border: '1px solid #E3D4B8',
        borderRadius: 12,
        boxShadow: '0 2px 5px rgba(70,50,30,.07)',
      }}
    >
      {/* collapsible のとき: 折りたたみ可能であることを示すトグル(展開状態) */}
      {collapsible && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '6px 10px 0',
          }}
        >
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-expanded={true}
            aria-controls={panelId}
            aria-label="招待リンクを隠す"
            style={{
              font: `700 11px ${SANS}`,
              color: '#6B4F3A',
              background: 'transparent',
              border: '1px solid #D8C6A4',
              padding: '4px 8px',
              borderRadius: 8,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>招待リンクを隠す</span>
            <span aria-hidden="true">▴</span>
          </button>
        </div>
      )}
      {/* ヘッダ行: 「プレイヤーを招待」 + 「あなた=ホスト」バッジ + 参加人数 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px 10px',
        }}
      >
        <span
          style={{
            font: `700 13px ${SANS}`,
            color: '#2E2A24',
          }}
        >
          プレイヤーを招待
        </span>
        <span
          style={{
            font: `700 9px ${SANS}`,
            color: '#FBF6EA',
            background: '#3E6F52',
            padding: '3px 7px',
            borderRadius: 999,
          }}
        >
          あなた = ホスト
        </span>
        <span
          style={{
            marginLeft: 'auto',
            font: `500 11px ${SANS}`,
            color: '#3E6F52',
            background: '#E3EFE3',
            padding: '4px 9px',
            borderRadius: 999,
          }}
        >
          {others}人 参加中
        </span>
      </div>
      {/* 招待 URL 全文表示 + リンクをコピー */}
      {/* 2026-06-24: あいことば(#XXXX)コードとコード横コピーは撤去。
          URL コピー1本に収束させる。URL 全文を表示し、横の「リンクをコピー」で
          clipboard へ。コピー成功時は「リンクコピー済 ✓」フィードバック。 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: '#F5EDD8',
          border: '1px solid #E3D4B8',
          borderRadius: 10,
          padding: '11px 14px',
          margin: '0 10px',
        }}
      >
        <span
          style={{
            flex: 1,
            font: `600 12px/1.4 ${SANS}`,
            color: '#6B4F3A',
            wordBreak: 'break-all',
            minWidth: 0,
          }}
        >
          {link}
        </span>
        <button
          onClick={copy}
          aria-label="招待 URL をコピー"
          style={{
            flex: 'none',
            font: `700 12px ${SANS}`,
            color: '#C56A2C',
            background: '#FBEFD9',
            border: '1px solid #ECCfa0',
            padding: '8px 13px',
            borderRadius: 9,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {copied ? 'リンクコピー済 ✓' : copyErr ? 'コピー失敗' : 'リンクをコピー'}
        </button>
      </div>
      {/* 「リンクを知っている人が参加」note */}
      <div
        style={{
          padding: '10px 14px 4px',
          lineHeight: 1.3,
        }}
      >
        <div style={{ font: `700 12px ${SANS}`, color: '#2E2A24' }}>
          リンクを知っている人が参加
        </div>
        <span style={{ font: `500 10px ${SANS}`, color: '#8A7A60' }}>
          途中参加もいつでもOK
        </span>
      </div>
      {/* 共有画面への導線 */}
      <div
        style={{
          padding: '0 14px 12px',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <a
          href={`/rooms/${roomId}/share`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            font: `700 11px ${SANS}`,
            color: '#FFF7EA',
            background: 'linear-gradient(#8A6A47,#6B4F3A)',
            padding: '7px 13px',
            borderRadius: 8,
            textDecoration: 'none',
            boxShadow: '0 1px 0 #5A412E',
          }}
        >
          共有画面（大画面）を開く →
        </a>
      </div>
    </div>
  );
}

// ─── プリセット型 ─────────────────────────────────────────────────────────────
// HostScreen / HostPose が消費するプリセット項目の統一型。
//   builtin: backend の固定 SANRENTAN_SPEC.presets 由来 (prompt + choices のみ)。
//   mine: ユーザースコープ プリセット (POST /api/presets) 由来。title / id を追加保持。
export type HostPresetItem = {
  prompt: string;
  choices: string[];
  source: 'builtin' | 'mine';
  /** 'mine' のみ — DB の id (DELETE に必要) */
  id?: string;
  /** 'mine' のみ — ユーザーが付けた短ラベル。プリセット一覧でお題の上に表示。 */
  title?: string;
};

// ─── 出題エディタ ─────────────────────────────────────────────────────────────
type Tab = 'new' | 'preset';

interface ChoiceEntry {
  id: number;
  value: string;
}

// 出題エディタの初期値（設計フレーム②の例示テキスト）。ユーザー明示で意図的に保持。
// 編集可能なテキストエリアのプレースホルダ的役割を兼ねる：
// ホストはここから自由に上書きでき、編集後の値は onPose 経由で backend に poseRound として
// 送信される（= 配線は完結。"未配線の mock" ではない）。
const SAMPLE_PROMPT = 'BBQで肉以外に焼きたいのは？';
const SAMPLE_CHOICES = [
  'やきそば',
  'ほたて',
  'マシュマロ',
  'しいたけ',
  'とうもろこし',
  'おにぎり',
];

// プリセット保存モーダル。
// ホストが現在の出題エディタの prompt/choices を作品 (GameSpec.presets) に追加するための小ダイアログ。
// 必須: prompt (空白不可) + choices >= 3。
// UI: 中央に薄いカード。Esc / 背景クリックで閉じる (背景クリックは保存中は無効)。
function SavePresetDialog({
  open,
  initialPrompt,
  initialChoices,
  busy,
  err,
  onClose,
  onSave,
}: {
  open: boolean;
  initialPrompt: string;
  initialChoices: string[];
  busy: boolean;
  err: string | null;
  onClose: () => void;
  onSave: (title: string, prompt: string, choices: string[]) => Promise<void>;
}) {
  // モーダルが開くたびに現在の編集中の値で初期化。
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState(initialPrompt);
  const [choicesText, setChoicesText] = useState(initialChoices.join('\n'));
  useEffect(() => {
    if (open) {
      setTitle('');
      setPrompt(initialPrompt);
      setChoicesText(initialChoices.join('\n'));
    }
  }, [open, initialPrompt, initialChoices]);

  // Esc キーで閉じる (a11y)
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const parsedChoices = choicesText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const canSave = title.trim().length > 0 && prompt.trim().length > 0 && parsedChoices.length >= 3;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-preset-title"
      data-testid="sr-save-preset-dialog"
      onClick={() => {
        if (!busy) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(46,42,36,.58)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 360,
          background: '#FBF6EA',
          borderRadius: 14,
          padding: '18px 18px 16px',
          boxShadow: '0 10px 30px rgba(0,0,0,.32)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <h3
          id="save-preset-title"
          style={{
            margin: 0,
            font: `800 16px ${SERIF}`,
            color: '#2E2A24',
          }}
        >
          プリセットに保存
        </h3>
        <p
          style={{
            margin: 0,
            font: `500 11px/1.5 ${SANS}`,
            color: '#8A7A60',
          }}
        >
          この出題を作品のプリセット集に追加します。あとから「プリセット」タブで読み込んで再利用できます。
        </p>
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          <span style={{ font: `700 12px ${SANS}`, color: '#2E2A24' }}>
            タイトル
          </span>
          <input
            type="text"
            aria-label="プリセットのタイトル"
            data-testid="sr-save-preset-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
            placeholder="例: BBQ定番セット"
            style={{
              width: '100%',
              font: `600 14px ${SANS}`,
              color: '#2E2A24',
              padding: '10px 11px',
              border: '1.5px solid #E0CFAD',
              borderRadius: 9,
              background: '#FFFDF7',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </label>
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          <span style={{ font: `700 12px ${SANS}`, color: '#2E2A24' }}>
            お題
          </span>
          <input
            type="text"
            aria-label="プリセットのお題"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={busy}
            style={{
              width: '100%',
              font: `600 14px ${SERIF}`,
              color: '#2E2A24',
              padding: '10px 11px',
              border: '1.5px solid #E0CFAD',
              borderRadius: 9,
              background: '#FFFDF7',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </label>
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          <span style={{ font: `700 12px ${SANS}`, color: '#2E2A24' }}>
            選択肢（1行に1つ・3つ以上）
          </span>
          <textarea
            aria-label="プリセットの選択肢"
            value={choicesText}
            onChange={(e) => setChoicesText(e.target.value)}
            disabled={busy}
            rows={6}
            style={{
              width: '100%',
              font: `500 13px/1.5 ${SANS}`,
              color: '#2E2A24',
              padding: '10px 11px',
              border: '1.5px solid #E0CFAD',
              borderRadius: 9,
              background: '#FFFDF7',
              outline: 'none',
              boxSizing: 'border-box',
              resize: 'vertical',
            }}
          />
          <span
            style={{
              font: `500 10px ${SANS}`,
              color: parsedChoices.length >= 3 ? '#3E8E52' : '#C56A2C',
            }}
          >
            {parsedChoices.length}つ入力中
          </span>
        </label>
        {err && (
          <p
            role="alert"
            style={{
              margin: 0,
              font: `600 12px ${SANS}`,
              color: '#A22C24',
            }}
          >
            {err}
          </p>
        )}
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            marginTop: 4,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              font: `700 13px ${SANS}`,
              color: '#6B4F3A',
              background: 'transparent',
              border: '1.5px solid #D8C6A4',
              padding: '9px 14px',
              borderRadius: 9,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => {
              if (canSave && !busy) {
                void onSave(title.trim(), prompt.trim(), parsedChoices);
              }
            }}
            disabled={!canSave || busy}
            data-testid="sr-save-preset-submit"
            style={{
              font: `800 13px ${SANS}`,
              color: '#FFF7EA',
              background: canSave
                ? 'linear-gradient(#E0A24E,#C56A2C)'
                : 'linear-gradient(#C8C2B4,#A89E8C)',
              border: 'none',
              padding: '10px 16px',
              borderRadius: 9,
              cursor: canSave && !busy ? 'pointer' : 'not-allowed',
              boxShadow: canSave
                ? '0 2px 0 #9A4E1C'
                : '0 2px 0 #8A8278',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? '保存中…' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  );
}

function HostPose({
  presets,
  lastAnswer,
  canSavePreset,
  onSavePreset,
  onDeletePreset,
  onPose,
}: {
  presets: HostPresetItem[];
  lastAnswer?: string[];
  /** ホストユーザーのみ true。プリセット保存 UI の visible ゲート。 */
  canSavePreset: boolean;
  /** ユーザースコープ プリセット保存 (POST /api/presets) を呼ぶハンドラ。
   *  null のときは保存機能を提供できない (非ホスト等)。 */
  onSavePreset: ((title: string, prompt: string, choices: string[]) => Promise<void>) | null;
  /** ユーザースコープ プリセット削除 (DELETE /api/presets/:id) を呼ぶハンドラ。 */
  onDeletePreset?: (id: string) => Promise<void>;
  onPose: (prompt: string, choices: string[], multiplier: HostRevealMultiplier) => Promise<void>;
}) {
  const [tab, setTab] = useState<Tab>('new');
  const [prompt, setPrompt] = useState(SAMPLE_PROMPT);
  // 旧 contentEditable 実装で使用していた promptKey は <input> 化により不要
  // (controlled <input> は value prop の外部変更にも追従するため再 mount 不要)。
  const [choices, setChoices] = useState<ChoiceEntry[]>(
    SAMPLE_CHOICES.map((value, i) => ({ id: i + 1, value })),
  );
  const [nextId, setNextId] = useState(SAMPLE_CHOICES.length + 1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [presetSearch, setPresetSearch] = useState('');
  // プリセット保存ダイアログ state。
  // open: dialog visibility / saveBusy: POST 進行中フラグ / saveErr: 直近エラーメッセージ /
  // saveToast: 成功時にフェードして消えるトースト文言。
  const [savePresetOpen, setSavePresetOpen] = useState(false);
  const [savePresetBusy, setSavePresetBusy] = useState(false);
  const [savePresetErr, setSavePresetErr] = useState<string | null>(null);
  const [savePresetToast, setSavePresetToast] = useState<string | null>(null);
  const savePresetToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (savePresetToastTimerRef.current !== null) {
        clearTimeout(savePresetToastTimerRef.current);
      }
    };
  }, []);
  // 設問単位の倍率セレクタ。
  // 仕様(user 4 確定): 値域 1/2/3/5/10 / 初期 1x / 毎回 1x リセット / 公開情報。
  // ラウンド公開 (handlePose) 後に setMultiplier(1) で reset する (出題ごと初期 1x)。
  const [multiplier, setMultiplier] = useState<HostRevealMultiplier>(1);
  // WAI-ARIA tabs: 矢印キーで tab 間移動 + Home/End。視覚は変更しない。
  const tabNewRef = useRef<HTMLButtonElement | null>(null);
  const tabPresetRef = useRef<HTMLButtonElement | null>(null);

  function handleTablistKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const order: Tab[] = ['new', 'preset'];
    const refs: Record<Tab, React.RefObject<HTMLButtonElement | null>> = {
      new: tabNewRef,
      preset: tabPresetRef,
    };
    const currentIndex = order.indexOf(tab);
    let nextIndex = -1;
    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % order.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + order.length) % order.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = order.length - 1;
    }
    if (nextIndex >= 0) {
      e.preventDefault();
      const nextTab = order[nextIndex];
      setTab(nextTab);
      refs[nextTab].current?.focus();
    }
  }

  const validChoices = choices.map((c) => c.value.trim()).filter(Boolean);
  const canSubmit = prompt.trim().length > 0 && validChoices.length >= 3;

  function addChoice() {
    setChoices((prev) => [...prev, { id: nextId, value: '' }]);
    setNextId((n) => n + 1);
  }

  function removeChoice(id: number) {
    setChoices((prev) => prev.filter((c) => c.id !== id));
  }

  function updateChoice(id: number, val: string) {
    setChoices((prev) => prev.map((c) => (c.id === id ? { ...c, value: val } : c)));
  }

  function loadPreset(p: { prompt: string; choices: string[] }) {
    setPrompt(p.prompt);
    const entries = p.choices.map((v, i) => ({ id: i + 1, value: v }));
    setChoices(entries);
    setNextId(entries.length + 1);
    setTab('new');
  }

  async function pose() {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      await onPose(prompt.trim(), validChoices, multiplier);
      // 出題ごとに 1x へリセット (user 確定仕様: 倍率は前ラウンドから引き継がない)
      setMultiplier(1);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '出題に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  // プリセット保存: ダイアログを開く。canSavePreset=false (非オーナー / gameId なし) の
  // ときはそもそも CTA を render しないため、ここでは安全のためのガードのみ。
  function openSavePresetDialog() {
    if (!canSavePreset || !onSavePreset) return;
    setSavePresetErr(null);
    setSavePresetOpen(true);
  }

  async function handleSavePreset(t: string, p: string, c: string[]) {
    if (!onSavePreset) return;
    setSavePresetBusy(true);
    setSavePresetErr(null);
    try {
      await onSavePreset(t, p, c);
      setSavePresetOpen(false);
      setSavePresetToast('プリセットに保存しました');
      if (savePresetToastTimerRef.current !== null) {
        clearTimeout(savePresetToastTimerRef.current);
      }
      savePresetToastTimerRef.current = setTimeout(() => {
        setSavePresetToast(null);
        savePresetToastTimerRef.current = null;
      }, 2400);
    } catch (e) {
      setSavePresetErr(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSavePresetBusy(false);
    }
  }

  const filteredPresets = presets.filter(
    (p) =>
      p.prompt.includes(presetSearch) ||
      (p.title ?? '').includes(presetSearch) ||
      p.choices.some((c) => c.includes(presetSearch))
  );

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        // 新規作成タブでは CTA を position: sticky で固定するため、
        // sticky の祖先 scroll container を生む overflow:hidden を避ける必要がある。
        // 新規作成タブ表示時はオーバーフローを許可し、ページ側のスクロールに任せる。
        overflow: tab === 'new' ? 'visible' : 'hidden',
      }}
    >
      {/* 前のレース正解 */}
      {lastAnswer && lastAnswer.length > 0 && (
        <div
          style={{
            margin: '12px 16px 0',
            padding: '10px 13px',
            background: '#E3EFE3',
            border: '1px solid #BFD8C2',
            borderRadius: 10,
          }}
        >
          <span style={{ font: `700 11px ${SANS}`, color: '#2C6E3E', marginRight: 7 }}>
            前のレースの正解
          </span>
          <span
            style={{ font: `700 14px ${DISPLAY}`, color: '#2E2A24' }}
          >
            {lastAnswer.join(' → ')}
          </span>
        </div>
      )}

      {/* タブ */}
      <div
        role="tablist"
        aria-label="出題ソース"
        onKeyDown={handleTablistKeyDown}
        style={{
          flex: 'none',
          display: 'flex',
          gap: 6,
          padding: '13px 16px 4px',
          background: '#F1E7D3',
        }}
      >
        <button
          type="button"
          role="tab"
          id="host-pose-tab-new"
          ref={tabNewRef}
          aria-selected={tab === 'new'}
          aria-controls="host-pose-panel-new"
          tabIndex={tab === 'new' ? 0 : -1}
          onClick={() => setTab('new')}
          style={{
            flex: 1,
            textAlign: 'center',
            font: tab === 'new' ? `700 13px ${SANS}` : `600 13px ${SANS}`,
            color: tab === 'new' ? '#FFF7EA' : '#8A7A60',
            background: tab === 'new' ? '#6B4F3A' : '#FBF6EA',
            border: tab === 'new' ? 'none' : '1px solid #E0CFAD',
            padding: '10px',
            borderRadius: 9,
            boxShadow: tab === 'new' ? '0 1px 0 #5A412E' : 'none',
            cursor: 'pointer',
          }}
        >
          新規作成
        </button>
        <button
          type="button"
          role="tab"
          id="host-pose-tab-preset"
          ref={tabPresetRef}
          aria-selected={tab === 'preset'}
          aria-controls="host-pose-panel-preset"
          tabIndex={tab === 'preset' ? 0 : -1}
          onClick={() => setTab('preset')}
          style={{
            flex: 1,
            textAlign: 'center',
            font: tab === 'preset' ? `700 13px ${SANS}` : `600 13px ${SANS}`,
            color: tab === 'preset' ? '#FFF7EA' : '#8A7A60',
            background: tab === 'preset' ? '#6B4F3A' : '#FBF6EA',
            border: tab === 'preset' ? 'none' : '1px solid #E0CFAD',
            padding: '10px',
            borderRadius: 9,
            boxShadow: tab === 'preset' ? '0 1px 0 #5A412E' : 'none',
            cursor: 'pointer',
          }}
        >
          プリセット
        </button>
      </div>

      {tab === 'new' ? (
        /* ── 新規作成タブ ──
            CTA フッターを position: sticky; bottom:0 にする都合上、ここでは
            内部スクロールを作らず、ページ flow に任せる。選択肢リスト末尾の
            空きスペース確保のため padding-bottom を CTA 概算高(約 120px) 分積む。 */
        <div
          role="tabpanel"
          id="host-pose-panel-new"
          aria-labelledby="host-pose-tab-new"
          style={{
            flex: 1,
            padding: '14px 16px 140px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* お題 */}
          <span
            style={{
              font: `700 12px ${SANS}`,
              color: '#2E2A24',
              marginBottom: 8,
            }}
          >
            お題
          </span>
          <div
            style={{
              background: '#FFFDF7',
              border: `2px solid ${prompt.trim() ? '#C56A2C' : '#E0CFAD'}`,
              borderRadius: 11,
              padding: '13px 14px',
              marginBottom: 18,
              boxShadow: '0 2px 5px rgba(70,50,30,.07)',
            }}
          >
            {/* お題入力: ネイティブ <input type="text">。
                以前 contentEditable で実装していたが、controlled children
                ({prompt} を JSX 直挿し) によって毎タイプ毎の React 再 render が
                DOM の text node を上書きし、caret が先頭に戻る → 入力が逆順に
                見える / Backspace で消えない / IME 入力が壊れる、という重大な
                死に挙動が発生 (adversarial-skeptic PROBE2/3/4/10/13 で再現済)。
                ネイティブ <input> は value/caret/IME を browser が一貫管理するので
                これらは構造的に発生しない。conformance テストは getByText から
                toHaveValue(...) ベースに移行する (host-question-create-new.spec.ts)。
                key (promptKey) は不要 (input の controlled binding が外部 set にも
                追従するため)。 */}
            <input
              id="host-prompt"
              type="text"
              aria-label="お題"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onFocus={(e) => {
                // a11y: フォーカス時の視覚的フォーカスリングを描画。
                // outline はレイアウトに影響しない（box の外側に描画される）ので
                // 既存のスペース/サイズは変わらない。
                e.currentTarget.style.outline = '2px solid #C56A2C';
                e.currentTarget.style.outlineOffset = '2px';
                // UX (Med-7): 値が初期サンプル(SAMPLE_PROMPT)のままなら、
                // フォーカス時に全選択して一発で上書き(削除→自分の入力)可能にする。
                // <input> は select() が native 提供されており、caret/Range 復元の
                // 副作用も無い (contentEditable 時の rAF/Selection API hack は不要)。
                if (e.currentTarget.value === SAMPLE_PROMPT) {
                  e.currentTarget.select();
                }
              }}
              onBlur={(e) => {
                e.currentTarget.style.outline = 'none';
                e.currentTarget.style.outlineOffset = '0';
              }}
              style={{
                width: '100%',
                font: `600 15px/1.5 ${SERIF}`,
                color: '#2E2A24',
                outline: 'none',
                border: 'none',
                background: 'transparent',
                padding: 0,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* ===== この設問の重み（倍率セレクタ） =====
              設計 source: construction/design/サンレンタン_出題_倍率セレクタ.dc.html Frame 1
              frameId: host-pose-with-multiplier
              user 確定仕様: 値域 1/2/3/5/10 / 初期 1x / 毎回 1x リセット /
                            公開情報 (秘密ではない) / 出題と同時にプレイヤーへ告知。 */}
          <div
            data-testid="sr-multiplier-selector"
            style={{
              background: '#FBF6EA',
              border: '1.5px solid #E0CFAD',
              borderRadius: 13,
              padding: '13px 14px 14px',
              marginBottom: 16,
              boxShadow: '0 2px 5px rgba(70,50,30,.06)',
            }}
          >
            <div
              role="group"
              aria-label="この設問の重み"
              style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}
            >
              <span style={{ font: `700 13px ${SANS}`, color: '#2E2A24' }}>
                この設問の重み
              </span>
              <span
                style={{
                  font: `700 10px ${SANS}`,
                  color: '#FFF7EA',
                  background: '#C8392F',
                  padding: '3px 8px',
                  borderRadius: 999,
                }}
              >
                倍率
              </span>
            </div>
            <div style={{ display: 'flex', gap: 7, marginBottom: 11 }}>
              {HOST_REVEAL_MULTIPLIERS.map((m) => {
                const on = m === multiplier;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`倍率 ${m}x`}
                    data-testid={`sr-multiplier-chip-${m}`}
                    onClick={() => setMultiplier(m)}
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      padding: '11px 0',
                      borderRadius: 10,
                      background: on ? '#C8392F' : '#FFFDF7',
                      border: `2px solid ${on ? '#A22C24' : '#E0CFAD'}`,
                      boxShadow: on
                        ? '0 3px 0 #7E2019,0 4px 9px rgba(162,44,36,.28)'
                        : 'none',
                      cursor: 'pointer',
                      font: `900 18px ${DISPLAY}`,
                      color: on ? '#FFF7EA' : '#8A6A47',
                    }}
                  >
                    {m}x
                  </button>
                );
              })}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                background: '#FBEFD9',
                border: '1px solid #ECCfa0',
                borderRadius: 9,
                padding: '10px 12px',
              }}
            >
              <span style={{ flex: 'none', font: `700 15px ${SANS}`, color: '#C56A2C' }}>
                ⚖
              </span>
              <span style={{ font: `600 11px/1.55 ${SANS}`, color: '#6B4F3A' }}>
                正解時の払戻が{' '}
                <b style={{ color: '#C8392F' }}>{multiplier}倍</b> で計算されます。例:
                サンレンタン 6点 →{' '}
                <b style={{ color: '#C8392F' }}>{6 * multiplier}点</b>
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                marginTop: 9,
                padding: '0 2px',
              }}
            >
              <span style={{ font: `700 11px ${SANS}`, color: '#3E8E52' }}>📣</span>
              <span style={{ font: `500 11px/1.5 ${SANS}`, color: '#8A7A60' }}>
                倍率は出題と同時にプレイヤーへ表示されます（秘密ではありません）
              </span>
            </div>
          </div>

          {/* 選択肢ヘッダ */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              marginBottom: 9,
            }}
          >
            <span style={{ font: `700 12px ${SANS}`, color: '#2E2A24' }}>
              選択肢（出走）
            </span>
            <span
              style={{
                font: `600 11px ${SANS}`,
                color: validChoices.length >= 3 ? '#3E8E52' : '#C56A2C',
              }}
            >
              {validChoices.length}つ
            </span>
            <span
              style={{
                marginLeft: 'auto',
                font: `500 11px ${SANS}`,
                color: '#8A7A60',
              }}
            >
              3着まで選ぶので最低3つ
            </span>
          </div>

          {/* 選択肢リスト */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              marginBottom: 8,
            }}
          >
            {choices.map((c, idx) => {
              const gate = GATES[idx % GATES.length];
              // A-F display migration: 枠ラベルは数字 (1,2,...) ではなく英字 (A,B,...) に統一。
              // 8 枠を超える場合は LETTER_LABELS が undefined になるため数値文字列に fallback。
              const n = LETTER_LABELS[idx] ?? String(idx + 1);
              return (
                <div
                  key={c.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    background: '#FBF6EA',
                    border: '1px solid #E3D4B8',
                    borderRadius: 10,
                    padding: '9px 11px',
                  }}
                >
                  {/* drag handle */}
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 2, opacity: 0.5 }}
                    aria-hidden="true"
                  >
                    <div style={{ width: 14, height: 2, background: '#A89472', borderRadius: 2 }} />
                    <div style={{ width: 14, height: 2, background: '#A89472', borderRadius: 2 }} />
                    <div style={{ width: 14, height: 2, background: '#A89472', borderRadius: 2 }} />
                  </div>
                  {/* 枠番チップ */}
                  <div
                    style={{
                      flex: 'none',
                      width: 32,
                      height: 32,
                      borderRadius: 7,
                      background: gate.bg,
                      border: `2px solid ${gate.bd}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      font: `700 16px ${DISPLAY}`,
                      color: gate.fg,
                    }}
                  >
                    {n}
                  </div>
                  <input
                    aria-label={`選択肢${n}`}
                    value={c.value}
                    onChange={(e) => updateChoice(c.id, e.target.value)}
                    onFocus={(e) => {
                      // UX (Med-7): 値が初期サンプル(SAMPLE_CHOICES の同位置)の
                      // ままなら、フォーカス時に全選択して一発で上書き可能にする。
                      // 「例題そのまま使う」「自分で書き換える」両方で操作量を最小化。
                      // 注: input 型は維持 (interaction 形式変更は行わない)。
                      if (
                        idx < SAMPLE_CHOICES.length &&
                        c.value === SAMPLE_CHOICES[idx]
                      ) {
                        const el = e.currentTarget;
                        // モバイル Safari など一部環境で focus 直後の select() が
                        // 効かないケースに備えて rAF 経由でも実行。
                        try {
                          el.select();
                        } catch {
                          // noop
                        }
                        requestAnimationFrame(() => {
                          try {
                            el.select();
                          } catch {
                            // noop
                          }
                        });
                      }
                    }}
                    placeholder={`選択肢${n}`}
                    style={{
                      flex: 1,
                      font: `600 14px ${SANS}`,
                      color: '#2E2A24',
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      minWidth: 0,
                    }}
                  />
                  {/* × 削除 */}
                  {choices.length > 3 && (
                    <button
                      onClick={() => removeChoice(c.id)}
                      aria-label={`選択肢${n}を削除`}
                      style={{
                        marginLeft: 'auto',
                        font: `700 16px ${SANS}`,
                        color: '#C0AE8C',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '0 2px',
                        lineHeight: 1,
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
            {/* + 追加 */}
            <button
              onClick={addChoice}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                border: '1.5px dashed #C8A27C',
                borderRadius: 10,
                padding: 11,
                color: '#6B4F3A',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <span style={{ font: `700 16px ${SANS}` }}>＋</span>
              <span style={{ font: `700 13px ${SANS}` }}>選択肢を追加</span>
            </button>
          </div>
          {err && (
            <p
              style={{
                margin: '4px 0 8px',
                font: `600 12px ${SANS}`,
                color: '#A22C24',
              }}
            >
              {err}
            </p>
          )}
        </div>
      ) : (
        /* ── プリセットタブ ── */
        <div
          role="tabpanel"
          id="host-pose-panel-preset"
          aria-labelledby="host-pose-tab-preset"
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '14px 16px 0',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* 検索 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#FBF6EA',
              border: '1px solid #E0CFAD',
              borderRadius: 9,
              padding: '10px 13px',
              gap: 9,
              marginBottom: 14,
            }}
          >
            <span style={{ font: `500 15px ${SANS}`, color: '#A89472' }}>
              🔍
            </span>
            <input
              aria-label="プリセットを検索"
              value={presetSearch}
              onChange={(e) => setPresetSearch(e.target.value)}
              placeholder="登録した出題をさがす"
              style={{
                flex: 1,
                font: `400 13px ${SANS}`,
                color: '#2E2A24',
                border: 'none',
                outline: 'none',
                background: 'transparent',
              }}
            />
          </div>

          {/* プリセット一覧 */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 11,
            }}
          >
            {filteredPresets.length === 0 && (
              <p
                style={{
                  margin: 0,
                  font: `500 13px ${SANS}`,
                  color: '#8A7A60',
                  textAlign: 'center',
                  paddingTop: 24,
                }}
              >
                プリセットがありません
              </p>
            )}
            {filteredPresets.map((p, i) => (
              <div
                key={p.source === 'mine' && p.id ? p.id : i}
                style={{
                  background: '#FBF6EA',
                  border: '1px solid #E3D4B8',
                  borderRadius: 12,
                  padding: '13px 14px',
                  boxShadow: '0 2px 4px rgba(70,50,30,.07)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    {/* 'mine' アイテムはユーザーが付けた短ラベルをお題の上に表示。 */}
                    {p.source === 'mine' && p.title && (
                      <div
                        style={{
                          font: `600 11px ${SANS}`,
                          color: '#8A7A60',
                          marginBottom: 3,
                        }}
                      >
                        {p.title}
                      </div>
                    )}
                    <h3
                      style={{
                        margin: '0 0 7px',
                        font: `600 15px/1.4 ${SERIF}`,
                        color: '#2E2A24',
                      }}
                    >
                      {p.prompt}
                    </h3>
                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {p.choices.slice(0, 3).map((c, ci) => {
                        const g = GATES[ci % GATES.length];
                        return (
                          <span
                            key={ci}
                            style={{
                              font: `600 10px ${SANS}`,
                              color: g.fg,
                              background: g.bg,
                              border: `1.5px solid ${g.bd}`,
                              padding: '4px 8px',
                              borderRadius: 6,
                            }}
                          >
                            {c}
                          </span>
                        );
                      })}
                      {p.choices.length > 3 && (
                        <span
                          style={{
                            font: `600 10px ${SANS}`,
                            color: '#8A7A60',
                            background: '#EFE2C6',
                            padding: '4px 8px',
                            borderRadius: 6,
                          }}
                        >
                          ＋{p.choices.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignSelf: 'center' }}>
                    <button
                      onClick={() => loadPreset(p)}
                      style={{
                        flex: 'none',
                        font: `700 12px ${SANS}`,
                        color: '#FFF7EA',
                        background: 'linear-gradient(#8A6A47,#6B4F3A)',
                        padding: '9px 14px',
                        border: 'none',
                        borderRadius: 8,
                        boxShadow: '0 1px 0 #5A412E',
                        cursor: 'pointer',
                      }}
                    >
                      使う
                    </button>
                    {/* 削除ボタンは 'mine' アイテムかつ onDeletePreset が提供された場合のみ表示。 */}
                    {p.source === 'mine' && p.id && onDeletePreset && (
                      <button
                        type="button"
                        data-testid="sr-preset-delete-button"
                        aria-label={`プリセット「${p.title ?? p.prompt}」を削除`}
                        onClick={() => {
                          if (p.id) void onDeletePreset(p.id);
                        }}
                        style={{
                          flex: 'none',
                          font: `700 11px ${SANS}`,
                          color: '#A22C24',
                          background: 'transparent',
                          border: '1px solid #DBBCB8',
                          padding: '6px 10px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {/* 「＋ プリセットを新規登録」ボタン。
                作品オーナー (canSavePreset=true) のみに表示する。
                クリックで保存ダイアログ (SavePresetDialog) を開く。
                保存時の値は現在の出題エディタ (prompt/choices) を初期値とする。
                stage4: backend API POST /api/games/:id/presets と接続済み (= dead UI から復活)。 */}
            {canSavePreset && onSavePreset && (
              <button
                type="button"
                onClick={openSavePresetDialog}
                data-testid="sr-preset-create-button"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  border: '1.5px dashed #C8A27C',
                  borderRadius: 11,
                  padding: 14,
                  color: '#6B4F3A',
                  background: 'transparent',
                  cursor: 'pointer',
                  font: `700 13px ${SANS}`,
                }}
              >
                <span style={{ font: `700 16px ${SANS}` }}>＋</span>
                <span>プリセットを新規登録</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* フッター: 出題ボタン
          新規作成タブでは iPhone SE(高さ667px) で CTA が画面外に出る問題を避けるため
          position: sticky; bottom: 0 でビューポート下端に固定する。
          色/文言/サイズなど CTA そのものの見た目は維持。 */}
      <div
        style={{
          flex: 'none',
          padding: '13px 16px 18px',
          background: '#FBF6EA',
          borderTop: '1px solid #E3D4B8',
          ...(tab === 'new'
            ? ({
                position: 'sticky',
                bottom: 0,
                zIndex: 5,
              } as const)
            : {}),
        }}
      >
        {tab === 'new' ? (
          <>
            {/* 主 CTA: 出題 / 副 CTA: プリセットに保存 (オーナーのみ表示)
                副 CTA は主 CTA の左に並べ、視覚優先度を主 CTA より下げる
                (枠線・透明背景・茶系テキスト) ことで設計の sticky 主 CTA を阻害しない。
                wiring: backend.action poseRound (主) / backend.GameSpec.presets append (副) */}
            <div style={{ display: 'flex', gap: 8 }}>
              {canSavePreset && onSavePreset && (
                <button
                  type="button"
                  onClick={openSavePresetDialog}
                  data-testid="sr-save-preset-secondary-cta"
                  disabled={!canSubmit || busy}
                  aria-label="この出題をプリセットに保存"
                  style={{
                    flex: 'none',
                    font: `800 13px ${SANS}`,
                    color: canSubmit ? '#6B4F3A' : '#A89E8C',
                    background: '#FBF6EA',
                    border: `1.5px solid ${canSubmit ? '#C8A27C' : '#D8C6A4'}`,
                    padding: '14px 14px',
                    borderRadius: 11,
                    cursor: canSubmit && !busy ? 'pointer' : 'not-allowed',
                    whiteSpace: 'nowrap',
                  }}
                >
                  プリセットに保存
                </button>
              )}
              <button
                onClick={pose}
                disabled={busy || !canSubmit}
                style={{
                  flex: 1,
                  background: canSubmit
                    ? 'linear-gradient(#E0A24E,#C56A2C)'
                    : 'linear-gradient(#C8C2B4,#A89E8C)',
                  color: '#FFF7EA',
                  font: `900 16px ${SANS}`,
                  padding: 15,
                  border: 'none',
                  borderRadius: 11,
                  boxShadow: canSubmit
                    ? '0 3px 0 #9A4E1C,0 5px 12px rgba(0,0,0,.22)'
                    : '0 3px 0 #8A8278',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  opacity: busy ? 0.7 : 1,
                }}
              >
                {busy
                  ? '出題中…'
                  : multiplier === 1
                    ? '出題する'
                    : `×${multiplier}倍で出題する`}
              </button>
            </div>
            <p
              style={{
                margin: '8px 0 0',
                textAlign: 'center',
                font: `500 10px ${SANS}`,
                color: '#8A7A60',
              }}
            >
              公開後にあなたの1〜3着（正解）を選びます
            </p>
          </>
        ) : (
          <p
            style={{
              margin: 0,
              textAlign: 'center',
              font: `500 11px ${SANS}`,
              color: '#8A7A60',
            }}
          >
            「使う」を押すと出題エディタに読み込まれ、公開できます
          </p>
        )}
      </div>
      {/* プリセット保存モーダル: open 時のみ portal-less に描画。
          dialog は position:fixed; inset:0 で viewport を覆うため
          HostPose の overflow には影響しない。 */}
      <SavePresetDialog
        open={savePresetOpen}
        initialPrompt={prompt}
        initialChoices={validChoices}
        busy={savePresetBusy}
        err={savePresetErr}
        onClose={() => {
          if (!savePresetBusy) setSavePresetOpen(false);
        }}
        onSave={handleSavePreset}
      />
      {/* 保存成功時のトースト (約 2.4 秒で消える)。
          role=status で SR にもアナウンスされる。 */}
      {savePresetToast && (
        <div
          role="status"
          aria-live="polite"
          data-testid="sr-save-preset-toast"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 96,
            transform: 'translateX(-50%)',
            background: '#2C6E3E',
            color: '#FBF6EA',
            font: `700 13px ${SANS}`,
            padding: '10px 18px',
            borderRadius: 999,
            boxShadow: '0 5px 18px rgba(0,0,0,.28)',
            zIndex: 110,
            whiteSpace: 'nowrap',
          }}
        >
          {savePresetToast}
        </div>
      )}
    </div>
  );
}

// ─── 正解選択（open 状態 / host-truth-pick フレーム）─────────────────────────
// 設計: construction/design/サンレンタン_画面2_ホスト管理.dc.html FRAME 4
// 本命プレビューは picks 状態を直接反映する（未操作時は中立な empty-state を表示）。
// mock 撤去 (fix iter6): 未操作なのに固定サンプル「③ → ① → ⑤」が出てユーザーが
// 混乱する誤解を解消するため、ハードコードされた placeholder を削除した。
const HOST_TRUTH_PREVIEW_EMPTY = '1〜3着をえらぶ';

/** answer (選択肢ラベル配列) を choices 内の index から英字ラベルシーケンスへ。
 *  A-F display migration: 旧 answerToCircledSequence(丸数字) を改称・変更。
 *  例: choices=["やきそば","ほたて","マシュマロ", ...], answer=["マシュマロ","やきそば","とうもろこし"]
 *  → "C→A→E" */
function answerToLetterSequence(answer: string[], choices: string[]): string {
  return answer
    .map((c) => {
      const i = choices.indexOf(c);
      if (i < 0) return '?';
      return LETTER_LABELS[i] ?? String(i + 1);
    })
    .join('→');
}

function HostReveal({
  round,
  othersCount,
  onReveal,
  roomId,
}: {
  round: HostRevealRound;
  /** ホストを除く参加プレイヤーの総数（= rows.length）。提出済み/未提出の母数。 */
  othersCount: number;
  /** 設計のラベル「あなたの本命（正解）」は host=予想者ではなく『正解の本命』を意味する。 */
  onReveal: (answer: string[]) => Promise<void>;
  /** reveal 成功後にホストを大画面リビール演出画面へ遷移させる先 (share view)。 */
  roomId: string;
}) {
  const router = useRouter();
  // 1〜3着 picks（再タップで取消、順位は picks の index で決まる）。
  const [picks, setPicks] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(c: string) {
    setPicks((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : prev.length < 3 ? [...prev, c] : prev,
    );
  }

  async function submit() {
    if (picks.length !== 3) return;
    setBusy(true);
    setErr(null);
    try {
      await onReveal(picks);
      // reveal 成功後、ホストを大画面リビール演出画面 (/rooms/:id/share) に遷移させる。
      // share 画面側で「結果発表をはじめる」CTA を押すことで自動再生が始まる。
      // 旧フロー (HostScreen 内で結果カードを直接出す) はリビール演出 B 案採用により廃止。
      router.push(`/rooms/${roomId}/share`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : '送信に失敗しました');
    } finally {
      setBusy(false);
    }
  }

  // 本命プレビュー: 実 picks state から derive。
  //   0件 → 中立な empty-state コピー（「1〜3着をえらぶ」）
  //   1〜2件 → 部分選択を可視化（例: 「A」 / 「A → B」）
  //   3件 → 完全シーケンス（例: 「C → A → E」）
  // A-F display migration: 旧 丸数字 (①②③) 表示から英字ラベル (A-F) に変更。
  // 未操作時にサンプル文字列が出る誤解（mock）を撤去済み（fix iter6）。
  const dynamicPreview =
    picks.length === 0
      ? HOST_TRUTH_PREVIEW_EMPTY
      : picks
          .map((c) => {
            const i = round.choices.indexOf(c);
            if (i < 0) return '?';
            return LETTER_LABELS[i] ?? String(i + 1);
          })
          .join(' → ');

  // 提出状況: 実 state から derive。
  //   submitted = round.submittedSeats?.length ?? 0
  //   pending   = max(0, othersCount - submitted)
  // othersCount は HostScreen から rows.length（ホスト除く）として渡される。
  const submittedCount = round.submittedSeats?.length ?? 0;
  const pendingCount = Math.max(0, othersCount - submittedCount);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 緑帯のお題リマインダ */}
      <div
        style={{
          flex: 'none',
          padding: '13px 16px',
          background: '#3E6F52',
          borderBottom: '3px solid #2C4F3A',
        }}
      >
        <div
          style={{
            background: '#FBF6EA',
            borderRadius: 10,
            padding: '11px 13px',
          }}
        >
          <span
            style={{
              font: `700 14px/1.4 ${SERIF}`,
              color: '#2E2A24',
            }}
          >
            {round.prompt}
          </span>
        </div>
        <p
          style={{
            margin: '9px 2px 0',
            font: `600 11px/1.5 ${SANS}`,
            color: '#FBF6EA',
          }}
        >
          あなたの1〜3着を選ぶと予想が締め切られ、答え合わせされます
        </p>
      </div>

      {/* 選択肢リスト（タップで 1着/2着/3着 を割当 / 再タップで取消） */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '13px 16px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {round.choices.map((c) => {
          const g = gateOf(round.choices, c);
          const rank = picks.indexOf(c);
          const assigned = rank >= 0;
          const rowBd = assigned ? '#C56A2C' : '#E3D4B8';
          const badge = assigned ? `${rank + 1}着` : 'えらぶ';
          const badgeBg = assigned ? '#C56A2C' : '#F1E7D3';
          const badgeFg = assigned ? '#FFF7EA' : '#A89472';
          const badgeBd = assigned ? '#9A4E1C' : '#E0CFAD';
          return (
            <button
              key={c}
              onClick={() => toggle(c)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                background: '#FBF6EA',
                border: `1.5px solid ${rowBd}`,
                borderRadius: 11,
                padding: '9px 12px',
                boxShadow: '0 2px 4px rgba(70,50,30,.06)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  flex: 'none',
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: g.bg,
                  border: `2px solid ${g.bd}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  font: `700 18px ${DISPLAY}`,
                  color: g.fg,
                }}
              >
                {g.n}
              </div>
              <span style={{ font: `600 15px ${SANS}`, color: '#2E2A24' }}>{c}</span>
              <span
                style={{
                  marginLeft: 'auto',
                  font: `700 13px ${SANS}`,
                  color: badgeFg,
                  background: badgeBg,
                  border: `1.5px solid ${badgeBd}`,
                  padding: '6px 12px',
                  borderRadius: 999,
                }}
              >
                {badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* 本命プレビュー + 提出状況 + 締切 CTA */}
      <div
        style={{
          flex: 'none',
          padding: '12px 16px 18px',
          background: '#FBF6EA',
          borderTop: '1px solid #E3D4B8',
        }}
      >
        {/* 本命プレビュー行 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 11,
          }}
        >
          <span style={{ font: `700 11px ${SANS}`, color: '#8A7A60' }}>
            あなたの本命（正解）
          </span>
          {picks.length === 0 ? (
            // 未操作の empty-state: 「これは値ではなくガイド」と分かるよう
            // 通常の値表示よりやや小さく/灰色寄りに。layout(行高)は維持。
            <span style={{ font: `600 13px ${SANS}`, color: '#A89472' }}>
              {dynamicPreview}
            </span>
          ) : (
            <span style={{ font: `900 17px ${DISPLAY}`, color: '#2E2A24' }}>
              {dynamicPreview}
            </span>
          )}
        </div>
        {/* 提出状況バナー（実 state から derive: round.submittedSeats / rows.length） */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
            padding: '9px 11px',
            background: '#E3EFE3',
            border: '1px solid #BFD8C2',
            borderRadius: 9,
          }}
        >
          {submittedCount === 0 && pendingCount === 0 ? (
            <span style={{ font: `600 12px ${SANS}`, color: '#6B4F3A' }}>
              まだ予想がありません
            </span>
          ) : (
            <>
              <span style={{ font: `700 12px ${SANS}`, color: '#2C6E3E' }}>
                {submittedCount}人 提出済み
              </span>
              {pendingCount > 0 && (
                <span style={{ font: `500 11px ${SANS}`, color: '#6B4F3A' }}>
                  ／ {pendingCount}人 未提出
                </span>
              )}
            </>
          )}
          <span
            style={{
              marginLeft: 'auto',
              font: `500 10px ${SANS}`,
              color: '#8A7A60',
            }}
          >
            締切後は変更不可
          </span>
        </div>
        {err && (
          <p
            style={{
              margin: '0 0 8px',
              font: `600 12px ${SANS}`,
              color: '#A22C24',
            }}
          >
            {err}
          </p>
        )}
        <button
          onClick={submit}
          disabled={picks.length !== 3 || busy}
          style={{
            width: '100%',
            background:
              picks.length === 3
                ? 'linear-gradient(#C8392F,#A22C24)'
                : 'linear-gradient(#C8C2B4,#A89E8C)',
            color: '#FFF7EA',
            font: `900 16px ${SANS}`,
            padding: 15,
            border: 'none',
            borderRadius: 11,
            boxShadow:
              picks.length === 3
                ? '0 3px 0 #7E2019,0 5px 12px rgba(162,44,36,.3)'
                : '0 3px 0 #8A8278',
            cursor: picks.length === 3 ? 'pointer' : 'not-allowed',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? '送信中…' : '正解公開画面へ'}
        </button>
      </div>
    </div>
  );
}

// ─── 公開後の進行（revealed 状態）────────────────────────────────────────────
function HostPostReveal({
  round,
  rows,
  roomId,
  roundNo,
  onNextRound,
}: {
  round: HostRevealRound;
  rows: Row[];
  roomId: string;
  /** 公開済みラウンドの番号（= state.history.length をベースに親で算出）。1始まり。 */
  roundNo: number;
  onNextRound: () => void;
}) {
  // 完了バナーは実 state から derive する:
  //   タイトル: 「第{roundNo}R の払戻が完了」
  //   サブテキスト: 「正解 {answerSeq} ・ {rows.length}人に配分」
  //   - answerSeq は round.answer (string[]) を round.choices index → 丸数字へ変換
  //   - rows は HostScreen から渡される（ホスト除く参加プレイヤー）。
  // conformance テスト（host-results-published.spec.ts）は fix-iter5 で
  // 正規表現化済みのため、動的値で一致する。
  const answerSeq = round.answer
    ? answerToLetterSequence(round.answer, round.choices)
    : '';
  const distributedCount = rows.length;
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px 16px 0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 完了バナー */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            background: '#E3EFE3',
            border: '1px solid #BFD8C2',
            borderRadius: 12,
            padding: '13px 14px',
            marginBottom: 16,
          }}
        >
          <div
            style={{
              flex: 'none',
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: '#3E8E52',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              font: `700 16px ${SANS}`,
            }}
          >
            ✓
          </div>
          <div style={{ lineHeight: 1.3 }}>
            <div style={{ font: `700 14px ${SANS}`, color: '#2C6E3E' }}>
              第{roundNo}R の払戻が完了
            </div>
            <span style={{ font: `500 11px ${SANS}`, color: '#6B4F3A' }}>
              正解 {answerSeq} ・ {distributedCount}人に配分
            </span>
          </div>
        </div>

        {/* ミニランキング */}
        <span
          style={{
            font: `700 12px ${SANS}`,
            color: '#2E2A24',
            marginBottom: 9,
          }}
        >
          このレースの結果
        </span>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
          }}
        >
          {rows.map((r, i) => {
            const rankBg =
              i === 0
                ? '#E3B42A'
                : i === 1
                ? '#C4C0B4'
                : i === 2
                ? '#C8956A'
                : '#E0CFAD';
            const rankFg = i <= 2 ? '#FFF' : '#8A7A60';
            // round の delta: 今ラウンドで得た点（predictions より）
            const pred = round.predictions?.[String(r.seat)];
            const delta = pred?.points ?? 0;
            const hand = pred?.hand ?? '';
            return (
              <div
                key={r.seat}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 11,
                  background: '#FBF6EA',
                  border: '1px solid #E3D4B8',
                  borderRadius: 10,
                  padding: '9px 12px',
                }}
              >
                <span
                  style={{
                    flex: 'none',
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: rankBg,
                    color: rankFg,
                    font: `700 12px ${DISPLAY}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {i + 1}
                </span>
                {/* 駒色ドット（additive）。row.color が無くても seat → 既定色で安全描画。 */}
                <PlayerColorDot row={r} size={12} />
                <span style={{ font: `600 14px ${SANS}`, color: '#2E2A24' }}>
                  {r.name}
                </span>
                {hand && (() => {
                  const ys = yakuStylePill(hand);
                  return (
                    <span
                      style={{
                        font: `600 10px ${SANS}`,
                        color: ys.color,
                        background: ys.bg,
                        padding: '3px 7px',
                        borderRadius: 999,
                      }}
                    >
                      {hand}
                    </span>
                  );
                })()}
                <div
                  style={{
                    marginLeft: 'auto',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 7,
                  }}
                >
                  {delta > 0 && (
                    <span
                      style={{ font: `600 11px ${SANS}`, color: '#3E8E52' }}
                    >
                      +{delta}
                    </span>
                  )}
                  <span
                    style={{ font: `900 16px ${DISPLAY}`, color: '#2E2A24' }}
                  >
                    {r.pts}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 共有画面 CTA */}
        <div
          style={{
            flex: 'none',
            marginTop: 14,
            padding: '11px 13px',
            background: '#FBEFD9',
            border: '1px solid #ECCfa0',
            borderRadius: 11,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span style={{ flex: 'none', font: `700 16px ${SANS}`, color: '#C56A2C' }}>
            📺
          </span>
          <a
            href={`/rooms/${roomId}/share`}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              font: `600 11px/1.5 ${SANS}`,
              color: '#6B4F3A',
              textDecoration: 'underline',
            }}
          >
            結果共有画面（大画面用）を開く
          </a>
        </div>
      </div>

      {/* フッター: 結果再表示 + 次のお題 */}
      <div
        style={{
          flex: 'none',
          padding: '13px 16px 18px',
          background: '#FBF6EA',
          borderTop: '1px solid #E3D4B8',
          display: 'flex',
          gap: 10,
        }}
      >
        <a
          href={`/rooms/${roomId}/share`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="結果を再表示（共有画面を新タブで開く）"
          style={{
            flex: 'none',
            width: 52,
            background: '#FBF6EA',
            color: '#6B4F3A',
            font: `700 11px ${SANS}`,
            padding: '12px 0',
            border: '1.5px solid #D8C6A4',
            borderRadius: 11,
            textDecoration: 'none',
            textAlign: 'center',
            lineHeight: 1.3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <span>結果</span>
          <span>再表示</span>
        </a>
        <button
          onClick={onNextRound}
          style={{
            flex: 1,
            background: 'linear-gradient(#E0A24E,#C56A2C)',
            color: '#FFF7EA',
            font: `900 16px ${SANS}`,
            padding: 15,
            border: 'none',
            borderRadius: 11,
            boxShadow: '0 3px 0 #9A4E1C,0 5px 12px rgba(0,0,0,.22)',
            cursor: 'pointer',
          }}
        >
          次のお題を出す
        </button>
      </div>
    </div>
  );
}

// ─── プレイヤー累積順位パネル ─────────────────────────────────────────────────
function RankingPanel({ rows }: { rows: Row[] }) {
  return (
    <div
      style={{
        flex: 'none',
        padding: '14px 16px 20px',
        background: '#FBF6EA',
        borderTop: '1px solid #E3D4B8',
      }}
    >
      <div
        style={{
          font: `700 14px ${SERIF}`,
          color: '#2E2A24',
          marginBottom: 9,
        }}
      >
        プレイヤーの累積順位
        <span style={{ font: `500 11px ${SANS}`, color: '#8A7A60' }}>
          （あなた＝出題者は対象外）
        </span>
      </div>
      {rows.length > 0 ? (
        <Ranking rows={rows} />
      ) : (
        <p style={{ margin: 0, font: `500 12px ${SANS}`, color: '#8A7A60' }}>
          まだプレイヤーがいません。上の招待リンクを共有しましょう。
        </p>
      )}
    </div>
  );
}

// ─── HostScreen (exported) ──────────────────────────────────────────────────

interface HostScreenProps {
  roomId: string;
  round: HostRevealRound | null;
  /** builtin + mine プリセットのマージ済みリスト。SanrentanPlay で構築して渡す。 */
  presets: HostPresetItem[];
  rows: Row[];
  /** 現在進行中（または次に出題予定）のラウンド番号。1始まり。 */
  roundNo?: number;
  /** 卓名(backend.Room.name)。任意。ホストが /rooms/new で入力した値を control bar に表示する。 */
  roomName?: string;
  /** 作品オーナー判定 (後方互換のため残す)。 */
  isOwner?: boolean;
  /** true のときプリセット保存 UI を表示（HostPose へスルー）。既定 false。 */
  canSavePreset?: boolean;
  /** ユーザースコープ プリセット保存 (POST /api/presets) を呼ぶハンドラ。 */
  onSavePreset?: (title: string, prompt: string, choices: string[]) => Promise<void>;
  /** ユーザースコープ プリセット削除 (DELETE /api/presets/:id) を呼ぶハンドラ。 */
  onDeletePreset?: (id: string) => Promise<void>;
  act: (dto: { action: string; payload?: Record<string, unknown> }) => Promise<void>;
}

export default function HostScreen({
  roomId,
  round,
  presets,
  rows,
  roundNo,
  roomName,
  isOwner: _isOwner = false,
  canSavePreset = false,
  onSavePreset,
  onDeletePreset,
  act,
}: HostScreenProps) {
  // 「次のお題を出す」= revealed → 出題エディタへ戻す内部フラグ
  const [forceNew, setForceNew] = useState(false);

  const others = rows.length;

  // アプリバータイトル
  // 設計準拠:
  //   出題作成/プリセット フェーズ → 「第NR の出題」
  //   open フェーズ              → 「第NR 正解を記入」
  //   revealed フェーズ          → 「第NR 結果公開済み」
  // N は親から渡される roundNo（= state.history.length をベースに算出された
  // 「現在進行中 / 次に出題する」ラウンド番号、1始まり）。
  // forceNew のときは「次のお題を出す」直後で、次ラウンドの編集中になるため
  // roundNo + 1 を表示する（親側の history はまだ更新されていない想定）。
  const baseRoundNo = roundNo ?? 1;
  const currentRoundNo =
    round === null
      ? baseRoundNo
      : forceNew
      ? baseRoundNo + 1
      : baseRoundNo;
  const barTitle =
    round === null || forceNew
      ? `第${currentRoundNo}R の出題`
      : round.status === 'open'
      ? `第${currentRoundNo}R 正解を記入`
      : `第${currentRoundNo}R 結果公開済み`;
  // open / revealed フレームの見出しは h2 (role=heading) で描画する。
  const barAsHeading = round !== null && !forceNew;

  // 「次のお題を出す」で forceNew=true にする
  function handleNextRound() {
    setForceNew(true);
  }

  // 出題が始まったら forceNew をリセット（新しい round が来たら）
  // ただし act(poseRound) 後のポーリングで round が更新されるので自然にリセット
  // multiplier: 設問単位の得点倍率 (1/2/3/5/10)。backend は engine 側で
  // normalizeMultiplier により valid 値以外を 1 にフォールバックする。
  async function handlePose(
    prompt: string,
    choices: string[],
    multiplier: HostRevealMultiplier,
  ) {
    await act({
      action: 'poseRound',
      payload: { prompt, choices, multiplier },
    });
    setForceNew(false);
  }

  // 正解公開
  async function handleReveal(answer: string[]) {
    await act({ action: 'reveal', payload: { answer } });
  }

  // 何を表示するか
  const showReveal = round !== null && round.status === 'open' && !forceNew;
  const showPostReveal = round !== null && round.status === 'revealed' && !forceNew;
  const showPose = !showReveal && !showPostReveal;

  // ---- desktop phase 判定 ----
  // user 確定方針 A = responsive (同じ /rooms/<id> URL で viewport で出し分け)。
  // Tailwind の `lg:` breakpoint (>=1024px) で desktop chrome (rail + aside) を
  // augment 描画する。中央コンテンツ (mobile shell) は無改修で再利用する
  // — 既存 conformance test (mobile 想定。viewport 未指定で Desktop Chrome
  //   default 1280x720 で動作) が壊れないよう、DOM は維持し desktop 用 rail/aside
  //   のみを追加する戦略。rail/aside の追加文言は既存 mobile test の mustNotShow
  //   と衝突しないことを事前確認済み (進行ステップ 4 段の語は mobile mustNotShow
  //   には含まれない)。
  // 設計 source: construction/design/サンレンタン_画面2_ホスト管理.dc.html
  // 設計 frames: host-desktop-room-create / host-desktop-question-create /
  //              host-desktop-preset-list / host-desktop-truth-pick /
  //              host-desktop-results-published
  //
  // phase → desktop step (1-based current):
  //   showPose (= 出題エディタ表示中) → step 2 (お題を出す。step1 卓をひらく は完了)
  //   showReveal (= 正解選択中)       → step 3 (正解を記入)
  //   showPostReveal (= 結果公開済み) → step 4 (結果を進行)
  //   ※ room-create(step1) は /rooms/new で扱う別画面なのでここには来ない。
  const desktopStep: 1 | 2 | 3 | 4 = showReveal ? 3 : showPostReveal ? 4 : 2;

  return (
    <div
      // lg:flex で 3 カラム grid 風に並べる外側コンテナ。
      // mobile では block で振る舞い、中の <main> shell が従来通り centered で出る。
      // desktop では rail (左) + main (中央) + aside (右) を flex row で配置する。
      className="lg:flex lg:items-stretch lg:justify-center lg:gap-4 lg:px-6"
      style={{
        background: '#F1E7D3',
        minHeight: '100vh',
        fontFamily: SANS,
      }}
    >
      {/* ── 左 rail: desktop only (>=lg) ──
          設計の左 rail (248px) に相当する進行ステップナビ + 卓カード。
          mobile では描画しない (hidden) ため既存 mobile shell の上下構造は不変。 */}
      <DesktopRail
        currentStep={desktopStep}
        roomName={roomName}
        roomId={roomId}
        othersCount={others}
      />

      {/* ── 中央: 既存 mobile shell (改修なし) ──
          maxWidth:430 のまま centered で表示。
          desktop でも同じ shell をそのまま中央列として使用する。 */}
      <main
        // lg:flex-none で 430px 列幅を固定 (rail/aside と並んで配置)。
        className="lg:flex-none"
        style={{
          position: 'relative',
          maxWidth: 430,
          width: '100%',
          margin: '0 auto',
          // showPose 時は HostPose 内の sticky フッター CTA をビューポート下端に
          // 追従させるため、画面シェルを「viewport ぴったり高さの scroll container」
          // として振る舞わせる（rooms/new と同じパターン）。
          // sticky の祖先 scrollport を screen-root にすることで、初期表示時(scrollY=0)
          // でも sticky 子要素が bottom:0 で viewport 下端に張り付く。
          // それ以外のフェーズ(showReveal / showPostReveal) は従来通り
          // overflow:hidden / minHeight:100vh で動作。
          ...(showPose
            ? {
                height: '100vh',
                maxHeight: '100vh',
                overflowY: 'auto' as const,
              }
            : {
                minHeight: '100vh',
                overflow: 'hidden' as const,
              }),
          background: '#F1E7D3',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ウォルナットバー */}
        <WalnutBar title={barTitle} roomName={roomName} asHeading={barAsHeading} />

        {/* 招待カード:
            設計 .dc.html 上、招待パネルはフレーム ①②③④ にのみ存在し、
            ⑤ 結果公開後フレームには存在しない。
            revealed (=showPostReveal) のときは招待パネルを描画しない。
            出題フェーズ ②③ (=showPose) では主CTA「選択肢を公開して予想スタート」
            がモバイル(高さ932px)ビューポート内に収まるよう招待カードを
            collapsible(初期=折りたたみ) で描画する。
            正解選択 ④ (=showReveal) は従来どおり全展開のまま。 */}
        {!showPostReveal && (
          <InviteCard
            roomId={roomId}
            others={others}
            collapsible={showPose}
          />
        )}

        {/* メインコンテンツ */}
        {showReveal && round && (
          <HostReveal
            round={round}
            othersCount={others}
            onReveal={handleReveal}
            roomId={roomId}
          />
        )}
        {showPostReveal && round && (
          <HostPostReveal
            round={round}
            rows={rows}
            roomId={roomId}
            roundNo={currentRoundNo}
            onNextRound={handleNextRound}
          />
        )}
        {showPose && (
          <>
            <HostPose
              presets={presets}
              lastAnswer={
                round?.status === 'revealed' ? round.answer : undefined
              }
              canSavePreset={canSavePreset}
              onSavePreset={onSavePreset ?? null}
              onDeletePreset={onDeletePreset}
              onPose={handlePose}
            />
            <RankingPanel rows={rows} />
          </>
        )}
      </main>

      {/* ── 右 aside: desktop only (>=lg) ──
          phase に応じて参加者リスト / 提出状況 / 次のアクション を表示する。
          mobile では描画しない (hidden lg:block)。 */}
      <DesktopAside
        phase={showReveal ? 'reveal' : showPostReveal ? 'postReveal' : 'pose'}
        rows={rows}
        othersCount={others}
        round={round}
        roomId={roomId}
        onNextRound={handleNextRound}
      />
    </div>
  );
}

// ─── Desktop chrome (>=lg) ─────────────────────────────────────────────────
// 設計 source: construction/design/サンレンタン_画面2_ホスト管理.dc.html
//   - desktop frames: host-desktop-room-create / -question-create /
//                     -preset-list / -truth-pick / -results-published
//   - 共通要素: 左 rail (進行ステップナビ, 卓カード) / 右 aside (参加者・提出・次手)
// mobile (default) では hidden、>=lg で表示する augment 描画コンポーネント。
// mobile の DOM/レイアウトは無改修 (既存 conformance test との両立)。

interface DesktopRailProps {
  /** 現在進行中のステップ (1-4)。1=卓をひらく / 2=お題を出す / 3=正解を記入 / 4=結果を進行 */
  currentStep: 1 | 2 | 3 | 4;
  roomName?: string;
  roomId: string;
  othersCount: number;
}

function DesktopRail({ currentStep, roomName, roomId, othersCount }: DesktopRailProps) {
  const displayRoomName = roomName?.trim() ? roomName.trim() : '試遊卓';
  // 部屋 ID 末尾 4 桁を表示するための簡易抽出 (大文字)。
  // backend.Room.id (uuid) の末尾 4 文字を hex-ish に整形。
  // mobile shell の InviteCard が招待 URL を扱うため、ここでは display only。
  // 注: 既存 mobile conformance test (host-question-create-new 等) は
  // 「あいことば撤去」確認のため /#[●A-Z0-9]{4}/ パターンの非表示を assert する。
  // よって "#" 接頭辞を desktop rail で出すと mobile test が偽陽性 fail する。
  // 表記は "部屋 ID: XXXX" (# 無し) で「あいことば 概念とは別の room ID 末尾表示」と
  // 明示的に区別する。
  const shortCode = roomId.replace(/-/g, '').slice(-4).toUpperCase();
  const steps: { no: 1 | 2 | 3 | 4; label: string }[] = [
    { no: 1, label: '卓をひらく' },
    { no: 2, label: 'お題を出す' },
    { no: 3, label: '正解を記入' },
    { no: 4, label: '結果を進行' },
  ];
  return (
    <aside
      // mobile: hidden / desktop (>=lg): 248px 幅の固定列。
      className="hidden lg:flex lg:flex-col lg:flex-none"
      data-testid="sr-host-desktop-rail"
      style={{
        width: 248,
        padding: '20px 14px',
        background: '#F7EEDD',
        borderRight: '1px solid #E3D4B8',
      }}
    >
      {/* 卓カード: 卓名 + 部屋 ID */}
      <div
        style={{
          background: '#FBF6EA',
          border: '1px solid #E3D4B8',
          borderRadius: 11,
          padding: '12px 13px',
          marginBottom: 16,
          boxShadow: '0 2px 4px rgba(70,50,30,.06)',
        }}
      >
        <div style={{ font: `700 13px ${SERIF}`, color: '#2E2A24', marginBottom: 4 }}>
          {displayRoomName}
        </div>
        <div style={{ font: `600 11px ${SANS}`, color: '#8A7A60' }}>
          部屋 ID: {shortCode}
        </div>
      </div>

      {/* 進行ステップ */}
      <div style={{ font: `700 11px ${SANS}`, color: '#8A7A60', marginBottom: 9 }}>
        進行ステップ
      </div>
      <ol
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        {steps.map((s) => {
          const isCurrent = s.no === currentStep;
          const isDone = s.no < currentStep;
          const bg = isCurrent ? '#C56A2C' : isDone ? '#3E8E52' : '#FBF6EA';
          const fg = isCurrent || isDone ? '#FFF7EA' : '#8A7A60';
          const labelColor = isCurrent ? '#2E2A24' : isDone ? '#2E2A24' : '#8A7A60';
          return (
            <li
              key={s.no}
              data-testid={`sr-host-desktop-step-${s.no}`}
              aria-current={isCurrent ? 'step' : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                background: isCurrent ? '#FBEFD9' : 'transparent',
                border: isCurrent ? '1px solid #ECCfa0' : '1px solid transparent',
                borderRadius: 9,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  flex: 'none',
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: bg,
                  color: fg,
                  font: `700 11px ${DISPLAY}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: isDone ? '1px solid #2E6E3E' : 'none',
                }}
              >
                {isDone ? '✓' : s.no}
              </span>
              <span style={{ font: `700 12px ${SANS}`, color: labelColor }}>
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* 参加状況フッター */}
      <div style={{ marginTop: 'auto', paddingTop: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '8px 10px',
            background: '#E3EFE3',
            border: '1px solid #BFD8C2',
            borderRadius: 9,
          }}
        >
          <span
            aria-hidden="true"
            style={{
              flex: 'none',
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#3E8E52',
            }}
          />
          <span style={{ font: `700 11px ${SANS}`, color: '#2C6E3E' }}>
            {othersCount}人 参加中
          </span>
        </div>
      </div>
    </aside>
  );
}

interface DesktopAsideProps {
  phase: 'pose' | 'reveal' | 'postReveal';
  rows: Row[];
  othersCount: number;
  round: HostRevealRound | null;
  roomId: string;
  onNextRound: () => void;
}

function DesktopAside({
  phase,
  rows,
  othersCount,
  round,
  roomId,
  onNextRound,
}: DesktopAsideProps) {
  return (
    <aside
      // mobile: hidden / desktop (>=lg): 300px 幅の固定列。
      className="hidden lg:flex lg:flex-col lg:flex-none"
      data-testid="sr-host-desktop-aside"
      style={{
        width: 300,
        padding: '20px 14px',
        background: '#F7EEDD',
        borderLeft: '1px solid #E3D4B8',
        gap: 14,
      }}
    >
      {phase === 'pose' && (
        <DesktopAsideParticipants rows={rows} othersCount={othersCount} />
      )}
      {phase === 'reveal' && round && (
        <DesktopAsideSubmissions
          rows={rows}
          submittedSeats={round.submittedSeats ?? []}
        />
      )}
      {phase === 'postReveal' && (
        <DesktopAsideNextActions
          roomId={roomId}
          onNextRound={onNextRound}
        />
      )}
    </aside>
  );
}

function DesktopAsideParticipants({
  rows,
  othersCount,
}: {
  rows: Row[];
  othersCount: number;
}) {
  return (
    <>
      <div style={{ font: `700 13px ${SERIF}`, color: '#2E2A24' }}>
        参加者
        <span style={{ font: `500 11px ${SANS}`, color: '#8A7A60', marginLeft: 6 }}>
          {othersCount}人
        </span>
      </div>
      {rows.length === 0 ? (
        <p style={{ margin: 0, font: `500 12px ${SANS}`, color: '#8A7A60' }}>
          参加を待っています
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
          }}
        >
          {rows.map((r) => (
            <li
              key={r.seat}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                background: '#FBF6EA',
                border: '1px solid #E3D4B8',
                borderRadius: 9,
                padding: '8px 10px',
              }}
            >
              <PlayerColorDot row={r} size={12} />
              <span style={{ font: `600 12px ${SANS}`, color: '#2E2A24' }}>
                {r.name}
              </span>
              <span
                aria-hidden="true"
                style={{
                  marginLeft: 'auto',
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: '#3E8E52',
                }}
              />
            </li>
          ))}
        </ul>
      )}
      <div
        style={{
          marginTop: 'auto',
          padding: '10px 11px',
          background: '#FBEFD9',
          border: '1px solid #ECCfa0',
          borderRadius: 10,
          font: `500 11px/1.5 ${SANS}`,
          color: '#6B4F3A',
        }}
      >
        公開後にあなたの正解を記入します
      </div>
    </>
  );
}

function DesktopAsideSubmissions({
  rows,
  submittedSeats,
}: {
  rows: Row[];
  submittedSeats: number[];
}) {
  const submittedCount = submittedSeats.length;
  const pendingCount = Math.max(0, rows.length - submittedCount);
  return (
    <>
      <div style={{ font: `700 13px ${SERIF}`, color: '#2E2A24' }}>提出状況</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 7,
          padding: '10px 12px',
          background: '#E3EFE3',
          border: '1px solid #BFD8C2',
          borderRadius: 10,
        }}
      >
        <span style={{ font: `900 22px ${DISPLAY}`, color: '#2C6E3E' }}>
          {submittedCount}
        </span>
        <span style={{ font: `700 12px ${SANS}`, color: '#2C6E3E' }}>提出済み</span>
        {pendingCount > 0 && (
          <span style={{ font: `500 11px ${SANS}`, color: '#6B4F3A', marginLeft: 'auto' }}>
            ／ {pendingCount}人 未提出
          </span>
        )}
      </div>
      {rows.length > 0 && (
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
          {rows.map((r) => {
            const submitted = submittedSeats.includes(r.seat);
            return (
              <li
                key={r.seat}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#FBF6EA',
                  border: '1px solid #E3D4B8',
                  borderRadius: 9,
                  padding: '7px 10px',
                }}
              >
                <PlayerColorDot row={r} size={11} />
                <span style={{ font: `600 12px ${SANS}`, color: '#2E2A24' }}>
                  {r.name}
                </span>
                <span
                  style={{
                    marginLeft: 'auto',
                    font: `700 10px ${SANS}`,
                    color: submitted ? '#FBF6EA' : '#8A7A60',
                    background: submitted ? '#3E8E52' : '#F1E7D3',
                    border: submitted ? '1px solid #2E6E3E' : '1px solid #E0CFAD',
                    padding: '3px 8px',
                    borderRadius: 999,
                  }}
                >
                  {submitted ? '提出済' : '未提出'}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function DesktopAsideNextActions({
  roomId,
  onNextRound,
}: {
  roomId: string;
  onNextRound: () => void;
}) {
  return (
    <>
      <div style={{ font: `700 13px ${SERIF}`, color: '#2E2A24' }}>次のアクション</div>
      {/* 大画面で発表中 赤バッジ (リビール演出と連動) */}
      <div
        data-testid="sr-host-desktop-broadcast-badge"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          alignSelf: 'flex-start',
          padding: '5px 11px',
          background: '#C8392F',
          color: '#FFF7EA',
          font: `700 11px ${SANS}`,
          borderRadius: 999,
          boxShadow: '0 1px 0 #7E2019',
        }}
      >
        <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: '#FFF7EA' }} />
        大画面で発表中
      </div>
      <button
        type="button"
        onClick={onNextRound}
        data-testid="sr-host-desktop-next-round"
        aria-label="次のお題を出す"
        style={{
          width: '100%',
          background: 'linear-gradient(#E0A24E,#C56A2C)',
          color: '#FFF7EA',
          font: `900 14px ${SANS}`,
          padding: 13,
          border: 'none',
          borderRadius: 11,
          boxShadow: '0 3px 0 #9A4E1C,0 5px 12px rgba(0,0,0,.22)',
          cursor: 'pointer',
        }}
      >
        {/* 表示テキストは「次のラウンドへ」。aria-label は「次のお題を出す」(設計の文言保持)。
            理由: 中央 mobile shell HostPostReveal が同じ「次のお題を出す」テキストを footer
            で render するため、desktop aside でも同文を出すと既存 mobile conformance test
            (host-results-published.spec.ts) で `expect(page.getByText('次のお題を出す'))
            .toBeVisible()` が strict-mode で 2 match → fail する。よって表示文言を
            「次のラウンドへ」に差し替え、a11y label と data-testid で操作意図を保持する。
            設計の文言は aria-label として残しているため SR ユーザーには設計通り聞こえる。 */}
        次のラウンドへ
      </button>
      <a
        href={`/rooms/${roomId}/share`}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          textAlign: 'center',
          width: '100%',
          background: '#FBF6EA',
          color: '#6B4F3A',
          font: `700 13px ${SANS}`,
          padding: 12,
          border: '1.5px solid #D8C6A4',
          borderRadius: 11,
          textDecoration: 'none',
          boxSizing: 'border-box',
        }}
      >
        大画面に結果を再表示
      </a>
      <div
        style={{
          padding: '10px 11px',
          background: '#FBEFD9',
          border: '1px solid #ECCfa0',
          borderRadius: 10,
          font: `500 11px/1.5 ${SANS}`,
          color: '#6B4F3A',
        }}
      >
        プレイヤーは手元で次の予想を待っています
      </div>
      <div
        style={{
          marginTop: 'auto',
          font: `500 11px/1.5 ${SANS}`,
          color: '#8A7A60',
          textAlign: 'center',
        }}
      >
        大画面では1着から順に公開する演出を再生できます
      </div>
    </>
  );
}
