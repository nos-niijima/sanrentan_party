'use client';

import useSWR from 'swr';
import { INTERNAL_API, ApiError, fetcher } from '@/lib/api';
import type { RoomView, RoomActionDto } from '@sanrentan-party/shared';

/**
 * 対戦中ルームの自分視点ビューを SWR でポーリング購読するフック。
 *
 * - 取得は同一オリジンの BFF (`/api/rooms/:id`) のみ（身元はサーバ側で付与）。
 * - refreshInterval 2500ms で対戦中の進行を追従する。
 *   SWR の dedupingInterval 既定値は 2000ms なので 2500ms なら抑制されない。
 * - act/join は POST 後に mutate() して即座に再検証する。
 */
export function useRoom(id: string | undefined | null) {
  const key = id ? `${INTERNAL_API}/rooms/${id}` : null;
  const { data, error, isLoading, mutate } = useSWR<RoomView>(key, fetcher, {
    refreshInterval: 2500,
    // 404 / 401 はリトライしても通らないので止める（無限「読み込み中…」の防止）。
    shouldRetryOnError: (err) => {
      if (err instanceof ApiError) {
        return err.status !== 404 && err.status !== 401 && err.status !== 403;
      }
      return true;
    },
  });

  /** アクションを適用して新 state を取り込む。 */
  async function act(dto: RoomActionDto): Promise<void> {
    if (!id) throw new Error('ルームが特定できません');
    const res = await fetch(`${INTERNAL_API}/rooms/${id}/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'アクションに失敗しました' }));
      throw new Error(err.message || 'アクションに失敗しました');
    }
    await mutate();
  }

  /**
   * 空き席（または希望席）に着席する。駒色（hex 等）も任意で添えられる。
   *
   * `name` は cookie identity 用の表示名として BFF (server-api) が x-user-name
   * ヘッダに昇格し、UserService.upsert() で users.name に反映する（任意）。
   * backend の JoinRoomDto は `name` フィールドを宣言していないが、NestJS の
   * @Body() は plain object のため余剰フィールドは無視され harmless。
   */
  async function join(opts?: { seat?: number; color?: string; name?: string }): Promise<void> {
    if (!id) throw new Error('ルームが特定できません');
    const body: { seat?: number; color?: string; name?: string } = {};
    if (opts?.seat !== undefined) body.seat = opts.seat;
    if (opts?.color !== undefined) body.color = opts.color;
    if (opts?.name !== undefined) body.name = opts.name;
    const res = await fetch(`${INTERNAL_API}/rooms/${id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // status code を保持した ApiError で投げる。呼び出し側 (JoinScreen) で
      // 409 (DUPLICATE_NAME) など status に応じた専用 alert を出すために使う。
      const err = await res.json().catch(() => ({ message: '参加に失敗しました' }));
      throw new ApiError(err.message || '参加に失敗しました', res.status);
    }
    await mutate();
  }

  return {
    view: data,
    loading: isLoading,
    error: error as Error | ApiError | undefined,
    act,
    join,
    refresh: () => mutate(),
  };
}
