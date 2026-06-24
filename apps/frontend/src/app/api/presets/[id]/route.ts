// BFF: ユーザースコープ プリセット削除。
import { proxyJson } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  return proxyJson('/presets/' + id, { method: 'DELETE' });
}
