import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { UserService } from '../../modules/user/user.service';
import { HEADERS } from '@sanrentan-party/shared';

/**
 * x-user-* ヘッダ（BFF がサーバ側で付与）から身元を解決し req.user に載せる。
 *
 * - ヘッダが無い公開リクエストは素通り（req.user は undefined）。
 * - 解決に失敗しても 500 にせず素通り（保護が必要なら RequireUserGuard が 401 を返す）。
 *
 * 注意: この身元境界は BFF がサーバ側で付与した x-user-* を信頼する前提。
 * backend は信頼できるフロントオリジンからのみ到達可能であること（CORS + ネットワーク）。
 */
@Injectable()
export class UserContextMiddleware implements NestMiddleware {
  constructor(private readonly users: UserService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    // BFF は非 ASCII を含む身元を URL エンコードして渡す。ここで decode する。
    const dec = (v: string | string[] | undefined): string | undefined => {
      if (typeof v !== 'string') return undefined;
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    };
    const email = dec(req.headers[HEADERS.userEmail]);
    if (email) {
      const googleId = dec(req.headers[HEADERS.userId]);
      const name = dec(req.headers[HEADERS.userName]);
      try {
        (req as Request & { user?: unknown }).user =
          await this.users.getOrCreateUserByIdentity({ email, googleId, name });
      } catch {
        // 身元解決失敗時は未認証として扱う。
      }
    }
    next();
  }
}
