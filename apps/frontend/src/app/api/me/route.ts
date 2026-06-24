// BFF: 自身のユーザー情報 (id / name / email / tokenBalance) を取得する。
// 表示名（ダッシュボード等）に使う。身元は server-api が x-user-* で付与する。
import { proxyJson } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return proxyJson('/users/me');
}
