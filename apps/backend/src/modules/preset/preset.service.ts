import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Preset } from '../../generated/prisma/client';

/**
 * ユーザースコープのプリセット CRUD。
 * 各ユーザーが所有するプリセット（タイトル・設問・選択肢）を管理する。
 * 組み込みプリセット（engine/sanrentan-spec.ts の presets）は別物で、このサービスは触らない。
 */
@Injectable()
export class PresetService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 指定ユーザーのプリセット一覧を作成日降順で返す。
   */
  async listMine(userId: string): Promise<Preset[]> {
    return this.prisma.preset.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * プリセットを作成して返す。
   * 入力はコントローラで trim 済みであることを前提とする。
   */
  async create(
    userId: string,
    input: { title: string; question: string; choices: string[] },
  ): Promise<Preset> {
    return this.prisma.preset.create({
      data: {
        userId,
        title: input.title,
        question: input.question,
        choices: input.choices,
      },
    });
  }

  /**
   * 指定 id のプリセットをユーザーが所有している場合のみ削除する。
   * 存在しない / 別ユーザーのものは 404 を返す（存在有無を漏らさない）。
   */
  async delete(userId: string, id: string): Promise<void> {
    const result = await this.prisma.preset.deleteMany({
      where: { id, userId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Preset not found');
    }
  }
}
