// BFF: ルーム内アクションの適用（サーバ権威で新 state を返す）。
import { proxyJson } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const body = await req.json();
  return proxyJson('/rooms/' + id + '/actions', { method: 'POST', body: JSON.stringify(body) });
}
