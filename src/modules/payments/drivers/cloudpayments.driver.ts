import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider } from '@/modules/settings/entities/payment-method.entity';
import {
  InitializePaymentInput,
  InitializePaymentResult,
  PaymentDriver,
  WebhookContext,
  WebhookOutcome,
} from './payment-driver.interface';

/**
 * CloudPayments provider — STUB.
 *
 * Driver регистрируется в DI только если задан `CLOUDPAYMENTS_PUBLIC_ID`.
 * Альтернатива YooKassa для российского рынка с iframe-виджетом
 * (вместо redirect'а).
 *
 * # Как доинтегрировать
 *
 * 1. На клиенте — подключить cp.js, открыть widget с amount, currency,
 *    invoiceId = order.orderNumber. На бэке init возвращает `status: 'pending'`
 *    (без redirect'а).
 * 2. После успешной оплаты CloudPayments шлёт `Pay`-webhook с HMAC-SHA256
 *    подписью в header `Content-HMAC` (секрет — API_SECRET в env).
 * 3. В `handleWebhook()`:
 *    - проверить HMAC.
 *    - распарсить InvoiceId → order, TransactionId → providerTxnId.
 *    - вернуть `{ kind: 'paid', providerTxnId, metadata }`.
 *
 * @see https://developers.cloudpayments.ru/
 */
@Injectable()
export class CloudPaymentsDriver implements PaymentDriver {
  private readonly logger = new Logger(CloudPaymentsDriver.name);
  readonly provider = PaymentProvider.CLOUDPAYMENTS;

  constructor(private readonly _configService: ConfigService) {}

  async initialize(
    input: InitializePaymentInput,
  ): Promise<InitializePaymentResult> {
    this.logger.warn(
      `CloudPayments.initialize() called for order ${input.order.orderNumber} but driver is a stub`,
    );
    throw new NotImplementedException(
      'CloudPayments driver is a stub. См. server/src/modules/payments/drivers/cloudpayments.driver.ts',
    );
  }

  async handleWebhook(_ctx: WebhookContext): Promise<WebhookOutcome> {
    this.logger.warn(
      'CloudPayments.handleWebhook() called but driver is a stub',
    );
    return {
      kind: 'ignored',
      reason: 'CloudPayments driver not implemented (stub)',
    };
  }
}
