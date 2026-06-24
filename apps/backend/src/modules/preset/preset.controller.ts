import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PresetService } from './preset.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireUserGuard } from '../../common/guards/require-user.guard';
import type { User } from '../../generated/prisma/client';
import type { CreatePresetInput } from '@sanrentan-party/shared';

/**
 * CreatePresetInput の手動バリデーション。
 * CLAUDE.md 規約: `@Body()` には共有 interface を直接使い、class-validator は導入しない。
 * 不正 body は 400 で弾く。
 *
 * バリデーションルール:
 * - title: string, trim 後 1 文字以上, 80 文字以内
 * - question: string, trim 後 1 文字以上, 200 文字以内
 * - choices: array, 要素数 3〜6, 各要素 string かつ trim 後 1 文字以上, 60 文字以内
 * 保存前に trim した値を service に渡す。
 */
const PRESET_TITLE_MAX_LENGTH = 80;
const PRESET_QUESTION_MAX_LENGTH = 200;
const PRESET_CHOICES_MIN = 3;
const PRESET_CHOICES_MAX = 6;
const PRESET_CHOICE_MAX_LENGTH = 60;

function validateCreatePresetInput(body: unknown): CreatePresetInput {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('リクエストボディは JSON オブジェクトでなければなりません');
  }
  const b = body as Record<string, unknown>;

  // ---- title ----
  if (typeof b.title !== 'string') {
    throw new BadRequestException('title は文字列で指定してください');
  }
  const title = b.title.trim();
  if (title.length === 0) {
    throw new BadRequestException('title は空文字にできません');
  }
  if (title.length > PRESET_TITLE_MAX_LENGTH) {
    throw new BadRequestException(
      `title は ${PRESET_TITLE_MAX_LENGTH} 文字以内で指定してください`,
    );
  }

  // ---- question ----
  if (typeof b.question !== 'string') {
    throw new BadRequestException('question は文字列で指定してください');
  }
  const question = b.question.trim();
  if (question.length === 0) {
    throw new BadRequestException('question は空文字にできません');
  }
  if (question.length > PRESET_QUESTION_MAX_LENGTH) {
    throw new BadRequestException(
      `question は ${PRESET_QUESTION_MAX_LENGTH} 文字以内で指定してください`,
    );
  }

  // ---- choices ----
  if (!Array.isArray(b.choices)) {
    throw new BadRequestException('choices は配列で指定してください');
  }
  if (b.choices.length < PRESET_CHOICES_MIN || b.choices.length > PRESET_CHOICES_MAX) {
    throw new BadRequestException(
      `choices は ${PRESET_CHOICES_MIN}〜${PRESET_CHOICES_MAX} 個の要素が必要です`,
    );
  }
  const choices: string[] = [];
  for (let i = 0; i < b.choices.length; i++) {
    const raw = b.choices[i];
    if (typeof raw !== 'string') {
      throw new BadRequestException(`choices[${i}] は文字列で指定してください`);
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException(`choices[${i}] は空文字にできません`);
    }
    if (trimmed.length > PRESET_CHOICE_MAX_LENGTH) {
      throw new BadRequestException(
        `choices[${i}] は ${PRESET_CHOICE_MAX_LENGTH} 文字以内で指定してください`,
      );
    }
    choices.push(trimmed);
  }

  return { title, question, choices };
}

@ApiTags('presets')
@Controller('presets')
export class PresetController {
  constructor(private readonly presetService: PresetService) {}

  @Get()
  @UseGuards(RequireUserGuard)
  @ApiOperation({ summary: '自分のプリセット一覧を取得する' })
  @ApiResponse({ status: 200, description: 'プリセット一覧' })
  async listMine(@CurrentUser() user: User) {
    return this.presetService.listMine(user.id);
  }

  @Post()
  @UseGuards(RequireUserGuard)
  @ApiOperation({ summary: 'プリセットを作成する' })
  @ApiResponse({ status: 201, description: 'プリセットを作成しました' })
  @ApiResponse({ status: 400, description: '不正な body（title/question/choices 形式違反など）' })
  async create(@CurrentUser() user: User, @Body() body: unknown) {
    const dto = validateCreatePresetInput(body);
    return this.presetService.create(user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RequireUserGuard)
  @ApiOperation({ summary: 'プリセットを削除する' })
  @ApiResponse({ status: 200, description: '削除しました' })
  @ApiResponse({ status: 404, description: 'プリセットが存在しないか、他ユーザーの所有物' })
  async remove(@CurrentUser() user: User, @Param('id') id: string) {
    await this.presetService.delete(user.id, id);
    return { ok: true };
  }
}
