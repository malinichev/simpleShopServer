import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';

export enum PromotionType {
  PERCENTAGE = 'percentage',
  FIXED = 'fixed',
  FREE_SHIPPING = 'free_shipping',
}

@Entity('promotions')
export class Promotion extends BaseEntity {
  @Column({ unique: true })
  code: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ type: 'enum', enum: PromotionType })
  type: PromotionType;

  @Column('decimal', { precision: 10, scale: 2 })
  value: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  minOrderAmount?: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  maxDiscount?: number;

  @Column({ nullable: true })
  usageLimit?: number;

  @Column({ nullable: true })
  usageLimitPerUser?: number;

  @Column({ default: 0 })
  usedCount: number;

  @Column('uuid', { array: true, default: () => "ARRAY[]::uuid[]" })
  categoryIds: string[];

  @Column('uuid', { array: true, default: () => "ARRAY[]::uuid[]" })
  productIds: string[];

  @Column('uuid', { array: true, default: () => "ARRAY[]::uuid[]" })
  excludeProductIds: string[];

  @Index()
  @Column({ type: 'timestamp' })
  startDate: Date;

  @Index()
  @Column({ type: 'timestamp' })
  endDate: Date;

  @Index()
  @Column({ default: true })
  isActive: boolean;

  @Column('jsonb', { default: {} })
  userUsage: Record<string, number>;
}
