import { Entity, Column, Index } from 'typeorm';
import { ObjectId } from 'mongodb';
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

  @Column('decimal')
  value: number;

  @Column('decimal', { nullable: true })
  minOrderAmount?: number;

  @Column('decimal', { nullable: true })
  maxDiscount?: number;

  @Column({ nullable: true })
  usageLimit?: number;

  @Column({ nullable: true })
  usageLimitPerUser?: number;

  @Column({ default: 0 })
  usedCount: number;

  @Column('simple-array', { default: [] })
  categoryIds: ObjectId[];

  @Column('simple-array', { default: [] })
  productIds: ObjectId[];

  @Column('simple-array', { default: [] })
  excludeProductIds: ObjectId[];

  @Index()
  @Column()
  startDate: Date;

  @Index()
  @Column()
  endDate: Date;

  @Index()
  @Column({ default: true })
  isActive: boolean;

  @Column('json', { default: {} })
  userUsage: Record<string, number>;
}
