import type { Repository } from 'typeorm';
import type { Job } from 'bullmq';
import sharp from 'sharp';
import { ImageRegenProcessor } from './image-regen.processor';
import {
  ImageRegenJob,
  ImageRegenJobStatus,
  RegenItem,
} from '@/modules/image-regen/entities/image-regen-job.entity';
import type { ImageGenDriver } from '@/modules/image-regen/drivers/image-gen-driver.interface';
import type { UploadService } from '@/modules/upload/upload.service';

async function pngBuffer(width = 64, height = 64): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: '#cc6699' },
  })
    .png()
    .toBuffer();
}

function makeProcessor(driver: ImageGenDriver | null) {
  const jobRow: ImageRegenJob = {
    id: 'job-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    status: ImageRegenJobStatus.PENDING,
    productId: 'p1',
    prompt: 'сцена',
    composedPrompt: 'BASE\n\nсцена\n\nTECH',
    model: 'stub',
    items: [
      { sourceImageId: 'img-1', sourceUrl: 'http://s3/src-1.webp', variants: [] },
      { sourceImageId: 'img-2', sourceUrl: 'http://s3/src-2.webp', variants: [] },
    ],
    totalImages: 2,
    processedImages: 0,
    successCount: 0,
    errorCount: 0,
    errors: [],
    createdBy: 'u1',
  } as ImageRegenJob;

  const jobRepo = {
    findOne: jest.fn(async () => jobRow),
    update: jest.fn(),
  };
  const uploadService = {
    uploadBuffer: jest.fn(),
    getFileUrl: jest.fn((key: string) => `http://s3/${key}`),
  };

  const processor = new ImageRegenProcessor(
    jobRepo as unknown as Repository<ImageRegenJob>,
    driver,
    uploadService as unknown as UploadService,
  );

  const bullJob = { data: { jobId: 'job-1', variantsPerImage: 1 } } as Job<{
    jobId: string;
    variantsPerImage: number;
  }>;

  return { processor, jobRepo, uploadService, jobRow, bullJob };
}

/** Подменяем fetch исходников: оба ок, либо source-2 — 404. */
function mockSourceFetch(failSecond = true) {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn(async (url: unknown) => {
    const urlStr = String(url);
    if (failSecond && urlStr.includes('src-2')) {
      return new Response('not found', { status: 404 });
    }
    return new Response(await pngBuffer(), { status: 200 });
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return () => {
    global.fetch = originalFetch;
  };
}

describe('ImageRegenProcessor.process', () => {
  const driverHappy: ImageGenDriver = {
    driverName: 'stub',
    editImage: jest.fn(async () => [{ buffer: await pngBuffer() }]),
  };

  it('успешный путь: варианты загружены в S3, формат карточки 1200×1600, статус completed', async () => {
    const restoreFetch = mockSourceFetch(false);
    const { processor, jobRepo, uploadService } = makeProcessor(driverHappy);

    await processor.process({
      data: { jobId: 'job-1', variantsPerImage: 1 },
    } as Job<{ jobId: string; variantsPerImage: number }>);

    // 2 фото × (карточка + thumb)
    expect(uploadService.uploadBuffer).toHaveBeenCalledTimes(4);
    // Порядок аргументов uploadBuffer(buffer, key, contentType)
    const cardCall = uploadService.uploadBuffer.mock.calls.find(
      ([, key]) => !key.includes('_thumb'),
    )!;
    expect(cardCall[1]).toMatch(/^products\/[0-9a-f-]+\.webp$/);
    expect(cardCall[2]).toBe('image/webp');

    // Формат: кроп 3:4 1200×1600 webp
    const meta = await sharp(cardCall[0]).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(1600);

    const finalUpdate = jobRepo.update.mock.calls.at(-1)![1];
    expect(finalUpdate.status).toBe(ImageRegenJobStatus.COMPLETED);
    expect(finalUpdate.successCount).toBe(2);
    expect(finalUpdate.errorCount).toBe(0);
    expect(finalUpdate.items[0].variants[0].url).toMatch(/^http:\/\/s3\/products\//);

    restoreFetch();
  });

  it('изоляция ошибок: упавшее фото фиксируется в item.error, остальные генерируются', async () => {
    const restoreFetch = mockSourceFetch();
    const { processor, jobRepo } = makeProcessor(driverHappy);

    await processor.process({
      data: { jobId: 'job-1', variantsPerImage: 1 },
    } as Job<{ jobId: string; variantsPerImage: number }>);

    const finalUpdate = jobRepo.update.mock.calls.at(-1)![1];
    expect(finalUpdate.status).toBe(ImageRegenJobStatus.COMPLETED);
    expect(finalUpdate.successCount).toBe(1);
    expect(finalUpdate.errorCount).toBe(1);

    const items = finalUpdate.items as RegenItem[];
    expect(items[0].variants).toHaveLength(1);
    expect(items[1].variants).toHaveLength(0);
    expect(items[1].error).toContain('404');
    expect(finalUpdate.errors).toEqual([
      { sourceImageId: 'img-2', message: expect.stringContaining('404') },
    ]);

    restoreFetch();
  });

  it('все фото упали → статус failed', async () => {
    const originalFetch = global.fetch;
    global.fetch = (jest.fn(async () => new Response('err', { status: 500 })) as unknown) as typeof fetch;
    const { processor, jobRepo } = makeProcessor(driverHappy);

    await processor.process({
      data: { jobId: 'job-1', variantsPerImage: 1 },
    } as Job<{ jobId: string; variantsPerImage: number }>);

    const finalUpdate = jobRepo.update.mock.calls.at(-1)![1];
    expect(finalUpdate.status).toBe(ImageRegenJobStatus.FAILED);
    expect(finalUpdate.successCount).toBe(0);

    global.fetch = originalFetch;
  });

  it('драйвер не настроен (null) → job failed с внятной причиной', async () => {
    const { processor, jobRepo } = makeProcessor(null);
    await processor.process({
      data: { jobId: 'job-1', variantsPerImage: 1 },
    } as Job<{ jobId: string; variantsPerImage: number }>);
    expect(jobRepo.update).toHaveBeenCalledWith('job-1', {
      status: ImageRegenJobStatus.FAILED,
      errors: [{ message: 'ИИ-драйвер не настроен на сервере' }],
    });
  });

  it('у каждого фото свой промпт: драйвер получает item.composedPrompt, а не job-овый', async () => {
    const restoreFetch = mockSourceFetch(false);
    const driverPerItem: ImageGenDriver = {
      driverName: 'stub',
      editImage: jest.fn(async () => [{ buffer: await pngBuffer() }]),
    };
    const { processor, jobRow } = makeProcessor(driverPerItem);

    jobRow.items[0].composedPrompt = 'BASE\n\nСЦЕНА ФОТО-1\n\nTECH';

    await processor.process({
      data: { jobId: 'job-1', variantsPerImage: 1 },
    } as Job<{ jobId: string; variantsPerImage: number }>);

    const calls = (driverPerItem.editImage as jest.Mock).mock.calls;
    expect(calls[0][0].prompt).toContain('СЦЕНА ФОТО-1');
    // у второго фото персонального нет → общий job-овый
    expect(calls[1][0].prompt).toBe(jobRow.composedPrompt);

    restoreFetch();
  });
});
