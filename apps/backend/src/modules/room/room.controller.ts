import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RoomService } from './room.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireUserGuard } from '../../common/guards/require-user.guard';
import type { User } from '../../generated/prisma/client';
import type { CreateRoomDto, JoinRoomDto, RoomActionDto } from '@sanrentan-party/shared';

/**
 * CreateRoomDto の手動 validation。
 * CLAUDE.md 規約: `@Body()` には共有 interface を直接使い、class-validator は導入しない。
 * 代わりに controller で手動 guard し、不正 body は 400 で弾く（壊れた Room の量産防止）。
 *
 * name の方針:
 * - undefined はそのまま許容 (Room.name は optional)
 * - string でない値 (number, object, array, null) は 400
 * - trim 後が空文字なら undefined に正規化 (空文字は意味なし)
 * - 40 文字 (trim 前) を超えたら 400
 *   ※ 共有画面の表示崩れ防止。frontend UI も maxLength=40 で揃えている。
 *
 * サンレンタン Party では gameId は持たない (単一ゲーム前提)。frontend からの body も無視する。
 */
const ROOM_NAME_MAX_LENGTH = 40;

function validateCreateRoomDto(body: unknown): CreateRoomDto {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('request body must be a JSON object');
  }
  const b = body as Record<string, unknown>;

  let name: string | undefined;
  if (typeof b.name !== 'undefined') {
    if (typeof b.name !== 'string') {
      throw new BadRequestException('name must be string when provided');
    }
    if (b.name.length > ROOM_NAME_MAX_LENGTH) {
      throw new BadRequestException(
        `name must be ${ROOM_NAME_MAX_LENGTH} characters or less`,
      );
    }
    const trimmed = b.name.trim();
    // 空文字 / 空白だけは undefined 扱い（DB に保存しない）にして「無名ルーム」と等価に倒す。
    name = trimmed === '' ? undefined : b.name;
  }

  let isPublic: boolean | undefined;
  if (typeof b.isPublic !== 'undefined') {
    if (typeof b.isPublic !== 'boolean') {
      throw new BadRequestException('isPublic must be boolean when provided');
    }
    isPublic = b.isPublic;
  }

  return { name, isPublic };
}

@ApiTags('rooms')
@Controller('rooms')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  @Post()
  @UseGuards(RequireUserGuard)
  @ApiOperation({ summary: 'ルームを作成する' })
  @ApiResponse({ status: 201, description: 'ルームを作成しました' })
  @ApiResponse({ status: 400, description: '不正な body（name 形式/長さ違反など）' })
  async create(@CurrentUser() user: User, @Body() body: unknown) {
    const dto = validateCreateRoomDto(body);
    return this.roomService.create(user.id, {
      name: dto.name,
      isPublic: dto.isPublic,
    });
  }

  @Post(':id/join')
  @UseGuards(RequireUserGuard)
  @ApiOperation({ summary: '席に着く（希望席 or 空き席）' })
  @ApiResponse({ status: 201, description: '着席しました' })
  @ApiResponse({ status: 409, description: 'Seat already taken' })
  async join(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: JoinRoomDto,
  ) {
    return this.roomService.join(id, user.id, dto.seat, dto.color, user.name ?? undefined);
  }

  // ---- 公開（未認証可。プレイヤーと観戦者の双方がポーリングする）----

  @Get(':id')
  @ApiOperation({ summary: 'ルームビューを取得（自分視点に秘匿化済み）' })
  @ApiResponse({ status: 200, description: 'ルームビュー' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  async getView(@CurrentUser() user: User | undefined, @Param('id') id: string) {
    return this.roomService.getView(id, user?.id);
  }

  @Post(':id/actions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RequireUserGuard)
  @ApiOperation({ summary: 'アクションを適用する（着席プレイヤーのみ）' })
  @ApiResponse({ status: 200, description: '適用後のルームビュー' })
  @ApiResponse({ status: 403, description: 'Not a player in this room' })
  async act(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: RoomActionDto,
  ) {
    return this.roomService.act(id, user.id, dto);
  }
}
