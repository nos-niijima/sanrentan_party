// BFF: ルーム（プレイセッション）の作成。
import { proxyJson } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  const body = await req.json();
  return proxyJson('/rooms', { method: 'POST', body: JSON.stringify(body) });
}
