import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';

export interface TopProductStat {
  productId: string;
  name: string;
  soldCount: number;
  revenue: number;
}

export interface TopCategoryStat {
  categoryId: string;
  name: string;
  ordersCount: number;
  revenue: number;
}

@Entity('analytics_daily')
export class AnalyticsDaily extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'date' })
  date: Date;

  @Column({ default: 0 })
  visitors: number;

  @Column({ default: 0 })
  uniqueVisitors: number;

  @Column({ default: 0 })
  pageViews: number;

  @Column({ default: 0 })
  ordersCount: number;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    default: 0,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => parseFloat(v) || 0,
    },
  })
  revenue: number;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    default: 0,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => parseFloat(v) || 0,
    },
  })
  averageOrderValue: number;

  @Column('decimal', {
    precision: 5,
    scale: 2,
    default: 0,
    transformer: {
      to: (v: number) => v,
      from: (v: string) => parseFloat(v) || 0,
    },
  })
  conversionRate: number;

  @Column('jsonb', { default: [] })
  topProducts: TopProductStat[];

  @Column('jsonb', { default: [] })
  topCategories: TopCategoryStat[];

  @Column('jsonb', { default: {} })
  trafficSources: Record<string, number>;

  @Column('jsonb', { default: {} })
  deviceStats: Record<string, number>;
}
