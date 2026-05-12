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
 * YooKassa provider — STUB.
 *
 * Driver регистрируется в DI только если заданы `YOOKASSA_SHOP_ID` и
 * `YOOKASSA_SECRET_KEY`. На момент v1.0 шаблона тут только заготовка интерфейса.
 *
 * # Как доинтегрировать (для шаблон-юзера)
 *
 * 1. `pnpm add @a2seven/yoo-checkout` (или fetch'ом по `https://api.yookassa.ru/v3/payments`).
 * 2. В `initialize()`:
 *    - создать YooKassa.Payment с amount = `input.order.total`, currency = `RUB`,
 *      `confirmation: { type: 'redirect', return_url: input.returnUrl }`,
 *      `metadata: { orderId: input.order.id }`.
 *    - вернуть `{ status: 'redirect_required', redirectUrl: payment.confirmation.confirmation_url, providerTxnId: payment.id }`.
 *    - чек по 54-ФЗ: проставить `receipt` если в `methodConfig` указано.
 * 3. В `handleWebhook()`:
 *    - проверить `Authorization` header (Basic shop_id:secret_key) или whitelist IP.
 *    - распарсить `event === 'payment.succeeded' | 'payment.canceled'`.
 *    - вернуть `{ kind: 'paid' | 'failed', providerTxnId: object.id, metadata: { ... } }`.
 *
 * @see https://yookassa.ru/developers/api
 */
@Injectable()
export class YooKassaPaymentDriver implements PaymentDriver {
  private readonly logger = new Logger(YooKassaPaymentDriver.name);
  readonly provider = PaymentProvider.YOOKASSA;

  constructor(private readonly _configService: ConfigService) {}

  async initialize(
    input: InitializePaymentInput,
  ): Promise<InitializePaymentResult> {
    this.logger.warn(
      `YooKassa.initialize() called for order ${input.order.orderNumber} but driver is a stub`,
    );
    throw new NotImplementedException(
      'YooKassa driver is a stub. См. server/src/modules/payments/drivers/yookassa.driver.ts',
    );
  }

  async handleWebhook(_ctx: WebhookContext): Promise<WebhookOutcome> {
    this.logger.warn('YooKassa.handleWebhook() called but driver is a stub');
    return {
      kind: 'ignored',
      reason: 'YooKassa driver not implemented (stub)',
    };
  }
}
