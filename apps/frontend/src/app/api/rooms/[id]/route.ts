// BFF: ルームの自分視点ビュー取得（ポーリング対象）。
import { proxyJson } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  return proxyJson('/rooms/' + id);
}
