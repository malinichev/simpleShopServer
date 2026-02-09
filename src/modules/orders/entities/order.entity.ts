import { Entity, Column, Index } from 'typeorm';
import { ObjectId } from 'mongodb';
import { BaseEntity } from '@/common/entities/base.entity';
import type { Address } from '@/modules/users/entities/user.entity';

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

export interface OrderItem {
  productId: ObjectId;
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
  createdBy?: ObjectId;
}

@Entity('orders')
export class Order extends BaseEntity {
  @Column({ unique: true })
  orderNumber: string;

  @Index()
  @Column()
  userId: ObjectId;

  @Column('json')
  items: OrderItem[];

  @Column('decimal')
  subtotal: number;

  @Column('decimal', { default: 0 })
  discount: number;

  @Column('decimal')
  shipping: number;

  @Column('decimal')
  total: number;

  @Index()
  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column('json')
  shippingAddress: Address;

  @Column()
  shippingMethod: string;

  @Column()
  paymentMethod: string;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
  paymentStatus: PaymentStatus;

  @Column({ nullable: true })
  promoCode?: string;

  @Column('decimal', { nullable: true })
  promoDiscount?: number;

  @Column({ nullable: true })
  customerNote?: string;

  @Column({ nullable: true })
  adminNote?: string;

  @Column('json', { default: [] })
  history: OrderHistory[];
}
