import { Module } from '@nestjs/common';
import { RoomController } from './room.controller';
import { RoomService } from './room.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { EngineModule } from '../engine/engine.module';

@Module({
  imports: [PrismaModule, EngineModule],
  controllers: [RoomController],
  providers: [RoomService],
  exports: [RoomService],
})
export class RoomModule {}
