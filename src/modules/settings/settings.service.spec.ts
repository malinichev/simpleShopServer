import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { SettingsService } from './settings.service';
import {
  PaymentMethod,
  PaymentProvider,
} from './entities/payment-method.entity';
import { Settings } from './entities/settings.entity';
import { ShippingMethod } from './entities/shipping-method.entity';

/**
 * Публичный список способов оплаты — часть чекаута: витрина показывает
 * покупателю только методы, которые сервер реально может провести.
 * Метод с онлайн-провайдером без env-ключей (драйвер не зарегистрирован)
 * показывать нельзя: заказ по нему создавался, но оплата не инициализировалась.
 */

function makeMethod(partial: Partial<PaymentMethod>): PaymentMethod {
  return {
    name: 'Метод',
    description: '',
    isActive: true,
    order: 0,
    provider: PaymentProvider.MANUAL,
    config: {},
    ...partial,
  } as PaymentMethod;
}

function makeService() {
  const settingsRepository = { find: jest.fn(), create: jest.fn(), save: jest.fn(), update: jest.fn() };
  const shippingRepository = { find: jest.fn(), findOne: jest.fn(), save: jest.fn() };
  const paymentRepository = { find: jest.fn(), findOne: jest.fn(), save: jest.fn() };
  const configService = { get: (key: string) => (key === 'brandName' ? 'My Shop' : undefined) } as unknown as ConfigService;

  const service = new SettingsService(
    settingsRepository as unknown as Repository<Settings>,
    shippingRepository as unknown as Repository<ShippingMethod>,
    paymentRepository as unknown as Repository<PaymentMethod>,
    configService,
  );

  return { service, settingsRepository, shippingRepository, paymentRepository };
}

describe('SettingsService.findActivePaymentMethods — фильтр по провайдерам', () => {
  const ENV_KEYS = ['YOOKASSA_SHOP_ID', 'STRIPE_SECRET_KEY', 'CLOUDPAYMENTS_PUBLIC_ID'];
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  it('не отдаёт метод с провайдером, чей драйвер не зарегистрирован (env пуст)', async () => {
    const { service, paymentRepository } = makeService();
    paymentRepository.find.mockResolvedValue([
      makeMethod({ id: 'm1', name: 'При получении', provider: PaymentProvider.MANUAL }),
      makeMethod({ id: 'm2', name: 'Банковская карта (ЮKassa)', provider: PaymentProvider.YOOKASSA }),
    ]);

    const methods = await service.findActivePaymentMethods();

    expect(methods.map((m) => m.name)).toEqual(['При получении']);
  });

  it('отдаёт онлайн-метод, когда провайдер активирован env-ключами', async () => {
    process.env.YOOKASSA_SHOP_ID = 'shop-id';
    const { service, paymentRepository } = makeService();
    paymentRepository.find.mockResolvedValue([
      makeMethod({ id: 'm1', name: 'При получении', provider: PaymentProvider.MANUAL }),
      makeMethod({ id: 'm2', name: 'Банковская карта (ЮKassa)', provider: PaymentProvider.YOOKASSA }),
    ]);

    const methods = await service.findActivePaymentMethods();

    expect(methods.map((m) => m.name)).toEqual([
      'При получении',
      'Банковская карта (ЮKassa)',
    ]);
  });
});
