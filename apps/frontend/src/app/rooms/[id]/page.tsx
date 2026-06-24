'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { GameState } from '@sanrentan-party/shared';
import { useRoom } from '@/hooks/useRoom';
import { ApiError } from '@/lib/api';
import { resolveGameUI } from '@/lib/games/registry';

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
 * - 404: 卓が存在しない / 招待リンクが無効 → 文言A
 * - その他 (401/403/500/network): 一時的なエラー → 文言B
 * いずれも /browse へ戻る link を提示し、無限「読み込み中…」を止める。
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

export default function RoomPlayPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { view, loading, error, act, join } = useRoom(id);

  const pattern = (view?.room?.state as (GameState & { pattern?: string }) | undefined)?.pattern;
  const Game = resolveGameUI(view?.ui ?? pattern);

  // view を取得できないまま error が出た時はエラー画面（無限ローディング防止）。
  // view が既にある場合は描画を維持し、ポーリング失敗は Game 側 error prop に任せる。
  const showError = !view && !!error;

  return (
    <div style={{ minHeight: '100vh', background: '#e7e5df', fontFamily: "'Noto Sans JP',sans-serif" }}>
      <GoogleFonts />
      {showError ? (
        <RoomLoadErrorScreen error={error as Error | ApiError} />
      ) : loading || !view ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#6B4F3A' }}>
          読み込み中…
        </div>
      ) : (
        <Game view={view} act={act} join={join} error={error} />
      )}
    </div>
  );
}
