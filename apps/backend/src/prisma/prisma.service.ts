import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private configService: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: configService.get<string>('DATABASE_URL'),
    });
    super({ adapter });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      console.log('✅ データベース接続が成功しました');
    } catch (error) {
      console.error('❌ データベース接続に失敗しました:', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    console.log('📤 データベース接続を切断しました');
  }

  // トランザクション用のヘルパーメソッド
  async executeTransaction<T>(
    fn: (prisma: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$extends' | '$use'>) => Promise<T>
  ): Promise<T> {
    return this.$transaction(fn);
  }

  // ヘルスチェック用メソッド
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  // データベース統計情報取得
  async getDatabaseStats() {
    const [userCount, roomCount] = await Promise.all([
      this.user.count(),
      this.room.count(),
    ]);

    return {
      users: userCount,
      rooms: roomCount,
      lastUpdated: new Date(),
    };
  }
}