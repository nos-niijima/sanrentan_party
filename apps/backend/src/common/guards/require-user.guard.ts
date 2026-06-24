import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

/**
 * req.user（UserContextMiddleware が x-user-* から解決）が無ければ 401。
 * 認証必須のエンドポイントに @UseGuards(RequireUserGuard) で付与する。
 */
@Injectable()
export class RequireUserGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const request = ctx.switchToHttp().getRequest();
    if (!request.user) {
      throw new UnauthorizedException('Authentication required');
    }
    return true;
  }
}
