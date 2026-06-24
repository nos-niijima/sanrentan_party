// BFF: ユーザースコープ プリセット一覧取得・新規作成。
import { proxyJson } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return proxyJson('/presets');
}

export async function POST(req: Request): Promise<Response> {
  const body = await req.json();
  return proxyJson('/presets', { method: 'POST', body: JSON.stringify(body) });
}
