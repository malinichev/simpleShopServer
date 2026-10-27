import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { OrderMarkingService } from './order-marking.service';
import { MarkingService } from '@/modules/marking/marking.service';
import { MarkingCode } from '@/modules/marking/entities/marking-code.entity';
import { OrderItemEntity } from './entities/order-item.entity';

const makeItem = (variantId: string): OrderItemEntity =>
  ({
    id: 'item-1',
    productId: 'product-1',
    variantId,
    quantity: 1,
  }) as OrderItemEntity;

function makeQueryRunner(selectResult: unknown) {
  return {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    query: jest.fn().mockResolvedValue(selectResult),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
  };
}

describe('OrderMarkingService.reserveCodesForOrder — stock sync', () => {
  async function createService(
    selectResult: unknown,
    markingServiceOverrides: Partial<Record<keyof MarkingService, jest.Mock>> = {},
  ) {
    const queryRunner = makeQueryRunner(selectResult);
    const dataSource = { createQueryRunner: jest.fn(() => queryRunner) } as unknown as DataSource;
    const markingService = {
      syncVariantStock: jest.fn(),
      hasCodes: jest.fn(),
      ...markingServiceOverrides,
    } as unknown as Record<keyof MarkingService, jest.Mock>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderMarkingService,
        { provide: DataSource, useValue: dataSource },
        { provide: MarkingService, useValue: markingService },
        {
          provide: 'MarkingCodeRepository',
          useValue: {},
        },
      ],
    })
      .overrideProvider('MarkingCodeRepository')
      .useValue({})
      .compile();

    const service = module.get(OrderMarkingService);
    return {
      service,
      syncVariantStock: markingService.syncVariantStock as jest.Mock,
      hasCodes: markingService.hasCodes as jest.Mock,
      queryRunner,
    };
  }

  it('НЕ обнуляет stock варианта без кодов маркировки (немаркированный товар)', async () => {
    // SELECT ... FROM marking_codes возвращает пусто — кодов у варианта нет
    const { service, syncVariantStock } = await createService([]);

    await service.reserveCodesForOrder('order-1', [makeItem('variant-1')]);

    // Регрессия: syncVariantStock считал stock = COUNT(in_stock кодов) = 0
    // и затирал остатки обычного товара при каждом заказе
    expect(syncVariantStock).not.toHaveBeenCalled();
  });

  it('синхронизирует stock варианта, у которого коды маркировки есть', async () => {
    const { service, syncVariantStock } = await createService(
      [{ id: 'code-1', code: 'x', gtin: 'g', serial: 's' }],
      { hasCodes: jest.fn().mockResolvedValue(true) },
    );

    await service.reserveCodesForOrder('order-1', [makeItem('variant-1')]);

    expect(syncVariantStock).toHaveBeenCalledWith('variant-1');
  });
});
