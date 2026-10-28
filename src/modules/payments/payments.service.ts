import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PAYMENT_DRIVERS,
  PaymentDriver,
} from './drivers/payment-driver.interface';
import {
  PaymentMethod,
  PaymentProvider,
} from '@/modules/settings/entities/payment-method.entity';
import { Order, PaymentStatus } from '@/modules/orders/entities/order.entity';
import { OrdersRepository } from '@/modules/orders/orders.repository';

export interface InitializeOrderPaymentResult {
  status: 'pending' | 'paid' | 'redirect_required';
  redirectUrl?: string;
  providerTxnId?: string;
}

function providerFromString(ref: string): PaymentProvider {
  const known = Object.values(PaymentProvider) as string[];
  return known.includes(ref) ? (ref as PaymentProvider) : PaymentProvider.MANUAL;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly driverByProvider: Map<PaymentProvider, PaymentDriver>;

  constructor(
    @Inject(PAYMENT_DRIVERS) drivers: PaymentDriver[],
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodRepo: Repository<PaymentMethod>,
    @Inject(forwardRef(() => OrdersRepository))
    private readonly ordersRepository: OrdersRepository,
    private readonly configService: ConfigService,
  ) {
    this.driverByProvider = new Map(drivers.map((d) => [d.provider, d]));
  }

  getEnabledProviders(): PaymentProvider[] {
    return Array.from(this.driverByProvider.keys());
  }

  /** Резолвит payment_method (по id или по provider-name) и возвращает driver. */
  private async resolveMethod(
    paymentMethodRef: string,
  ): Promise<{ method: PaymentMethod | null; driver: PaymentDriver }> {
    // paymentMethodRef может быть либо UUID (метод из БД), либо строкой-провайдером
    // (legacy: фронт раньше слал 'card', 'cash' и т.п. напрямую).
    let method: PaymentMethod | null = null;
    if (/^[0-9a-f-]{36}$/i.test(paymentMethodRef)) {
      method = await this.paymentMethodRepo.findOne({
        where: { id: paymentMethodRef },
      });
    }

    // Строка-провайдер ('yookassa') резолвится напрямую; неизвестные legacy-строки
    // ('card', 'cash' из старого фронта) — безопасный fallback в manual.
    const provider = method?.provider ?? providerFromString(paymentMethodRef);
    const driver = this.driverByProvider.get(provider);
    if (!driver) {
      throw new BadRequestException(
        `Payment provider "${provider}" не зарегистрирован (см. env: ${provider.toUpperCase()}_*)`,
      );
    }
    return { method, driver };
  }

  /**
   * Запускается из OrdersService.create после сохранения заказа.
   * Применяет результат driver'а к order'у (paymentProviderTxnId, paymentMetadata, paymentStatus).
   */
  async initializeForOrder(
    order: Order,
    paymentMethodRef: string,
  ): Promise<InitializeOrderPaymentResult> {
    const returnUrl = `${this.configService.get<string>('webUrl')}/checkout/success?orderNumber=${encodeURIComponent(order.orderNumber)}`;

    try {
      // resolveMethod внутри try: провайдер может быть не зарегистрирован
      // (метод остался в БД, а env-ключи не заданы) — это тоже «оплата не
      // инициализирована», а не причина ронять уже созданный заказ.
      const { method, driver } = await this.resolveMethod(paymentMethodRef);
      const result = await driver.initialize({
        order,
        methodConfig: method?.config ?? {},
        returnUrl,
      });

      const updates: Partial<Order> = {};
      if (result.providerTxnId) {
        updates.paymentProviderTxnId = result.providerTxnId;
      }
      if (result.metadata) {
        updates.paymentMetadata = result.metadata;
      }
      if (result.status === 'paid') {
        updates.paymentStatus = PaymentStatus.PAID;
      }
      if (Object.keys(updates).length > 0) {
        await this.ordersRepository.updateFields(order.id, updates);
      }

      return {
        status: result.status,
        redirectUrl: result.redirectUrl,
        providerTxnId: result.providerTxnId,
      };
    } catch (error) {
      this.logger.error(
        `Payment initialize failed for order ${order.orderNumber} (${paymentMethodRef}): ${(error as Error).message}`,
      );
      // Заказ создан, но оплата не инициализирована — оставляем PENDING,
      // чтобы admin мог обработать вручную. Не throw'аем — иначе откатится order.
      return { status: 'pending' };
    }
  }

  /** Вызывается из контроллера webhook'а. */
  async handleWebhook(
    provider: string,
    rawBody: Buffer | string,
    headers: Record<string, string | string[] | undefined>,
    query: Record<string, unknown>,
  ): Promise<{ ok: boolean; orderId?: string }> {
    const driver = this.driverByProvider.get(provider as PaymentProvider);
    if (!driver) {
      throw new NotFoundException(`Unknown payment provider: ${provider}`);
    }

    const outcome = await driver.handleWebhook({ rawBody, headers, query });

    if (outcome.kind === 'ignored') {
      return { ok: true };
    }

    const order = await this.ordersRepository.findByPaymentProviderTxnId(
      outcome.providerTxnId,
    );
    if (!order) {
      this.logger.warn(
        `Webhook ${provider}: no order found for txnId=${outcome.providerTxnId}`,
      );
      return { ok: true };
    }

    if (outcome.kind === 'paid') {
      await this.ordersRepository.updateFields(order.id, {
        paymentStatus: PaymentStatus.PAID,
        paymentMetadata: {
          ...order.paymentMetadata,
          ...(outcome.metadata ?? {}),
        },
      });
    } else if (outcome.kind === 'failed') {
      await this.ordersRepository.updateFields(order.id, {
        paymentStatus: PaymentStatus.FAILED,
        paymentMetadata: {
          ...order.paymentMetadata,
          failReason: outcome.reason,
        },
      });
    } else if (outcome.kind === 'refunded') {
      await this.ordersRepository.updateFields(order.id, {
        paymentStatus: PaymentStatus.REFUNDED,
      });
    }

    return { ok: true, orderId: order.id };
  }
}
