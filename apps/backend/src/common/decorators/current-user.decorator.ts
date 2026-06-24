import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { User } from '../../generated/prisma/client';

/**
 * リクエストに解決済みの身元を注入する。
 * UserContextMiddleware が x-user-* ヘッダから req.user を解決済みであることを前提とする。
 * 認証必須ルートでは RequireUserGuard と併用すること（未認証なら req.user は undefined）。
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
