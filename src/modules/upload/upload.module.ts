import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { UploadService } from './upload.service';
import { UploadController } from './upload.controller';
import { ImageProcessor } from './processors/image.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'image-processing',
    }),
  ],
  controllers: [UploadController],
  providers: [UploadService, ImageProcessor],
  exports: [UploadService],
})
export class UploadModule {}
