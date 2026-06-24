// クライアント（ブラウザ）から叩くのは同一オリジンの内部 BFF ルートのみ。
// 身元(x-user-*)は BFF がサーバ側で付与するため、クライアントはヘッダを付けない。
export const INTERNAL_API = '/api';

/**
 * BFF 由来の HTTP エラー。`status` フィールドで 404 / 401 等の分岐が可能。
 * 既存呼び出し側は `Error` として扱えるため後方互換。
 */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** SWR 用の汎用 fetcher。失敗時は ApiError (message + status) で throw。 */
export async function fetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Network error' }));
    throw new ApiError(err.message || 'Failed to fetch', res.status);
  }
  return res.json();
}
