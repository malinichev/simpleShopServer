import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';
import { Order } from './order.entity';

@Entity('order_items')
export class OrderItemEntity extends BaseEntity {
  @Index()
  @Column('uuid')
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order?: Order;

  @Column('uuid')
  productId: string;

  @Column()
  variantId: string;

  @Column()
  name: string;

  @Column()
  sku: string;

  @Column()
  image: string;

  @Column()
  size: string;

  @Column()
  color: string;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => parseFloat(v) || 0,
    },
  })
  price: number;

  @Column()
  quantity: number;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => parseFloat(v) || 0,
    },
  })
  total: number;
}
