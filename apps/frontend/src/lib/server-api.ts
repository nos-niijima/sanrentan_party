import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';
import { HEADERS } from '@sanrentan-party/shared';

/**
 * BFF: Next.js の Route Handler (サーバ) から backend を叩く唯一の経路。
 *
 * セキュリティ要点: 身元（x-user-*）はクライアントからは受け取らず、ここで
 * HttpOnly cookie `pb_uid` を identity の単一ソースとして発行・付与する。
 * 無ければ crypto.randomUUID() で新規発行して Set-Cookie で返す。
 *
 * これによりクライアントは身元を偽装できない（cookie は HttpOnly で JS から触れない）。
 */
const BACKEND_API_URL = process.env.BACKEND_API_URL || 'http://localhost:3001/api';
const COOKIE_NAME = 'pb_uid';
const COOKIE_MAX_AGE_SEC = 365 * 24 * 3600;

/**
 * POST/PUT body から user 表示名 (x-user-name) 候補を抽出。
 *
 * **重要**: endpoint によって body.name の意味が異なる:
 *   - `POST /rooms` の body.name は「卓名 (Room.name)」であり、**ユーザー表示名ではない**。
 *     ここで `name` を user.name に流すと、卓名でホストの user.name を上書きしてしまい、
 *     「audit卓 が出題」「audit卓の試遊卓」のように UX が壊れる。
 *     → このエンドポイントでは body から user 名を取らない。
 *   - `POST /rooms/:id/join` の body.name は「プレイヤー表示名」。x-user-name に乗せる。
 *   - その他 (将来用) は `name` / `playerName` を user 表示名候補として拾う。
 *
 * RequestInit.body が string (proxyJson は常に JSON.stringify した string を渡す) の場合のみ peek。
 */
function isRoomCreatePath(path: string): boolean {
  // /rooms (POST 経路) 完全一致。クエリは想定しないが、? 以降は無視する。
  const base = path.split('?')[0];
  return base === '/rooms';
}

function isRoomJoinPath(path: string): boolean {
  // /rooms/<id>/join (POST 経路)。id は uuid 形式だが厳密判定不要、末尾 /join で判別。
  const base = path.split('?')[0];
  return /^\/rooms\/[^/]+\/join$/.test(base);
}

function extractNameFromBody(
  path: string,
  method: string,
  body: BodyInit | null | undefined,
): string | undefined {
  if (typeof body !== 'string' || body.length === 0) return undefined;
  const upperMethod = method.toUpperCase();
  if (upperMethod !== 'POST' && upperMethod !== 'PUT' && upperMethod !== 'PATCH') {
    return undefined;
  }
  // 卓作成 POST /rooms: body.name は **卓名** 。user.name を上書きしてはならない。
  if (upperMethod === 'POST' && isRoomCreatePath(path)) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      // join 経路は body.name = プレイヤー名。
      // それ以外の経路では name / playerName を user 表示名候補として拾う。
      const candidate =
        upperMethod === 'POST' && isRoomJoinPath(path)
          ? obj.name
          : (obj.name ?? obj.playerName);
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
  } catch {
    // not JSON — ignore
  }
  return undefined;
}

export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  // HttpOnly cookie `pb_uid` を identity の単一ソースに。
  // Next 15 の cookies() は async。read と (未発行なら) write を両方行う。
  const jar = await cookies();
  let token = jar.get(COOKIE_NAME)?.value;
  if (!token) {
    token = randomUUID();
    // Route Handler 内では cookies().set(...) が Set-Cookie を Response に乗せる。
    jar.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: COOKIE_MAX_AGE_SEC,
    });
  }

  // backend の UserService は email + googleId 両方を要求する。
  // anonymous identity を一意キーとして synthesize する。
  const anonEmail = `anon-${token}@local`;
  headers.set(HEADERS.userId, encodeURIComponent(token));
  headers.set(HEADERS.userEmail, encodeURIComponent(anonEmail));

  // POST body から user 表示名を拾えれば反映 (入場時の表示名 etc.)。
  // **卓作成** (POST /rooms) の body.name は卓名なので user.name には流さない。
  const nameFromBody = extractNameFromBody(path, init.method ?? 'GET', init.body);
  if (nameFromBody) {
    headers.set(HEADERS.userName, encodeURIComponent(nameFromBody));
  }

  return fetch(`${BACKEND_API_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
}

/**
 * backend のレスポンスをそのまま中継する Route Handler 向けヘルパ。
 * 使い方: `export const GET = () => proxyJson('/rooms/foo')`
 */
export async function proxyJson(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await backendFetch(path, init);
  const body = await res.text();
  return new Response(body || null, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' },
  });
}
