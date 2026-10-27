import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import {
  PaymentMethod,
  PaymentProvider,
} from '@/modules/settings/entities/payment-method.entity';
import type { Order, PaymentStatus } from '@/modules/orders/entities/order.entity';
import type { OrdersRepository } from '@/modules/orders/orders.repository';
import type { PaymentDriver } from './drivers/payment-driver.interface';
import { PaymentsService } from './payments.service';

/**
 * Спецификация PaymentsService на публичных швах: initializeForOrder /
 * handleWebhook. Driver'ы и репозитории — тестовые двойники: весь money path
 * (заказ ↔ платёжный статус) координируется здесь, драйвер только ходит в API.
 */

const ORDER_ID = '0d0d9a2e-f6ad-4b8c-9e91-36cf99a3dd60';
const METHOD_ID = '9a1c2b34-1111-4222-8333-444455556666';
const TXN_ID = '2b0e86a0-000f-5000-9000-105e8ff2e2b6';
const WEB_URL = 'http://localhost:3002';

function makeOrder(partial: Partial<Order> = {}): Order {
  return {
    id: ORDER_ID,
    orderNumber: 'SV-2026-0001',
    total: 4790,
    paymentMetadata: { orderId: ORDER_ID },
    ...partial,
  } as Order;
}

type FakeDriver = PaymentDriver & {
  initialize: jest.Mock;
  handleWebhook: jest.Mock;
};

function fakeDriver(provider: PaymentProvider): FakeDriver {
  return { provider, initialize: jest.fn(), handleWebhook: jest.fn() };
}

function makeService() {
  const manual = fakeDriver(PaymentProvider.MANUAL);
  const yookassa = fakeDriver(PaymentProvider.YOOKASSA);

  const paymentMethodRepo = { findOne: jest.fn() };
  const ordersRepository = {
    updateFields: jest.fn(),
    findByPaymentProviderTxnId: jest.fn(),
  };
  const configService = {
    get: (key: string) => (key === 'webUrl' ? WEB_URL : undefined),
  } as unknown as ConfigService;

  const service = new PaymentsService(
    [manual, yookassa],
    paymentMethodRepo as unknown as Repository<PaymentMethod>,
    ordersRepository as unknown as OrdersRepository,
    configService,
  );

  return { service, manual, yookassa, paymentMethodRepo, ordersRepository };
}

describe('PaymentsService', () => {
  describe('initializeForOrder', () => {
    it('резолвит метод по UUID, передаёт methodConfig + returnUrl драйверу и фиксирует txnId/metadata', async () => {
      const { service, yookassa, paymentMethodRepo, ordersRepository } =
        makeService();
      paymentMethodRepo.findOne.mockResolvedValue({
        id: METHOD_ID,
        provider: PaymentProvider.YOOKASSA,
        config: { receipt: { email: true } },
      });
      yookassa.initialize.mockResolvedValue({
        status: 'redirect_required',
        redirectUrl: 'https://yoomoney.ru/checkout/payments/v2/contract',
        providerTxnId: TXN_ID,
        metadata: { orderId: ORDER_ID, paymentId: TXN_ID },
      });

      const result = await service.initializeForOrder(
        makeOrder(),
        METHOD_ID,
      );

      expect(yookassa.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          methodConfig: { receipt: { email: true } },
          returnUrl: `${WEB_URL}/checkout/success?orderNumber=SV-2026-0001`,
        }),
      );
      expect(ordersRepository.updateFields).toHaveBeenCalledWith(ORDER_ID, {
        paymentProviderTxnId: TXN_ID,
        paymentMetadata: { orderId: ORDER_ID, paymentId: TXN_ID },
      });
      expect(result.status).toBe('redirect_required');
      expect(result.redirectUrl).toBe(
        'https://yoomoney.ru/checkout/payments/v2/contract',
      );
    });

    it('строка-провайдер "yookassa" резолвится в yookassa-драйвер, а не в manual', async () => {
      const { service, manual, yookassa } = makeService();
      yookassa.initialize.mockResolvedValue({ status: 'pending' });

      await service.initializeForOrder(makeOrder(), 'yookassa');

      expect(yookassa.initialize).toHaveBeenCalledTimes(1);
      expect(manual.initialize).not.toHaveBeenCalled();
    });

    it('ошибка драйвера не роняет созданный заказ: pending без записи в заказ', async () => {
      const { service, yookassa, ordersRepository } = makeService();
      yookassa.initialize.mockRejectedValue(
        new Error('YooKassa API /payments → 500'),
      );

      const result = await service.initializeForOrder(makeOrder(), 'yookassa');

      expect(result).toEqual({ status: 'pending' });
      expect(ordersRepository.updateFields).not.toHaveBeenCalled();
    });
  });

  describe('handleWebhook', () => {
    it('paid: помечает заказ оплаченным и мержит metadata провайдера', async () => {
      const { service, yookassa, ordersRepository } = makeService();
      yookassa.handleWebhook.mockResolvedValue({
        kind: 'paid',
        providerTxnId: TXN_ID,
        metadata: { paymentId: TXN_ID },
      });
      ordersRepository.findByPaymentProviderTxnId.mockResolvedValue(
        makeOrder({ id: ORDER_ID }),
      );

      const result = await service.handleWebhook(
        'yookassa',
        JSON.stringify({
          event: 'payment.succeeded',
          object: { id: TXN_ID },
        }),
        {},
        {},
      );

      expect(ordersRepository.updateFields).toHaveBeenCalledWith(ORDER_ID, {
        paymentStatus: 'paid' as PaymentStatus,
        paymentMetadata: { orderId: ORDER_ID, paymentId: TXN_ID },
      });
      expect(result).toEqual({ ok: true, orderId: ORDER_ID });
    });

    it('failed: помечает заказ failed и сохраняет причину', async () => {
      const { service, yookassa, ordersRepository } = makeService();
      yookassa.handleWebhook.mockResolvedValue({
        kind: 'failed',
        providerTxnId: TXN_ID,
        reason: 'payment.canceled',
      });
      ordersRepository.findByPaymentProviderTxnId.mockResolvedValue(
        makeOrder(),
      );

      await service.handleWebhook('yookassa', '{}', {}, {});

      expect(ordersRepository.updateFields).toHaveBeenCalledWith(ORDER_ID, {
        paymentStatus: 'failed' as PaymentStatus,
        paymentMetadata: { orderId: ORDER_ID, failReason: 'payment.canceled' },
      });
    });

    it('refunded: помечает заказ refunded', async () => {
      const { service, yookassa, ordersRepository } = makeService();
      yookassa.handleWebhook.mockResolvedValue({
        kind: 'refunded',
        providerTxnId: TXN_ID,
      });
      ordersRepository.findByPaymentProviderTxnId.mockResolvedValue(
        makeOrder(),
      );

      await service.handleWebhook('yookassa', '{}', {}, {});

      expect(ordersRepository.updateFields).toHaveBeenCalledWith(ORDER_ID, {
        paymentStatus: 'refunded' as PaymentStatus,
      });
    });

    it('ignored: заказ не ищется и не обновляется', async () => {
      const { service, yookassa, ordersRepository } = makeService();
      yookassa.handleWebhook.mockResolvedValue({
        kind: 'ignored',
        reason: 'unhandled event',
      });

      const result = await service.handleWebhook('yookassa', '{}', {}, {});

      expect(result).toEqual({ ok: true });
      expect(
        ordersRepository.findByPaymentProviderTxnId,
      ).not.toHaveBeenCalled();
      expect(ordersRepository.updateFields).not.toHaveBeenCalled();
    });

    it('txnId без заказа: ok без исключения (провайдер получит 200)', async () => {
      const { service, yookassa, ordersRepository } = makeService();
      yookassa.handleWebhook.mockResolvedValue({
        kind: 'paid',
        providerTxnId: TXN_ID,
      });
      ordersRepository.findByPaymentProviderTxnId.mockResolvedValue(null);

      const result = await service.handleWebhook('yookassa', '{}', {}, {});

      expect(result).toEqual({ ok: true });
      expect(ordersRepository.updateFields).not.toHaveBeenCalled();
    });

    it('незарегистрированный провайдер → NotFoundException', async () => {
      const { service } = makeService();

      await expect(service.handleWebhook('stripe', '{}', {}, {})).rejects.toThrow(
        /Unknown payment provider/,
      );
    });
  });
});
