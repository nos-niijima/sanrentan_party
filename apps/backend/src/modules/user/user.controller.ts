import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireUserGuard } from '../../common/guards/require-user.guard';
import type { User } from '../../generated/prisma/client';

/**
 * 自身の身元情報を返す最小エンドポイント。
 * UserContextMiddleware が解決済みの req.user をそのまま整形して返す。
 * 用途: フロントの表示名 (ダッシュボード等) を BFF 経由で取得するため。
 *
 * 認証必須 (RequireUserGuard) — x-user-* ヘッダから身元が解決できなければ 401。
 * cookie identity でも BFF が必ず x-user-* を付与するため通常 401 にはならない。
 */
@ApiTags('users')
@Controller('users')
export class UserController {
  @Get('me')
  @UseGuards(RequireUserGuard)
  @ApiOperation({ summary: '自身のユーザー情報' })
  @ApiResponse({ status: 200, description: 'ユーザー情報' })
  me(@CurrentUser() user: User) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
    };
  }
}
