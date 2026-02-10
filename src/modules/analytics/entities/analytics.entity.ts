import { Entity, Column, Index } from 'typeorm';
import { ObjectId } from 'mongodb';
import { BaseEntity } from '@/common/entities/base.entity';

export interface TopProductStat {
  productId: ObjectId;
  name: string;
  soldCount: number;
  revenue: number;
}

export interface TopCategoryStat {
  categoryId: ObjectId;
  name: string;
  ordersCount: number;
  revenue: number;
}

@Entity('analytics_daily')
export class AnalyticsDaily extends BaseEntity {
  @Index({ unique: true })
  @Column()
  date: Date;

  @Column({ default: 0 })
  visitors: number;

  @Column({ default: 0 })
  uniqueVisitors: number;

  @Column({ default: 0 })
  pageViews: number;

  @Column({ default: 0 })
  ordersCount: number;

  @Column('decimal', { default: 0 })
  revenue: number;

  @Column('decimal', { default: 0 })
  averageOrderValue: number;

  @Column('decimal', { default: 0 })
  conversionRate: number;

  @Column('json', { default: [] })
  topProducts: TopProductStat[];

  @Column('json', { default: [] })
  topCategories: TopCategoryStat[];

  @Column('json', { default: {} })
  trafficSources: Record<string, number>;

  @Column('json', { default: {} })
  deviceStats: Record<string, number>;
}
