import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';

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
}
