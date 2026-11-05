import type { Repository } from 'typeorm';
import type { Job } from 'bullmq';
import { ImportProcessor, modelIdFromKey } from './import.processor';
import type { ImportJobData } from './import.processor';
import type { ProductsService } from '@/modules/products/products.service';
import type { CategoriesService } from '@/modules/categories/categories.service';
import type { UploadService } from '@/modules/upload/upload.service';
import type { ImportJob } from '@/modules/import/entities/import-job.entity';
import { ProductStatus } from '@/modules/products/entities/product.entity';

// Мини-CSV: две группы (цвета) с одним modelKey + одиночка без ключа
const CSV_TWO_COLORS = [
  'name,sku,price,categoryName,color,colorHex,modelKey,status,variantSize,variantSku,variantStock',
  'Пижама красная,SL-111,1000,Пижамы,Красный,#FF0000,111,active,46,SL-111,5',
  ',SL-111,,,,,,,,48,SL-112,3',
  'Пижама белая,SL-222,1000,Пижамы,Белый,#FFFFFF,111,active,46,SL-222,5',
  'Сорочка,SL-333,900,Пижамы,,,,active,42,SL-333,2',
].join('\n');

const HEADERS = [
  'name',
  'sku',
  'price',
  'categoryName',
  'color',
  'colorHex',
  'modelKey',
  'status',
  'variantSize',
  'variantSku',
  'variantStock',
];

function makeProcessor(csv: string, productsServiceOverrides: Record<string, unknown> = {}) {
  const importJobRepo = { update: jest.fn() };
  const productsService = {
    create: jest.fn(async (dto: Record<string, unknown>) => ({ id: 'new-1', ...dto })),
    update: jest.fn(),
    findById: jest.fn(),
    ...productsServiceOverrides,
  };
  const categoriesService = {
    findAll: jest.fn(async () => [{ id: 'cat-1', name: 'Пижамы' }]),
  };
  const uploadService = {
    getFileBuffer: jest.fn(async () => Buffer.from(csv)),
  };

  const processor = new ImportProcessor(
    importJobRepo as unknown as Repository<ImportJob>,
    productsService as unknown as ProductsService,
    categoriesService as unknown as CategoriesService,
    uploadService as unknown as UploadService,
  );

  const mapping = Object.fromEntries(HEADERS.map((h) => [h, h]));
  const bullJob = {
    data: {
      jobId: 'job-1',
      fileKey: 'imports/test.csv',
      mapping,
      defaultStatus: ProductStatus.DRAFT,
      skipDuplicates: true,
    },
  } as Job<ImportJobData>;

  return { processor, bullJob, importJobRepo, productsService };
}

describe('modelIdFromKey', () => {
  it('детерминирован и валиден для одного и того же ключа', () => {
    const a = modelIdFromKey('111');
    const b = modelIdFromKey(' 111 ');
    expect(a).toBe(b);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('разные ключи → разные id, пустой ключ → undefined', () => {
    expect(modelIdFromKey('111')).not.toBe(modelIdFromKey('222'));
    expect(modelIdFromKey('')).toBeUndefined();
    expect(modelIdFromKey(undefined)).toBeUndefined();
    expect(modelIdFromKey('   ')).toBeUndefined();
  });
});

describe('ImportProcessor modelKey → modelId', () => {
  it('цвета с одним modelKey получают один modelId, одиночка — null', async () => {
    const { processor, bullJob, importJobRepo, productsService } =
      makeProcessor(CSV_TWO_COLORS);

    await processor.process(bullJob);

    const finalUpdate = importJobRepo.update.mock.calls.at(-1)?.[1] as Record<
      string,
      number
    >;
    expect(finalUpdate.status).toBe('completed');
    expect(finalUpdate.successCount).toBe(3);

    expect(productsService.create).toHaveBeenCalledTimes(3);
    const dtoRed = productsService.create.mock.calls[0][0] as Record<string, unknown>;
    const dtoWhite = productsService.create.mock.calls[1][0] as Record<string, unknown>;
    const dtoLoner = productsService.create.mock.calls[2][0] as Record<string, unknown>;

    // красная и белая — один детерминированный modelId из modelKey=111
    expect(dtoRed.modelId).toBe(dtoWhite.modelId);
    expect(dtoRed.modelId).toBe(modelIdFromKey('111'));

    // одиночка без modelKey — без группы
    expect(dtoLoner.modelId).toBeUndefined();
  });

  it('при обновлении существующего товара его modelId не перетирается', async () => {
    const { processor, bullJob, productsService } = makeProcessor(CSV_TWO_COLORS, {
      findById: jest.fn(async () => ({
        id: 'p-existing',
        sku: 'SL-111',
        name: 'Пижама красная',
        modelId: 'manual-model-uuid',
      })),
    });
    bullJob.data.duplicateResolutions = { 'p-existing': 'csv' };

    await processor.process(bullJob);

    expect(productsService.update).toHaveBeenCalled();
    const updateDto = productsService.update.mock.calls[0][1] as Record<string, unknown>;
    expect(updateDto.modelId).toBe('manual-model-uuid');
  });

  it('при обновлении товара без modelId подставляется вычисленный из modelKey', async () => {
    const { processor, bullJob, productsService } = makeProcessor(CSV_TWO_COLORS, {
      findById: jest.fn(async () => ({
        id: 'p-existing',
        sku: 'SL-111',
        name: 'Пижама красная',
        modelId: null,
      })),
    });
    bullJob.data.duplicateResolutions = { 'p-existing': 'csv' };

    await processor.process(bullJob);

    const updateDto = productsService.update.mock.calls[0][1] as Record<string, unknown>;
    expect(updateDto.modelId).toBe(modelIdFromKey('111'));
  });
});
