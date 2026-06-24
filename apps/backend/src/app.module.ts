import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { UserModule } from './modules/user/user.module';
import { RoomModule } from './modules/room/room.module';
import { PresetModule } from './modules/preset/preset.module';
import { EngineModule } from './modules/engine/engine.module';
import { UserContextMiddleware } from './common/middleware/user-context.middleware';

@Module({
  imports: [
    // 設定モジュール
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      cache: true,
    }),

    // レート制限
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [
          {
            ttl: parseInt(process.env.THROTTLE_TTL || '60') * 1000,
            limit: parseInt(process.env.THROTTLE_LIMIT || '100'),
          },
        ],
      }),
    }),

    // データベース
    PrismaModule,

    // 機能モジュール
    HealthModule,
    UserModule, // 身元解決（UserContextMiddleware が依存）
    RoomModule,
    PresetModule,
    EngineModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // 全ルートで x-user-* → req.user を解決（公開ルートは素通り）。
    consumer.apply(UserContextMiddleware).forRoutes('*');
  }
}
