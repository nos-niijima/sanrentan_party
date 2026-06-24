'use client';

import useSWR from 'swr';
import { INTERNAL_API, ApiError, fetcher } from '@/lib/api';
import type { UserPreset, CreatePresetInput } from '@sanrentan-party/shared';

/**
 * ログインユーザーのプリセット一覧を SWR で購読するフック。
 * - 作成: POST /api/presets → mutate()
 * - 削除: DELETE /api/presets/:id → mutate()
 * - HTTP エラーは ApiError(message, status) で投げる（呼び出し側で分岐可能）。
 */
export function useMyPresets() {
  const key = `${INTERNAL_API}/presets`;
  const { data, error, isLoading, mutate } = useSWR<UserPreset[]>(key, fetcher, {
    // 404 / 401 はリトライしても通らないので止める。
    shouldRetryOnError: (err) => {
      if (err instanceof ApiError) {
        return err.status !== 404 && err.status !== 401 && err.status !== 403;
      }
      return true;
    },
  });

  /** プリセットを新規作成して一覧を再検証する。 */
  async function createPreset(input: CreatePresetInput): Promise<UserPreset> {
    const res = await fetch(`${INTERNAL_API}/presets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'プリセット保存に失敗しました' }));
      throw new ApiError(err.message || 'プリセット保存に失敗しました', res.status);
    }
    const created: UserPreset = await res.json();
    await mutate();
    return created;
  }

  /** プリセットを削除して一覧を再検証する。 */
  async function deletePreset(id: string): Promise<void> {
    const res = await fetch(`${INTERNAL_API}/presets/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: 'プリセット削除に失敗しました' }));
      throw new ApiError(err.message || 'プリセット削除に失敗しました', res.status);
    }
    await mutate();
  }

  return {
    presets: data ?? [],
    loading: isLoading,
    error: error as ApiError | Error | undefined,
    createPreset,
    deletePreset,
  };
}
