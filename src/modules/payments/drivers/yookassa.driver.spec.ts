import { ConfigService } from '@nestjs/config';
import type { Order } from '@/modules/orders/entities/order.entity';
import { YooKassaPaymentDriver } from './yookassa.driver';

/**
 * Спецификация YooKassa-драйвера. Швы: публичные методы драйвера
 * (initialize / handleWebhook), внешнее HTTP мокается через global.fetch.
 * Фикстуры ответов соответствуют формату https://api.yookassa.ru/v3.
 */

const SHOP_ID = '123456';
const SECRET_KEY = 'test_ThisIsNotARealSecretKey';

const API_BASE = 'https://api.yookassa.ru/v3';

function makeConfig(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    'payments.yookassa.shopId': SHOP_ID,
    'payments.yookassa.secretKey': SECRET_KEY,
    ...overrides,
  };
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

function makeOrder(partial: Partial<Order> = {}): Order {
  return {
    id: '0d0d9a2e-f6ad-4b8c-9e91-36cf99a3dd60',
    orderNumber: 'SV-2026-0001',
    total: 4790,
    ...partial,
  } as Order;
}

type FetchCall = { url: string | URL; init?: RequestInit };

function mockFetch(responses: Array<{ ok: boolean; status: number; body: unknown }>) {
  const calls: FetchCall[] = [];
  const impl = jest.fn(async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const response = responses[Math.min(calls.length - 1, responses.length - 1)];
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.body,
    } as Response;
  });
  jest.spyOn(global, 'fetch').mockImplementation(impl);
  return { calls };
}

const PAYMENT_ID = '2b0e86a0-000f-5000-9000-105e8ff2e2b6';
const CONFIRMATION_URL =
  'https://yoomoney.ru/checkout/payments/v2/contract?orderId=2b0e86a0-000f-5000-9000-105e8ff2e2b6';

/** Ответ POST /v3/payments (см. https://yookassa.ru/developers/api#create_payment) */
function yooPaymentResponse(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: PAYMENT_ID,
    status,
    paid: status === 'succeeded',
    amount: { value: '4790.00', currency: 'RUB' },
    confirmation: { type: 'redirect', confirmation_url: CONFIRMATION_URL },
    metadata: { orderId: '0d0d9a2e-f6ad-4b8c-9e91-36cf99a3dd60' },
    ...extra,
  };
}

describe('YooKassaPaymentDriver', () => {
  let driver: YooKassaPaymentDriver;

  beforeEach(() => {
    jest.restoreAllMocks();
    driver = new YooKassaPaymentDriver(makeConfig());
  });

  describe('initialize', () => {
    it('создаёт платёж через POST /v3/payments и возвращает redirect_required', async () => {
      const { calls } = mockFetch([
        { ok: true, status: 200, body: yooPaymentResponse('pending') },
      ]);

      const result = await driver.initialize({
        order: makeOrder(),
        methodConfig: {},
        returnUrl: 'https://svoybrand.shop/checkout/success?orderNumber=SV-2026-0001',
      });

      // Один HTTP-вызов: создание платежа
      expect(calls).toHaveLength(1);
      const [call] = calls;
      expect(call.url).toBe(`${API_BASE}/payments`);

      const init = call.init as RequestInit & { headers: Record<string, string> };
      expect(init.method).toBe('POST');
      // Basic-авторизация shopId:secretKey
      expect(init.headers.Authorization).toBe(
        `Basic ${Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64')}`,
      );
      // Идемпотентность обязательна для YooKassa API
      expect(init.headers['Idempotence-Key']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );

      const body = JSON.parse(String(init.body));
      expect(body.amount).toEqual({ value: '4790.00', currency: 'RUB' });
      expect(body.capture).toBe(true);
      expect(body.confirmation).toEqual({
        type: 'redirect',
        return_url: 'https://svoybrand.shop/checkout/success?orderNumber=SV-2026-0001',
      });
      expect(body.metadata).toEqual({
        orderId: '0d0d9a2e-f6ad-4b8c-9e91-36cf99a3dd60',
      });

      expect(result).toEqual({
        status: 'redirect_required',
        redirectUrl: CONFIRMATION_URL,
        providerTxnId: PAYMENT_ID,
        metadata: {
          orderId: '0d0d9a2e-f6ad-4b8c-9e91-36cf99a3dd60',
          paymentId: PAYMENT_ID,
        },
      });
    });

    it('базовый URL API конфигурируется (payments.yookassa.apiUrl / YOOKASSA_API_URL) — эмуляция для e2e', async () => {
      // Локальный эмулятор YooKassa (e2e) подменяет api.yookassa.ru,
      // чтобы гонять реальный драйвер без внешних сетей и боевых ключей.
      const emulator = new YooKassaPaymentDriver(
        makeConfig({ 'payments.yookassa.apiUrl': 'http://localhost:4010/v3' }),
      );
      const { calls } = mockFetch([
        { ok: true, status: 200, body: yooPaymentResponse('pending') },
      ]);

      await emulator.initialize({
        order: makeOrder(),
        methodConfig: {},
        returnUrl: 'https://svoybrand.shop/checkout/success',
      });

      expect(calls[0].url).toBe('http://localhost:4010/v3/payments');
    });

    it('прокидывает ошибку, если YooKassa API отклонил запрос', async () => {
      mockFetch([
        {
          ok: false,
          status: 400,
          body: {
            description: 'Invalid request',
            errorCode: 'invalid_request',
          },
        },
      ]);

      await expect(
        driver.initialize({
          order: makeOrder(),
          methodConfig: {},
          returnUrl: 'https://svoybrand.shop/checkout/success',
        }),
      ).rejects.toThrow(/YooKassa.*400|invalid_request/i);
    });
  });

  describe('handleWebhook', () => {
    it('payment.succeeded: верифицирует платёж через GET и возвращает paid', async () => {
      const { calls } = mockFetch([
        // GET-верификация статуса по официальной рекомендации YooKassa
        { ok: true, status: 200, body: yooPaymentResponse('succeeded') },
      ]);

      const outcome = await driver.handleWebhook({
        rawBody: JSON.stringify({
          type: 'notification',
          event: 'payment.succeeded',
          object: { id: PAYMENT_ID, status: 'succeeded' },
        }),
        headers: { 'content-type': 'application/json' },
        query: {},
      });

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(`${API_BASE}/payments/${PAYMENT_ID}`);
      expect(calls[0].init?.method).toBe('GET');
      const init = calls[0].init as RequestInit & { headers: Record<string, string> };
      expect(init.headers.Authorization).toContain('Basic ');

      expect(outcome).toEqual({
        kind: 'paid',
        providerTxnId: PAYMENT_ID,
        metadata: {
          orderId: '0d0d9a2e-f6ad-4b8c-9e91-36cf99a3dd60',
          paymentId: PAYMENT_ID,
        },
      });
    });

    it('не доверяет телу вебхука: статус из API не succeeded — ignored', async () => {
      mockFetch([
        // Тело вебхука говорит succeeded, но API отдаёт pending — не засчитываем
        { ok: true, status: 200, body: yooPaymentResponse('pending') },
      ]);

      const outcome = await driver.handleWebhook({
        rawBody: JSON.stringify({
          type: 'notification',
          event: 'payment.succeeded',
          object: { id: PAYMENT_ID, status: 'succeeded' },
        }),
        headers: {},
        query: {},
      });

      expect(outcome).toEqual({ kind: 'ignored', reason: expect.any(String) });
    });

    it('payment.canceled: API подтверждает canceled — failed', async () => {
      mockFetch([
        { ok: true, status: 200, body: yooPaymentResponse('canceled') },
      ]);

      const outcome = await driver.handleWebhook({
        rawBody: JSON.stringify({
          type: 'notification',
          event: 'payment.canceled',
          object: { id: PAYMENT_ID, status: 'canceled' },
        }),
        headers: {},
        query: {},
      });

      expect(outcome).toEqual({
        kind: 'failed',
        providerTxnId: PAYMENT_ID,
        reason: 'payment.canceled',
      });
    });

    it('refund.succeeded: верифицирует рефанд и возвращает refunded по payment_id', async () => {
      const REFUND_ID = '2d0e86a0-000f-5000-9000-105e8ff2e2b6';
      const { calls } = mockFetch([
        {
          ok: true,
          status: 200,
          body: {
            id: REFUND_ID,
            status: 'succeeded',
            payment_id: PAYMENT_ID,
            amount: { value: '4790.00', currency: 'RUB' },
          },
        },
      ]);

      const outcome = await driver.handleWebhook({
        rawBody: JSON.stringify({
          type: 'notification',
          event: 'refund.succeeded',
          object: { id: REFUND_ID, status: 'succeeded' },
        }),
        headers: {},
        query: {},
      });

      expect(calls[0].url).toBe(`${API_BASE}/refunds/${REFUND_ID}`);
      expect(outcome).toEqual({
        kind: 'refunded',
        providerTxnId: PAYMENT_ID,
      });
    });

    it('битый JSON тела — ignored', async () => {
      const { calls } = mockFetch([]);

      const outcome = await driver.handleWebhook({
        rawBody: 'not-json{',
        headers: {},
        query: {},
      });

      expect(calls).toHaveLength(0);
      expect(outcome.kind).toBe('ignored');
    });

    it('неизвестный event — ignored, без обращения к API', async () => {
      const { calls } = mockFetch([]);

      const outcome = await driver.handleWebhook({
        rawBody: JSON.stringify({
          type: 'notification',
          event: 'payment.waiting_for_capture',
          object: { id: PAYMENT_ID },
        }),
        headers: {},
        query: {},
      });

      expect(calls).toHaveLength(0);
      expect(outcome.kind).toBe('ignored');
    });
  });
});
