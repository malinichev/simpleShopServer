import { NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductStatus } from './entities/product.entity';
import type { Product, ProductVariant } from './entities/product.entity';

/**
 * ProductsService создаёт Redis в конструкторе — в тестах виснет.
 * Обходим: создаём объект с прототипом сервиса, мокаем зависимости напрямую.
 */
function buildService(overrides: {
  repo?: Record<string, jest.Mock>;
} = {}) {
  const service = Object.create(ProductsService.prototype) as instanceType<typeof ProductsService> & {
    productsRepository: Record<string, jest.Mock>;
    searchService: { onProductSaved: jest.Mock };
    invalidateCache: jest.Mock;
    generateSlug: (name: string) => string;
    generateSku: () => string;
  };
  service.productsRepository = {
    findById: jest.fn(),
    create: jest.fn().mockImplementation((data: unknown) => ({ ...data, id: 'new-id' })),
    update: jest.fn().mockResolvedValue(undefined),
    findColorSiblings: jest.fn(),
    findAll: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
    ...overrides.repo,
  };
  service.searchService = { onProductSaved: jest.fn() };
  service.invalidateCache = jest.fn();
  service.generateSlug = (name: string) => `${name}-xyz789`;
  service.generateSku = () => `PRD-NEW-${Date.now()}`;
  return service;
}

const variant = (o: Partial<ProductVariant> = {}): ProductVariant =>
  ({ id: 'v1', size: 'M', sku: 'SKU-1', stock: 5, price: 1000, ...o }) as ProductVariant;

const product = (o: Partial<Product> = {}): Product =>
  ({
    id: 'p1', name: 'Костюм', slug: 'kostyum-abc', sku: 'PRD-1',
    description: 'Оп', shortDescription: 'К', categoryId: 'cat1',
    tags: ['спорт'], attributes: { material: 'хлопок', activity: ['йога'], features: ['дышащая'] },
    price: 3000, compareAtPrice: 5000, status: ProductStatus.ACTIVE, isVisible: true,
    color: 'фуксия', colorHex: '#e91e8c',
    images: [{ id: 'i1', url: 'https://x.com/1.jpg', alt: '', order: 0 }],
    seo: { title: 'T', description: 'D', keywords: [] },
    gtin: '123', soldCount: 50, rating: 4.5, reviewsCount: 10,
    modelId: 'model-1',
    variants: [variant(), variant({ id: 'v2', size: 'L', sku: 'SKU-2' })],
    ...o,
  }) as unknown as Product;

describe('ProductsService.duplicateAsColor', () => {
  it('копирует базовые поля, очищает цвет/фото/SEO/gtin/метрики', async () => {
    const svc = buildService();
    svc.productsRepository.findById.mockResolvedValue(product());

    const result = await svc.duplicateAsColor('p1');

    expect(result.name).toBe('Костюм');
    expect(result.categoryId).toBe('cat1');
    expect(result.price).toBe(3000);
    expect(result.status).toBe(ProductStatus.DRAFT);
    // Очищено (не копируется от исходника)
    expect(result.color).toBeFalsy();
    expect(result.images).toEqual([]);
    expect(result.gtin).toBeFalsy();
    expect(result.soldCount).toBe(0);
  });

  it('наследует modelId, генерирует новый slug и sku', async () => {
    const svc = buildService();
    svc.productsRepository.findById.mockResolvedValue(product());

    const result = await svc.duplicateAsColor('p1');

    expect(result.modelId).toBe('model-1');
    expect(result.slug).not.toBe('kostyum-abc');
    expect(result.sku).not.toBe('PRD-1');
  });

  it('генерирует modelId если нет — и проставляет обоим', async () => {
    const svc = buildService();
    svc.productsRepository.findById.mockResolvedValue(product({ modelId: null as unknown as string }));

    const result = await svc.duplicateAsColor('p1');

    expect(result.modelId).toBeTruthy();
    expect(svc.productsRepository.update).toHaveBeenCalledWith('p1', expect.objectContaining({ modelId: expect.any(String) }));
  });

  it('копирует размеры вариантов, перегенерирует SKU, stock=0', async () => {
    const svc = buildService();
    svc.productsRepository.findById.mockResolvedValue(product());

    const result = await svc.duplicateAsColor('p1');
    const variants = (result as Record<string, unknown>).variants as ProductVariant[];

    expect(variants).toHaveLength(2);
    expect(variants[0].size).toBe('M');
    expect(variants[0].sku).not.toBe('SKU-1');
    expect(variants[0].stock).toBe(0);
  });

  it('404 если исходник не найден', async () => {
    const svc = buildService();
    svc.productsRepository.findById.mockResolvedValue(null);
    await expect(svc.duplicateAsColor('missing')).rejects.toThrow(NotFoundException);
  });
});

describe('ProductsService.findColorSiblings (сортировка по order)', () => {
  it('превью = фото с минимальным order', async () => {
    const svc = buildService();
    svc.productsRepository.findById.mockResolvedValue(product());
    svc.productsRepository.findColorSiblings.mockResolvedValue([
      product({
        id: 's1',
        images: [
          { id: 'a', url: 'wrong.jpg', alt: '', order: 5 },
          { id: 'b', url: 'right.jpg', alt: '', order: 1 },
        ],
      }),
    ]);

    const siblings = await svc.findColorSiblings('p1');
    expect(siblings[0].image).toBe('right.jpg');
  });

  it('пусто если modelId нет', async () => {
    const svc = buildService();
    svc.productsRepository.findById.mockResolvedValue(product({ modelId: null as unknown as string }));
    const siblings = await svc.findColorSiblings('p1');
    expect(siblings).toEqual([]);
  });
});
