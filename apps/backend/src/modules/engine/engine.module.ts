import { Module } from '@nestjs/common';
import { EngineService } from './engine.service';

/**
 * 宣言的ゲームエンジンモジュール。
 *
 * エンジンは純粋（DB アクセスなし）のため PrismaModule は不要。
 * Room モジュールが EngineService に依存して状態遷移を委譲する。
 */
@Module({
  providers: [EngineService],
  exports: [EngineService],
})
export class EngineModule {}
