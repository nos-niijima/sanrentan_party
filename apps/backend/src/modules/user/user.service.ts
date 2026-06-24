import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { User } from '../../generated/prisma/client';
import type { UserIdentity } from '@sanrentan-party/shared';

/**
 * 身元解決とユーザー台帳の単一の責務。
 * x-user-* ヘッダ (BFF が cookie identity (pb_uid) から発行) を受け取って User を遅延 upsert する。
 */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * x-user-* 由来の身元から遅延 upsert でユーザーを解決する。
   * googleId 優先 → email でバックフィル → 新規作成、の 3 分岐。
   * サンレンタン では googleId は cookie token (= anonymous id) を保持する列として利用する。
   */
  async getOrCreateUserByIdentity(params: UserIdentity): Promise<User> {
    const { email, googleId, name } = params;

    if (!email) {
      throw new Error('Email is required to resolve user');
    }
    if (!googleId) {
      throw new Error('Google ID is required to resolve user');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedGoogleId = googleId.trim();
    const normalizedName = name?.trim();

    const existingByGoogleId = await this.prisma.user.findUnique({
      where: { googleId: normalizedGoogleId },
    });

    if (existingByGoogleId) {
      return this.prisma.user.update({
        where: { id: existingByGoogleId.id },
        data: {
          email: normalizedEmail,
          ...(normalizedName ? { name: normalizedName } : {}),
        },
      });
    }

    const existingByEmail = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingByEmail) {
      return this.prisma.user.update({
        where: { id: existingByEmail.id },
        data: {
          googleId: normalizedGoogleId,
          ...(normalizedName ? { name: normalizedName } : {}),
        },
      });
    }

    try {
      return await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          name: normalizedName || normalizedEmail,
          googleId: normalizedGoogleId,
        },
      });
    } catch (err) {
      // 初回ログイン直後の同時リクエスト競合（P2002）。既に作成済みなので読み直す。
      if ((err as { code?: string }).code === 'P2002') {
        const raced =
          (await this.prisma.user.findUnique({ where: { googleId: normalizedGoogleId } })) ??
          (await this.prisma.user.findUnique({ where: { email: normalizedEmail } }));
        if (raced) return raced;
      }
      throw err;
    }
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async getUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  }
}
