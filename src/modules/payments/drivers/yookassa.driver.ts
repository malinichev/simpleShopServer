import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PaymentProvider } from '@/modules/settings/entities/payment-method.entity';
import {
  InitializePaymentInput,
  InitializePaymentResult,
  PaymentDriver,
  WebhookContext,
  WebhookOutcome,
} from './payment-driver.interface';

/** https://yookassa.ru/developers/api */
const YOOKASSA_API_BASE = 'https://api.yookassa.ru/v3';

interface YooKassaConfirmation {
  type: string;
  confirmation_url?: string;
}

interface YooKassaPayment {
  id: string;
  status: string;
  paid?: boolean;
  confirmation?: YooKassaConfirmation;
  metadata?: Record<string, unknown>;
}

interface YooKassaRefund {
  id: string;
  status: string;
  payment_id: string;
}

/**
 * YooKassa driver (https://api.yookassa.ru/v3).
 *
 * Активируется env-переменными `YOOKASSA_SHOP_ID` + `YOOKASSA_SECRET_KEY`
 * (см. drivers/index.ts → createPaymentDrivers).
 *
 * Безопасность вебхуков: YooKassa не подписывает уведомления, поэтому статус
 * НЕ берётся из тела запроса — драйвер верифицирует платёж/рефанд повторным
 * GET-запросом к API с Basic-авторизацией (официальная рекомендация YooKassa).
 *
 * Чеки 54-ФЗ: `receipt` в платеже не передаётся (v1) — фискализация на
 * стороне магазина. При передаче на YooKassa добавить receipt в initialize()
 * из methodConfig.
 */
@Injectable()
export class YooKassaPaymentDriver implements PaymentDriver {
  private readonly logger = new Logger(YooKassaPaymentDriver.name);
  readonly provider = PaymentProvider.YOOKASSA;

  constructor(private readonly configService: ConfigService) {}

  private authHeader(): string {
    const shopId = this.configService.get<string>('payments.yookassa.shopId');
    const secretKey = this.configService.get<string>(
      'payments.yookassa.secretKey',
    );
    return `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString('base64')}`;
  }

  private async api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${YOOKASSA_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
        'Idempotence-Key': randomUUID(),
        ...init?.headers,
      },
    });

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const description =
        (body as { description?: string } | null)?.description ??
        JSON.stringify(body);
      // Пробрасываем — PaymentsService.initializeForOrder оставит заказ PENDING,
      // а вебхук вернёт 5xx и YooKassa повторит доставку уведомления.
      throw new Error(
        `YooKassa API ${path} → ${response.status}: ${description}`,
      );
    }
    return body as T;
  }

  async initialize(
    input: InitializePaymentInput,
  ): Promise<InitializePaymentResult> {
    const payment = await this.api<YooKassaPayment>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        amount: { value: input.order.total.toFixed(2), currency: 'RUB' },
        capture: true,
        confirmation: { type: 'redirect', return_url: input.returnUrl },
        description: `Заказ ${input.order.orderNumber}`,
        metadata: { orderId: input.order.id },
      }),
    });

    const confirmationUrl = payment?.confirmation?.confirmation_url;
    if (!payment?.id || !confirmationUrl) {
      throw new Error(
        'YooKassa: unexpected create-payment response (no id / confirmation_url)',
      );
    }

    return {
      status: 'redirect_required',
      redirectUrl: confirmationUrl,
      providerTxnId: payment.id,
      metadata: { ...(payment.metadata ?? {}), paymentId: payment.id },
    };
  }

  async handleWebhook(ctx: WebhookContext): Promise<WebhookOutcome> {
    const raw =
      typeof ctx.rawBody === 'string'
        ? ctx.rawBody
        : ctx.rawBody.toString('utf8');

    let notification: { event?: string; object?: { id?: string } };
    try {
      notification = JSON.parse(raw);
    } catch {
      return { kind: 'ignored', reason: 'invalid json body' };
    }

    const objectId = notification?.object?.id;
    if (!objectId) {
      return { kind: 'ignored', reason: 'notification without object.id' };
    }

    switch (notification.event) {
      case 'payment.succeeded':
        return this.verifyPayment(objectId, 'succeeded');
      case 'payment.canceled':
        return this.verifyPayment(objectId, 'canceled');
      case 'refund.succeeded':
        return this.verifyRefund(objectId);
      default:
        return {
          kind: 'ignored',
          reason: `unhandled event: ${notification.event ?? '<none>'}`,
        };
    }
  }

  /** Перепроверяет статус платежа в API — телу уведомления не доверяем. */
  private async verifyPayment(
    paymentId: string,
    expectedStatus: 'succeeded' | 'canceled',
  ): Promise<WebhookOutcome> {
    const payment = await this.api<YooKassaPayment>(`/payments/${paymentId}`, {
      method: 'GET',
    });

    if (payment.status !== expectedStatus) {
      this.logger.warn(
        `Webhook claims payment.${expectedStatus}, API reports status="${payment.status}" for ${paymentId} — ignoring`,
      );
      return {
        kind: 'ignored',
        reason: `api status mismatch: ${payment.status}`,
      };
    }

    if (expectedStatus === 'succeeded') {
      return {
        kind: 'paid',
        providerTxnId: payment.id,
        metadata: { ...(payment.metadata ?? {}), paymentId: payment.id },
      };
    }
    return {
      kind: 'failed',
      providerTxnId: payment.id,
      reason: 'payment.canceled',
    };
  }

  private async verifyRefund(refundId: string): Promise<WebhookOutcome> {
    const refund = await this.api<YooKassaRefund>(`/refunds/${refundId}`, {
      method: 'GET',
    });

    if (refund.status !== 'succeeded') {
      return {
        kind: 'ignored',
        reason: `refund api status mismatch: ${refund.status}`,
      };
    }

    // Заказ связан с платежом (orders.paymentProviderTxnId), а не с рефандом
    return { kind: 'refunded', providerTxnId: refund.payment_id };
  }
}
