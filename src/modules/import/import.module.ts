import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ImportJob } from './entities/import-job.entity';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';
import { UploadModule } from '@/modules/upload/upload.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ImportJob]),
    BullModule.registerQueue({ name: 'import' }),
    UploadModule,
  ],
  controllers: [ImportController],
  providers: [ImportService],
  exports: [ImportService],
})
export class ImportModule {}
