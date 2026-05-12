import { Injectable } from '@nestjs/common';
import { PaymentProvider } from '@/modules/settings/entities/payment-method.entity';
import {
  InitializePaymentInput,
  InitializePaymentResult,
  PaymentDriver,
  WebhookContext,
  WebhookOutcome,
} from './payment-driver.interface';

/**
 * Manual provider — без онлайн-шлюза. Order создаётся в `PENDING`,
 * оплата принимается вне системы (наличные при доставке, банковский перевод
 * по реквизитам, СБП через QR из админки и т.п.). Status выставляется admin'ом.
 *
 * Webhook'ов не имеет — `handleWebhook` всегда `ignored`.
 *
 * Driver всегда зарегистрирован — это default fallback.
 */
@Injectable()
export class ManualPaymentDriver implements PaymentDriver {
  readonly provider = PaymentProvider.MANUAL;

  async initialize(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _input: InitializePaymentInput,
  ): Promise<InitializePaymentResult> {
    return { status: 'pending' };
  }

  async handleWebhook(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _ctx: WebhookContext,
  ): Promise<WebhookOutcome> {
    return { kind: 'ignored', reason: 'manual provider has no webhook' };
  }
}
