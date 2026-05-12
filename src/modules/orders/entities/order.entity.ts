import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';
import { User, Address } from '@/modules/users/entities/user.entity';
import { OrderItemEntity } from './order-item.entity';

export enum OrderStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

/** @deprecated Use OrderItemEntity instead. Kept for backward compatibility during migration. */
export interface OrderItem {
  productId: string;
  variantId: string;
  name: string;
  sku: string;
  image: string;
  size: string;
  color: string;
  price: number;
  quantity: number;
  total: number;
}

export interface OrderHistory {
  status: OrderStatus;
  comment?: string;
  createdAt: Date;
  createdBy?: string;
}

@Entity('orders')
export class Order extends BaseEntity {
  @Column({ unique: true })
  orderNumber: string;

  @Index()
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user?: User;

  @OneToMany(() => OrderItemEntity, (item) => item.order, { cascade: true })
  items: OrderItemEntity[];

  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => parseFloat(v) || 0,
    },
  })
  subtotal: number;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    default: 0,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => parseFloat(v) || 0,
    },
  })
  discount: number;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => parseFloat(v) || 0,
    },
  })
  shipping: number;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => parseFloat(v) || 0,
    },
  })
  total: number;

  @Index()
  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column('jsonb')
  shippingAddress: Address;

  @Column()
  shippingMethod: string;

  @Column()
  paymentMethod: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  paymentStatus: PaymentStatus;

  @Column({ nullable: true })
  promoCode?: string;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: {
      to: (v: number | null) => v,
      from: (v: string | null) => (v === null ? null : parseFloat(v) || 0),
    },
  })
  promoDiscount?: number;

  @Column({ nullable: true })
  customerNote?: string;

  @Column({ nullable: true })
  adminNote?: string;

  @Column('jsonb', { default: [] })
  history: OrderHistory[];

  /**
   * ID транзакции у платёжного провайдера (yookassa/stripe/...).
   * Используется в webhook-обработчике для поиска заказа по callback'у.
   */
  @Index()
  @Column({ nullable: true })
  paymentProviderTxnId?: string;

  /**
   * Provider-specific метаданные оплаты: confirmation_url, capture_method,
   * последний raw-payload webhook'а и т.п.
   *
   * Тип `any` сознательный: это произвольный JSONB без фиксированной схемы;
   * `Record<string, unknown>` ломает TypeORM `_QueryDeepPartialEntity` через
   * каскад items[] → order → paymentMetadata.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  @Column('jsonb', { default: {} })
  paymentMetadata: Record<string, any>;
}
