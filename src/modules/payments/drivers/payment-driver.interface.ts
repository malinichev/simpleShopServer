import { PaymentProvider } from '@/modules/settings/entities/payment-method.entity';
import { Order } from '@/modules/orders/entities/order.entity';

export interface InitializePaymentInput {
  order: Order;
  /** `payment_methods.config` — provider-specific настройки от admin'а. */
  methodConfig: Record<string, unknown>;
  /** Куда вернуть пользователя после оплаты (success/fail на клиенте). */
  returnUrl: string;
}

export type PaymentInitStatus = 'pending' | 'paid' | 'redirect_required';

export interface InitializePaymentResult {
  status: PaymentInitStatus;
  /** Если status = 'redirect_required' — клиента надо отправить сюда. */
  redirectUrl?: string;
  /** ID транзакции у провайдера; пишется в orders.paymentProviderTxnId. */
  providerTxnId?: string;
  /** Произвольные данные для orders.paymentMetadata. */
  metadata?: Record<string, unknown>;
}

export interface WebhookContext {
  rawBody: Buffer | string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
}

export type WebhookOutcome =
  | { kind: 'paid'; providerTxnId: string; metadata?: Record<string, unknown> }
  | { kind: 'failed'; providerTxnId: string; reason?: string }
  | { kind: 'refunded'; providerTxnId: string }
  | { kind: 'ignored'; reason?: string };

/**
 * Single interface for all payment providers.
 *
 * Реализации:
 *  - `manual.driver.ts`        — default. Order создаётся в PENDING, оплата вне системы.
 *  - `yookassa.driver.ts`      — stub. Реальная интеграция дописывается шаблон-юзером.
 *  - `stripe.driver.ts`        — stub.
 *  - `cloudpayments.driver.ts` — stub.
 *
 * Регистрация условная (см. `payments.module.ts`): driver попадает в registry
 * только если заданы соответствующие env-credentials. `manual` всегда есть.
 */
export interface PaymentDriver {
  readonly provider: PaymentProvider;

  /** Инициализирует оплату при создании заказа. */
  initialize(input: InitializePaymentInput): Promise<InitializePaymentResult>;

  /**
   * Обрабатывает входящий webhook от провайдера. Должен:
   *  1. Проверить подпись (`verifyWebhook` логика внутри).
   *  2. Распознать тип события (paid/failed/refunded).
   *  3. Вернуть `WebhookOutcome` для дальнейшего применения к order'у.
   *
   * Возвращает `kind: 'ignored'` для не-обрабатываемых событий
   * (ping'и, события не-наших заказов и т.п.) — сервис не дёргает order.
   */
  handleWebhook(ctx: WebhookContext): Promise<WebhookOutcome>;
}

export const PAYMENT_DRIVERS = Symbol('PAYMENT_DRIVERS');
