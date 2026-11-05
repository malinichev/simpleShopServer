import type { Repository } from 'typeorm';
import type { Job } from 'bullmq';
import { SimaImportProcessor } from './sima-import.processor';
import type { SimaImportJob } from '@/modules/sima-import/entities/sima-import-job.entity';
import { SimaImportJobStatus } from '@/modules/sima-import/entities/sima-import-job.entity';
import type { SimaImportService } from '@/modules/sima-import/sima-import.service';
import type { ModelLinksService } from '@/modules/sima-import/model-links.service';
import type { CategoriesService } from '@/modules/categories/categories.service';
import type { ProductsService } from '@/modules/products/products.service';
import type { UploadService } from '@/modules/upload/upload.service';
import { modelIdFromKey } from './import.processor';

// Выгрузка: красная + белая (одна модель) + одиночка + мужская (отфильтруется)
const CSV = [
  '"Категория 2";"Категория 4";Артикул;Заголовок;Цена;"Крупный опт";Остаток;Описание;Изображения;Производитель;Цвет;Состав;Ткань;Штрихкод;"Модификации: Параметры";"Модификации: Цены";"Модификации: Наличие";"Модификации: Остатки";"Модификации: Артикулы";Модификации;Размер',
  '"Женская одежда";"Пижамы и комплекты";5354807;"Пижама красная";1440;891;11;"Красная пижама";"https://goods-photos.static1-sima-land.com/items/4640025/0/700-nw.jpg";MINAKU;Красный;"Полиэстер 100%";Капитон;;"54";"1456";"Да";"20";"5354807";;"54"',
  '"Женская одежда";"Пижамы и комплекты";5354799;"Пижама белая";1440;1107;21;"Белая пижама";"https://goods-photos.static1-sima-land.com/items/4640017/0/700-nw.jpg";MINAKU;Белый;"Полиэстер 100%";Капитон;;"52";"1440";"Да";"21";"5354799";;"52"',
  '"Женская одежда";"Халаты";7487050;"Халат серый";2000;1500;5;"Халат";"https://goods-photos.static1-sima-land.com/items/6367252/0/700-nw.jpg";MINAKU;Серый;"";"";;;;;;;;"44;46"',
  '"Мужская одежда";"Пижамы и комплекты";10553639;"Пижама мужская";3353;2579;3;"";"";KAFTAN;;"";"";;;;;;;;"48"',
].join('\r\n');

interface MakeOpts {
  cancelRequested?: boolean;
  existingBySku?: Record<string, { id: string; modelId: string | null }>;
}

function makeProcessor(opts: MakeOpts = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const jobRepo = {
    update: jest.fn((_id: string, data: Record<string, unknown>) => {
      updates.push(data);
    }),
    findOne: jest.fn(async () => ({
      cancelRequested: opts.cancelRequested ?? false,
    })),
  };
  const productsService = {
    create: jest.fn(async (dto: Record<string, unknown>) => ({
      id: 'new-id',
      ...dto,
    })),
    update: jest.fn(async () => ({})),
    findBySkus: jest.fn(async (skus: string[]) =>
      skus
        .filter((sku) => opts.existingBySku?.[sku])
        .map((sku) => ({
          id: opts.existingBySku![sku].id,
          sku,
          modelId: opts.existingBySku![sku].modelId,
          name: `существующий ${sku}`,
        })),
    ),
    invalidateCache: jest.fn(),
  };
  const simaImportService = {
    readRows: jest.fn(async () => null), // подменяется ниже
  };
  const modelLinks = {
    resolveModelLinks: jest.fn(async () => ({
      keys: new Map([
        [5354807, 5354799],
        [5354799, 5354799],
        [7487050, 7487050],
      ]),
      colors: new Map([
        [5354807, 'Красный'],
        [5354799, 'Белый'],
      ]),
    })),
  };
  const categoriesService = {
    findAll: jest.fn(async () => [
      { id: 'cat-pijama', name: 'Пижамы' },
      { id: 'cat-halat', name: 'Халаты' },
    ]),
  };
  const uploadService = {
    uploadBuffer: jest.fn(async () => undefined),
    getFileUrl: jest.fn((key: string) => `https://s3.local/${key}`),
  };

  const processor = new SimaImportProcessor(
    jobRepo as unknown as Repository<SimaImportJob>,
    simaImportService as unknown as SimaImportService,
    modelLinks as unknown as ModelLinksService,
    categoriesService as unknown as CategoriesService,
    productsService as unknown as ProductsService,
    uploadService as unknown as UploadService,
  );

  const bullJob = {
    data: { jobId: 'job-1', fileKey: 'sima-imports/test.csv', onlyWomen: true },
  } as unknown as Job<Parameters<SimaImportProcessor['process']>[0]>;

  return {
    processor,
    bullJob,
    updates,
    productsService,
    uploadService,
    simaImportService,
  };
}

/** Загружает CSV через мок readRows (парсер уже покрыт своим спеком). */
async function run(opts: MakeOpts = {}) {
  const ctx = makeProcessor(opts);
  const { parseSimaExport } = await import(
    '@/modules/sima-import/sima-export.parser'
  );
  ctx.simaImportService.readRows = jest.fn(async () =>
    parseSimaExport(Buffer.from(CSV, 'utf8')).rows,
  );
  await ctx.processor.process(ctx.bullJob);
  return ctx;
}

describe('SimaImportProcessor', () => {
  it('цвета одной модели получают один modelId, картинки зеркалятся в S3', async () => {
    const ctx = await run();

    const final = ctx.updates.at(-1)![0] as never as Record<string, unknown>;
    void final;
    const statusUpdate = ctx.updates.at(-1) as unknown as Record<string, unknown>;
    expect(statusUpdate.status).toBe(SimaImportJobStatus.COMPLETED);

    expect(ctx.productsService.create).toHaveBeenCalledTimes(3);
    const red = ctx.productsService.create.mock.calls[0][0] as Record<string, unknown>;
    const white = ctx.productsService.create.mock.calls[1][0] as Record<string, unknown>;
    const loner = ctx.productsService.create.mock.calls[2][0] as Record<string, unknown>;

    expect(red.modelId).toBe(white.modelId);
    expect(red.modelId).toBe(modelIdFromKey('5354799'));
    expect(loner.modelId).toBe(modelIdFromKey('7487050'));

    // цена = round10(опт×2), compareAt = round50(×1.75)
    expect(red.price).toBe(1780);
    expect(red.compareAtPrice).toBe(3100);

    // мужская строка отфильтрована (onlyWomen)
    expect(red.name).not.toContain('мужская');

    // фото: CDN-зеркало через uploadBuffer, URL подменён на наш S3
    expect(ctx.uploadService.uploadBuffer).toHaveBeenCalledTimes(3);
    const images = red.images as Array<{ url: string }>;
    expect(images[0].url).toContain('https://s3.local/products/sima/');
  });

  it('существующий товар обновляется, ручная связь modelId сохраняется', async () => {
    const ctx = await run({
      existingBySku: { 'SL-5354807': { id: 'p-1', modelId: 'manual-uuid' } },
    });

    expect(ctx.productsService.update).toHaveBeenCalledTimes(1);
    const [id, dto] = ctx.productsService.update.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(id).toBe('p-1');
    expect(dto.modelId).toBe('manual-uuid'); // не перетёрли вычисленным
    expect(dto.price).toBe(1780); // цены обновили
    expect(ctx.productsService.create).toHaveBeenCalledTimes(2);
  });

  it('отмена: cancelRequested → статус canceled с итогами', async () => {
    const ctx = await run({ cancelRequested: true });

    const statusUpdate = ctx.updates.at(-1) as unknown as Record<
      string,
      unknown
    >;
    expect(statusUpdate.status).toBe(SimaImportJobStatus.CANCELED);
    expect(statusUpdate.finishedAt).toBeTruthy();
  });
});
