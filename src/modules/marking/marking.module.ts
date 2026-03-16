import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarkingCode } from './entities/marking-code.entity';
import { MarkingService } from './marking.service';
import { MarkingController } from './marking.controller';

@Module({
  imports: [TypeOrmModule.forFeature([MarkingCode])],
  controllers: [MarkingController],
  providers: [MarkingService],
  exports: [MarkingService],
})
export class MarkingModule {}
