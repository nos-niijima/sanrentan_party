'use client';

// /join/<id> — 招待リンクの landing page。
//
// 意味的分離 (2026-06-24):
//   - /rooms/<id> : ホストまたは着席プレイヤー専用ビュー（room 操作画面）
//   - /join/<id>  : 招待リンクの landing。未着席向けの入室フォーム専用
//
// この分離により「招待リンクをコピー」UI が嘘でなくなる。
//
// 動作:
//   - useRoom フックで view を取得 (既存と同じ /api/rooms/:id GET)。
//   - view ない (loading) → 「読み込み中…」簡素表示
//   - error 404 → RoomLoadErrorScreen (招待リンクが無効)
//   - view.you あり (既着席) → router.replace('/rooms/<id>') へ流す
//   - view.you なし (未着席) → JoinScreen を render
//   - ?j=1&c=<hex> が付いていれば auto-join し、成功後 /rooms/<id> へ push
//
// ロール判定 / ゲーム seam:
//   サンレンタン専用の JoinScreen を直接 render する（registry 経由ではない）。
//   理由: 招待 landing は未着席の player UI 専用であり、SanrentanPlay の
//   分岐ロジックをここで再現する必要は無い。pattern が他 GameSpec の場合は
//   現状 fallback として「読み込み中…」のままにし、将来 registry に
//   joinUI seam が追加されたら差し替える。

import Link from 'next/link';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { HostRevealState } from '@sanrentan-party/shared';
import { useRoom } from '@/hooks/useRoom';
import { ApiError } from '@/lib/api';
import JoinScreen from '@/components/games/sanrentan/screens/JoinScreen';

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

/**
 * 卓ロード失敗時のエラー画面。
 * /rooms/[id] の同名コンポーネントと同一意匠（同じパターン）。
 */
function RoomLoadErrorScreen({ error }: { error: Error | ApiError }) {
  const status = error instanceof ApiError ? error.status : undefined;
  const isNotFound = status === 404;
  const title = isNotFound ? 'この卓は存在しません' : '卓を読み込めませんでした';
  const detail = isNotFound
    ? '招待リンクが無効か、卓が削除された可能性があります。'
    : `通信エラーが発生しました。時間をおいて再度お試しください。${
        error.message ? `\n(${error.message})` : ''
      }`;
  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '24px',
        textAlign: 'center',
        color: '#3a2a1a',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 12 }}>{title}</div>
      <div style={{ fontSize: 14, whiteSpace: 'pre-wrap', marginBottom: 24, color: '#6B4F3A' }}>
        {detail}
      </div>
      <Link
        href="/"
        style={{
          display: 'inline-block',
          padding: '10px 20px',
          background: '#6B4F3A',
          color: '#fff',
          borderRadius: 6,
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        /browse に戻る
      </Link>
    </div>
  );
}

export default function JoinLandingPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const { view, loading, error, join } = useRoom(id);

  // 既に着席済みなら /rooms/<id> へ流す（host が自分の /join/<id> を開いた場合等）。
  // replace を使い、ブラウザ履歴に landing を残さない。
  // ただし silent な即 replace だと「テストしたいだけのホスト」が状況を理解できないため、
  // 500ms だけ通知バナーを表示してから replace する（下の render で表示）。
  useEffect(() => {
    if (!id) return;
    if (view?.you) {
      const t = setTimeout(() => {
        router.replace(`/rooms/${id}`);
      }, 500);
      return () => clearTimeout(t);
    }
  }, [view?.you, id, router]);

  // 2026-06-24: signIn (NextAuth) を撤去したため、callbackUrl 経由の ?j=1 auto-join は廃止。
  // JoinScreen の form submit で直接 POST /join { name, color } を発火する。

  // 駒色 + 名前を直接 join し、成功後 room へ push する handler。
  // JoinScreen が呼ぶ join() をラップして redirect を追加する。
  async function joinAndGo(opts?: { seat?: number; color?: string; name?: string }): Promise<void> {
    if (!id) throw new Error('ルームが特定できません');
    await join(opts);
    router.push(`/rooms/${id}`);
  }

  const showError = !view && !!error;

  // view から JoinScreen に渡す props を組み立てる。
  // SanrentanPlay 内の !me 分岐と同一のロジック。
  const state = (view?.room?.state as unknown as HostRevealState | undefined);
  const hostSeat = state?.hostSeat ?? 0;
  const hostName = view?.players.find((p) => p.seat === hostSeat)?.name ?? 'ホスト';
  const playerCount = view ? view.players.filter((p) => p.seat !== hostSeat).length : 0;
  const round = state?.round ?? null;
  const historyLen = state?.history?.length ?? 0;

  return (
    <div style={{ minHeight: '100vh', background: '#e7e5df', fontFamily: "'Noto Sans JP',sans-serif" }}>
      <GoogleFonts />
      {showError ? (
        <RoomLoadErrorScreen error={error as Error | ApiError} />
      ) : loading || !view ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#6B4F3A' }}>
          読み込み中…
        </div>
      ) : view.you ? (
        // useEffect で 500ms 後に /rooms/<id> へ replace。
        // 「テストしたいだけのホスト」が状況を理解できるよう、短時間だけ説明メッセージを表示する。
        <div
          role="status"
          aria-live="polite"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            padding: '24px',
            color: '#3a2a1a',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              background: '#fff',
              border: '1px solid #d4cfc4',
              borderRadius: 8,
              padding: '16px 24px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              maxWidth: 420,
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
              あなたは既にこの卓に着席しています
            </div>
            <div style={{ fontSize: 13, color: '#6B4F3A' }}>
              ルームへ移動します…
            </div>
          </div>
        </div>
      ) : (
        <JoinScreen
          hostName={hostName}
          playerCount={playerCount}
          join={joinAndGo}
          roomCode={view.room.id}
          round={round}
          historyLen={historyLen}
          roomName={view.room.name}
          initialColor={undefined}
          players={view.players}
          hostSeat={hostSeat}
        />
      )}
    </div>
  );
}
