import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';

/**
 * Provider, через который проводится оплата.
 *
 * `manual` (default) — без онлайн-шлюза: order создаётся в `paymentStatus=PENDING`,
 *  оплата принимается вне системы, статус выставляется admin'ом вручную.
 *
 * Прочие — онлайн-шлюзы. Регистрация driver'ов условная по env (см.
 * `payments/drivers/index.ts`); `yookassa` — реальная интеграция,
 * `stripe`/`cloudpayments` — stub'ы.
 */
export enum PaymentProvider {
  MANUAL = 'manual',
  YOOKASSA = 'yookassa',
  STRIPE = 'stripe',
  CLOUDPAYMENTS = 'cloudpayments',
}

@Entity('payment_methods')
export class PaymentMethod extends BaseEntity {
  @Column()
  name: string;

  @Column({ default: '' })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @Index()
  @Column({ default: 0 })
  order: number;

  @Column({
    type: 'enum',
    enum: PaymentProvider,
    default: PaymentProvider.MANUAL,
  })
  provider: PaymentProvider;

  /**
   * Provider-specific config (например, yookassa receipt-template).
   * Тип `any` — произвольный JSONB, чтобы не ломать TypeORM partial types.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  @Column('jsonb', { default: {} })
  config: Record<string, any>;
}
