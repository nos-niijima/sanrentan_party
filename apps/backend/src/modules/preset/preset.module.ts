import { Module } from '@nestjs/common';
import { PresetController } from './preset.controller';
import { PresetService } from './preset.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PresetController],
  providers: [PresetService],
})
export class PresetModule {}
