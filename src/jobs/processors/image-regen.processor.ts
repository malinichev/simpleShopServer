import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import {
  ImageRegenJob,
  ImageRegenJobStatus,
} from '@/modules/image-regen/entities/image-regen-job.entity';
import {
  IMAGE_GEN_DRIVER,
  ImageGenDriver,
} from '@/modules/image-regen/drivers/image-gen-driver.interface';
import {
  fetchImage,
  sniffMimeType,
} from '@/modules/image-regen/image-regen.utils';
import { UploadService } from '@/modules/upload/upload.service';

export interface ImageRegenJobData {
  jobId: string;
  variantsPerImage: number;
}

/** Формат карточки магазина: 3:4 портрет (см. client ProductCard/ProductGallery). */
const CARD_WIDTH = 1200;
const CARD_HEIGHT = 1600;
const THUMB_SIZE = 300;
const WEBP_QUALITY = 85;

/**
 * Воркер очереди `image-regen` (по образцу import.processor):
 * для каждого исходного фото — скачать → драйвер ИИ → пост-обработка
 * (кроп 3:4 1200×1600 webp + thumb) → S3 → результат в items[].variants.
 * Ошибки изолированы по фото: упавшее не ломает остальные, job завершается
 * COMPLETED, если хотя бы одно фото сгенерировано.
 */
@Processor('image-regen')
export class ImageRegenProcessor extends WorkerHost {
  private readonly logger = new Logger(ImageRegenProcessor.name);

  constructor(
    @InjectRepository(ImageRegenJob)
    private readonly jobRepo: Repository<ImageRegenJob>,
    @Inject(IMAGE_GEN_DRIVER)
    private readonly driver: ImageGenDriver | null,
    private readonly uploadService: UploadService,
  ) {
    super();
  }

  async process(job: Job<ImageRegenJobData>): Promise<void> {
    const { jobId, variantsPerImage } = job.data;
    const n = Math.max(1, Math.min(2, variantsPerImage));
    this.logger.log(`Processing image-regen job ${jobId}`);

    const regenJob = await this.jobRepo.findOne({ where: { id: jobId } });
    if (!regenJob) {
      this.logger.error(`Image regen job ${jobId} not found`);
      return;
    }

    await this.jobRepo.update(jobId, { status: ImageRegenJobStatus.PROCESSING });

    if (!this.driver) {
      await this.failJob(jobId, 'ИИ-драйвер не настроен на сервере');
      return;
    }

    const items = [...regenJob.items];
    const errors: Array<{ sourceImageId?: string; message: string }> = [];
    let processedImages = 0;
    let successCount = 0;
    let errorCount = 0;

    for (const item of items) {
      try {
        const sourceBuffer = await fetchImage(item.sourceUrl);
        const generated = await this.driver.editImage({
          image: sourceBuffer,
          mimeType: sniffMimeType(sourceBuffer),
          // у каждого фото свой субъект/ракурс → свой полный промпт
          prompt: item.composedPrompt || regenJob.composedPrompt,
          n,
        });

        const variants = [...item.variants];
        for (const image of generated.slice(0, n)) {
          const { card, thumb } = await this.processGenerated(image.buffer);
          const id = uuidv4();
          const key = `products/${id}.webp`;
          const thumbKey = `products/${id}_thumb.webp`;
          await this.uploadService.uploadBuffer(card, key, 'image/webp');
          await this.uploadService.uploadBuffer(thumb, thumbKey, 'image/webp');
          variants.push({
            url: this.uploadService.getFileUrl(key),
            thumbUrl: this.uploadService.getFileUrl(thumbKey),
          });
        }
        item.variants = variants;
        successCount++;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Неизвестная ошибка генерации';
        item.error = message;
        errorCount++;
        errors.push({ sourceImageId: item.sourceImageId, message });
        this.logger.warn(
          `Image regen ${jobId}: photo ${item.sourceImageId} failed: ${message}`,
        );
      }

      processedImages++;
      await this.jobRepo.update(jobId, {
        items,
        processedImages,
        successCount,
        errorCount,
        errors: errors.slice(0, 100),
      });
    }

    const status =
      successCount > 0
        ? ImageRegenJobStatus.COMPLETED
        : ImageRegenJobStatus.FAILED;
    await this.jobRepo.update(jobId, {
      status,
      items,
      processedImages,
      successCount,
      errorCount,
      errors: errors.slice(0, 100),
    });

    this.logger.log(
      `Image regen ${jobId} ${status}: ${successCount} ok, ${errorCount} errors`,
    );
  }

  private async failJob(jobId: string, message: string): Promise<void> {
    await this.jobRepo.update(jobId, {
      status: ImageRegenJobStatus.FAILED,
      errors: [{ message }],
    });
  }

  /** Кроп под карточку 3:4 + thumb (канон scripts/process-and-upload.ts). */
  private async processGenerated(
    buffer: Buffer,
  ): Promise<{ card: Buffer; thumb: Buffer }> {
    const base = sharp(buffer).flatten({ background: '#ffffff' });
    // Генерация приходит 2:3 (1024×1536), карточка 3:4 — кроп неизбежен.
    // position: attention — резать по «неинтересным» краям, сохраняя
    // салиентные области (лицо/вещь/подписи), а не слепой центральный кроп.
    const card = await base
      .clone()
      .resize(CARD_WIDTH, CARD_HEIGHT, {
        fit: 'cover',
        position: sharp.strategy.attention,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    const thumb = await sharp(buffer)
      .flatten({ background: '#ffffff' })
      .resize(THUMB_SIZE, THUMB_SIZE, { fit: 'cover' })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    return { card, thumb };
  }
}
