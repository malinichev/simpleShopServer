import { BadRequestException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { Queue } from 'bullmq';
import { ImageRegenService, REGEN_TECH_SUFFIX } from './image-regen.service';
import {
  ImageRegenJob,
  ImageRegenJobStatus,
} from './entities/image-regen-job.entity';
import type {
  ImageGenDriver,
  GarmentAnalysis,
} from './drivers/image-gen-driver.interface';
import type { ProductsService } from '@/modules/products/products.service';
import type { SettingsService } from '@/modules/settings/settings.service';
import type { ConfigService } from '@nestjs/config';

const SAMPLE_ANALYSIS: GarmentAnalysis = {
  garmentType: 'Женская пижама в горошек',
  color: 'розовый с белым горошком',
  styleMood: 'нежное игривое домашнее',
  modelNote: 'девушка 25–30, мягкая естественная внешность',
  notes: 'шорты на поясе-резинке, принт в горошек сохранять точно',
  brandArtifacts: 'логотип на бирке',
  infoText: 'подпись «мягкая ткань» внизу',
  scenes: [{ title: 'Чай перед сном', prompt: 'cozy bedtime tea scene' }],
};

function makeDriver(): ImageGenDriver {
  return {
    driverName: 'routerai',
    editImage: jest.fn(),
    analyzeGarment: jest.fn(async () => SAMPLE_ANALYSIS),
  };
}

function makeService(driver: ImageGenDriver | null = makeDriver()) {
  const repository = {
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => ({ ...v, id: 'job-1' })),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
  };
  const regenQueue = { add: jest.fn() };
  const productsService = {
    findById: jest.fn(async () => ({
      id: 'p1',
      images: [
        { id: 'img-1', url: 'http://s3/products/a.webp', alt: '', order: 0 },
        { id: 'img-2', url: 'http://s3/products/b.webp', alt: '', order: 1 },
      ],
    })),
  };
  const settingsService = {
    getSettings: jest.fn(async () => ({
      aiImagePrompts: {
        basePrompt: 'BASE STYLE TEXT',
        presets: [{ id: 'x', title: 'X', prompt: 'scene x' }],
      },
    })),
  };
  const configService = { get: (k: string) => (k === 'ai.imageModel' ? 'gpt-image-1' : undefined) };

  const service = new ImageRegenService(
    repository as unknown as Repository<ImageRegenJob>,
    regenQueue as unknown as Queue,
    driver,
    productsService as unknown as ProductsService,
    settingsService as unknown as SettingsService,
    configService as unknown as ConfigService,
  );

  return { service, repository, regenQueue, productsService, settingsService };
}

describe('ImageRegenService.composePrompt', () => {
  it('складывает базовый стиль + сцену + тех-суффикс через двойной перевод строки', () => {
    const { service } = makeService();
    const composed = service.composePrompt('BASE', 'SCENE');
    expect(composed).toBe(`BASE\n\nSCENE\n\n${REGEN_TECH_SUFFIX}`);
  });

  it('без базового промпта — только сцена и тех-суффикс', () => {
    const { service } = makeService();
    const composed = service.composePrompt('  ', 'SCENE');
    expect(composed).toBe(`SCENE\n\n${REGEN_TECH_SUFFIX}`);
  });

  it('тех-суффикс: ТОЛЬКО брендовое удалить, прочий существующий текст (в т.ч. описания товара) воспроизвести, нового не добавлять', () => {
    expect(REGEN_TECH_SUFFIX).toContain('Remove ONLY brand artifacts');
    expect(REGEN_TECH_SUFFIX).toContain('website URLs and watermarks');
    expect(REGEN_TECH_SUFFIX).toContain('reconstruct clean fabric');
    // вещь не меняется: размерный образ/посадка/длина
    expect(REGEN_TECH_SUFFIX).toContain('length, fit or sizing look');
    // прочий существующий текст — включая описания/маркетинговые подписи — воспроизвести как есть
    expect(REGEN_TECH_SUFFIX).toContain('KEEP and reproduce');
    expect(REGEN_TECH_SUFFIX).toContain('product descriptions and marketing captions');
    expect(REGEN_TECH_SUFFIX).toContain('same wording, same language');
    // нового текста не добавлять
    expect(REGEN_TECH_SUFFIX).toContain('Do NOT add any new text');
    // и формат карточки остаётся
    expect(REGEN_TECH_SUFFIX).toContain('3:4');
  });
});

describe('ImageRegenService.start', () => {
  it('создаёт job с items по выбранным фото и ставит в очередь image-regen', async () => {
    const { service, repository, regenQueue } = makeService();

    const job = await service.start(
      {
        productId: 'p1',
        imageIds: ['img-1', 'img-2'],
        prompt: 'Девушка пьёт чай перед сном',
      },
      'user-1',
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ImageRegenJobStatus.PENDING,
        productId: 'p1',
        model: 'gpt-image-1',
        totalImages: 2,
        createdBy: 'user-1',
      }),
    );
    expect(job.items).toEqual([
      { sourceImageId: 'img-1', sourceUrl: 'http://s3/products/a.webp', variants: [] },
      { sourceImageId: 'img-2', sourceUrl: 'http://s3/products/b.webp', variants: [] },
    ]);
    expect(job.composedPrompt).toContain('BASE STYLE TEXT');
    expect(job.composedPrompt).toContain('Девушка пьёт чай перед сном');
    expect(job.composedPrompt).toContain('Remove ONLY brand artifacts');
    expect(job.composedPrompt).toContain('KEEP and reproduce');
    expect(regenQueue.add).toHaveBeenCalledWith(
      'process-image-regen',
      { jobId: 'job-1', variantsPerImage: 1 },
      expect.anything(),
    );
  });

  it(' rejects: фото не из товара', async () => {
    const { service } = makeService();
    await expect(
      service.start(
        { productId: 'p1', imageIds: ['img-1', 'alien'], prompt: 'сцена достаточно длинная' },
        'user-1',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects: драйвер не настроен (null)', async () => {
    const { service } = makeService(null);
    await expect(
      service.start({ productId: 'p1', imageIds: ['img-1'], prompt: 'сцена' }, 'u'),
    ).rejects.toThrow('ИИ-генерация не настроена');
  });

  it('stub-драйвер записывается в model как driverName', async () => {
    const { service, repository } = makeService({ driverName: 'stub', editImage: jest.fn() });
    await service.start(
      { productId: 'p1', imageIds: ['img-1'], prompt: 'сцена' },
      'u',
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'stub' }),
    );
  });
});

describe('ImageRegenService.getConfig', () => {
  it('отдаёт enabled/модель и пресеты из настроек', async () => {
    const { service } = makeService();
    const config = await service.getConfig();
    expect(config).toMatchObject({
      enabled: true,
      driver: 'routerai',
      model: 'gpt-image-1',
      basePrompt: 'BASE STYLE TEXT',
    });
    expect(config.presets).toHaveLength(1);
  });

  it('driver=null → enabled=false', async () => {
    const { service } = makeService(null);
    const config = await service.getConfig();
    expect(config.enabled).toBe(false);
    expect(config.driver).toBeNull();
  });
});

describe('ImageRegenService.analyze — vision-анализ перед генерацией', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('скачивает выбранные фото и передаёт драйверу с концепцией из настроек', async () => {
    const fetchMock = jest.fn(async () => new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8]), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const driver = makeDriver();
    const { service } = makeService(driver);
    const analysis = await service.analyze({
      productId: 'p1',
      imageIds: ['img-1'],
    });

    expect(analysis).toEqual(SAMPLE_ANALYSIS);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://s3/products/a.webp',
      expect.anything(),
    );
    expect(driver.analyzeGarment).toHaveBeenCalledWith(
      expect.objectContaining({ concept: 'BASE STYLE TEXT' }),
    );
    const input = (driver.analyzeGarment as jest.Mock).mock.calls[0][0] as {
      images: Array<{ mimeType: string }>;
    };
    expect(input.images[0].mimeType).toBe('image/png');
  });

  it('rejects: фото не из товара', async () => {
    const { service } = makeService();
    await expect(
      service.analyze({ productId: 'p1', imageIds: ['alien'] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects: драйвер не настроен', async () => {
    const { service } = makeService(null);
    await expect(
      service.analyze({ productId: 'p1', imageIds: ['img-1'] }),
    ).rejects.toThrow('ИИ-генерация не настроена');
  });
});
