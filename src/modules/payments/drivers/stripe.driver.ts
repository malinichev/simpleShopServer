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
 * Stripe provider — STUB.
 *
 * Driver регистрируется в DI только если задан `STRIPE_SECRET_KEY`.
 * На момент v1.0 шаблона — заготовка интерфейса.
 *
 * # Как доинтегрировать (для шаблон-юзера)
 *
 * 1. `pnpm add stripe`.
 * 2. В `initialize()`:
 *    - создать Stripe.checkout.sessions с line_items из `input.order.items`,
 *      `mode: 'payment'`, `success_url`/`cancel_url` из `input.returnUrl`,
 *      `metadata: { orderId: input.order.id }`.
 *    - вернуть `{ status: 'redirect_required', redirectUrl: session.url, providerTxnId: session.id }`.
 * 3. В `handleWebhook()`:
 *    - проверить подпись: `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)`.
 *    - распарсить `event.type === 'checkout.session.completed' | 'payment_intent.payment_failed'`.
 *    - вернуть `{ kind: 'paid' | 'failed', providerTxnId, metadata }`.
 *
 * NB: для verify подписи controller должен передавать **raw body**
 * (см. `payments.controller.ts` — `@RawBody()` или middleware с
 * `bodyParser.raw({ type: 'application/json' })` на /payments/stripe/webhook).
 *
 * @see https://stripe.com/docs/api
 */
@Injectable()
export class StripePaymentDriver implements PaymentDriver {
  private readonly logger = new Logger(StripePaymentDriver.name);
  readonly provider = PaymentProvider.STRIPE;

  constructor(private readonly _configService: ConfigService) {}

  async initialize(
    input: InitializePaymentInput,
  ): Promise<InitializePaymentResult> {
    this.logger.warn(
      `Stripe.initialize() called for order ${input.order.orderNumber} but driver is a stub`,
    );
    throw new NotImplementedException(
      'Stripe driver is a stub. См. server/src/modules/payments/drivers/stripe.driver.ts',
    );
  }

  async handleWebhook(_ctx: WebhookContext): Promise<WebhookOutcome> {
    this.logger.warn('Stripe.handleWebhook() called but driver is a stub');
    return { kind: 'ignored', reason: 'Stripe driver not implemented (stub)' };
  }
}
