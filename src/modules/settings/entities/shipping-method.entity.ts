import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';

@Entity('shipping_methods')
export class ShippingMethod extends BaseEntity {
  @Column()
  name: string;

  @Column('decimal', { default: 0 })
  price: number;

  @Column({ default: '' })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @Index()
  @Column({ default: 0 })
  order: number;
}
