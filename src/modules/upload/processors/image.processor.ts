import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { UploadService } from '../upload.service';

export interface ImageProcessingJobData {
  /** Ключ исходного (необработанного) файла в S3 */
  sourceKey: string;
  /** Целевая папка для обработанного результата */
  targetFolder: string;
  /** Имя файла (UUID) */
  fileName: string;
}

export interface ImageProcessingResult {
  key: string;
  thumbnailKey: string;
  url: string;
  thumbnailUrl: string;
  size: number;
}

@Processor('image-processing')
export class ImageProcessor extends WorkerHost {
  private readonly logger = new Logger(ImageProcessor.name);

  constructor(private readonly uploadService: UploadService) {
    super();
  }

  async process(
    job: Job<ImageProcessingJobData>,
  ): Promise<ImageProcessingResult> {
    const { sourceKey, targetFolder, fileName } = job.data;
    this.logger.log(
      `Processing image job ${job.id}: ${sourceKey} -> ${targetFolder}/${fileName}`,
    );

    try {
      // Download raw image from S3
      const buffer = await this.uploadService.getFileBuffer(sourceKey);

      // Process image (resize, convert to WebP, generate thumbnail)
      const { original, thumbnail } = await this.uploadService.processImage(buffer);

      // Upload processed images
      const key = `${targetFolder}/${fileName}.webp`;
      const thumbnailKey = `${targetFolder}/${fileName}_thumb.webp`;

      // Use the upload service's internal S3 upload via re-upload as a full image
      const result = await this.uploadService.uploadImage(
        {
          buffer: original,
          size: original.length,
          mimetype: 'image/webp',
          fieldname: 'file',
          originalname: `${fileName}.webp`,
        } as Express.Multer.File,
        targetFolder,
      );

      this.logger.log(
        `Job ${job.id} completed: original=${original.length}b, thumbnail=${thumbnail.length}b`,
      );

      return {
        key: result.key,
        thumbnailKey: result.key.replace('.webp', '_thumb.webp'),
        url: result.url,
        thumbnailUrl: result.thumbnailUrl!,
        size: original.length,
      };
    } catch (error) {
      this.logger.error(`Job ${job.id} failed: ${error}`);
      throw error;
    }
  }
}
