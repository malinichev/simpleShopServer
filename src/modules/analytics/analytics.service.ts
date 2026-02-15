import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { AnalyticsRepository } from './analytics.repository';
import { OrdersService } from '@/modules/orders/orders.service';
import { ProductsService } from '@/modules/products/products.service';
import { UsersService } from '@/modules/users/users.service';
import { AnalyticsDaily, TopProductStat, TopCategoryStat } from './entities/analytics.entity';
import {
  AnalyticsQueryDto,
  Granularity,
  TrackEventDto,
  TrackEventType,
  DashboardResponseDto,
  SalesDataDto,
  VisitorsDataDto,
  CustomerStatsDto,
} from './dto';

const CACHE_PREFIX = 'analytics';
const CACHE_TTL = 300; // 5 minutes

@Injectable()
export class AnalyticsService implements OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly redis: Redis;

  constructor(
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly ordersService: OrdersService,
    private readonly productsService: ProductsService,
    private readonly usersService: UsersService,
    @InjectQueue('analytics') private readonly analyticsQueue: Queue,
    private readonly configService: ConfigService,
  ) {
    this.redis = new Redis({
      host: this.configService.get<string>('redis.host'),
      port: this.configService.get<number>('redis.port'),
      password: this.configService.get<string>('redis.password'),
    });
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  async getDashboard(): Promise<DashboardResponseDto> {
    const cacheKey = `${CACHE_PREFIX}:dashboard`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // Current period: last 30 days
    const currentPeriodStart = new Date(now);
    currentPeriodStart.setDate(currentPeriodStart.getDate() - 30);

    // Previous period: 30 days before that
    const previousPeriodStart = new Date(currentPeriodStart);
    previousPeriodStart.setDate(previousPeriodStart.getDate() - 30);

    const [currentStats, previousStats, todayAnalytics, userStats, productsCount] = await Promise.all([
      this.ordersService.getStats(currentPeriodStart, now),
      this.ordersService.getStats(previousPeriodStart, currentPeriodStart),
      this.analyticsRepository.findByDate(todayStart),
      this.usersService.getStats(),
      this.productsService.count(),
    ]);

    const dashboard: DashboardResponseDto = {
      totalRevenue: {
        current: currentStats.totalRevenue,
        previous: previousStats.totalRevenue,
        changePercent: this.calcChangePercent(currentStats.totalRevenue, previousStats.totalRevenue),
      },
      ordersCount: {
        current: currentStats.totalOrders,
        previous: previousStats.totalOrders,
        changePercent: this.calcChangePercent(currentStats.totalOrders, previousStats.totalOrders),
      },
      averageOrderValue: {
        current: currentStats.averageOrderValue,
        previous: previousStats.averageOrderValue,
        changePercent: this.calcChangePercent(currentStats.averageOrderValue, previousStats.averageOrderValue),
      },
      totalCustomers: userStats.byRole.customer,
      newCustomersToday: 0,
      visitorsToday: todayAnalytics?.visitors ?? 0,
      conversionRate: todayAnalytics?.conversionRate ?? 0,
      recentOrdersCount: currentStats.totalOrders,
      productsInStock: productsCount,
    };

    await this.redis.set(cacheKey, JSON.stringify(dashboard), 'EX', CACHE_TTL);
    return dashboard;
  }

  async getSales(query: AnalyticsQueryDto): Promise<SalesDataDto[]> {
    const { dateFrom, dateTo } = this.resolveDateRange(query);
    const records = await this.analyticsRepository.findByDateRange(dateFrom, dateTo);

    const grouped = this.groupByGranularity(records, query.granularity || Granularity.DAY);

    return grouped.map((group) => ({
      date: group.date,
      revenue: group.records.reduce((sum, r) => sum + Number(r.revenue), 0),
      ordersCount: group.records.reduce((sum, r) => sum + r.ordersCount, 0),
      averageOrderValue: this.calcAvgOrderValue(group.records),
    }));
  }

  async getVisitors(query: AnalyticsQueryDto): Promise<VisitorsDataDto[]> {
    const { dateFrom, dateTo } = this.resolveDateRange(query);
    const records = await this.analyticsRepository.findByDateRange(dateFrom, dateTo);

    const grouped = this.groupByGranularity(records, query.granularity || Granularity.DAY);

    return grouped.map((group) => ({
      date: group.date,
      visitors: group.records.reduce((sum, r) => sum + r.visitors, 0),
      uniqueVisitors: group.records.reduce((sum, r) => sum + r.uniqueVisitors, 0),
      pageViews: group.records.reduce((sum, r) => sum + r.pageViews, 0),
    }));
  }

  async getTopProducts(limit: number = 10, dateFrom?: Date, dateTo?: Date): Promise<TopProductStat[]> {
    const from = dateFrom || this.daysAgo(30);
    const to = dateTo || new Date();

    const records = await this.analyticsRepository.findByDateRange(from, to);

    const productMap = new Map<string, TopProductStat>();

    for (const record of records) {
      for (const product of record.topProducts || []) {
        const key = product.productId.toString();
        const existing = productMap.get(key);
        if (existing) {
          existing.soldCount += product.soldCount;
          existing.revenue += product.revenue;
        } else {
          productMap.set(key, { ...product });
        }
      }
    }

    return Array.from(productMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  async getTopCategories(limit: number = 10, dateFrom?: Date, dateTo?: Date): Promise<TopCategoryStat[]> {
    const from = dateFrom || this.daysAgo(30);
    const to = dateTo || new Date();

    const records = await this.analyticsRepository.findByDateRange(from, to);

    const categoryMap = new Map<string, TopCategoryStat>();

    for (const record of records) {
      for (const category of record.topCategories || []) {
        const key = category.categoryId.toString();
        const existing = categoryMap.get(key);
        if (existing) {
          existing.ordersCount += category.ordersCount;
          existing.revenue += category.revenue;
        } else {
          categoryMap.set(key, { ...category });
        }
      }
    }

    return Array.from(categoryMap.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);
  }

  async getCustomerStats(): Promise<CustomerStatsDto> {
    const cacheKey = `${CACHE_PREFIX}:customer-stats`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const userStats = await this.usersService.getStats();
    const orderStats = await this.ordersService.getStats();

    const averageOrdersPerCustomer = userStats.byRole.customer > 0
      ? Math.round((orderStats.totalOrders / userStats.byRole.customer) * 100) / 100
      : 0;

    const stats: CustomerStatsDto = {
      totalCustomers: userStats.byRole.customer,
      newCustomersThisMonth: 0,
      returningCustomers: 0,
      averageOrdersPerCustomer,
    };

    await this.redis.set(cacheKey, JSON.stringify(stats), 'EX', CACHE_TTL);
    return stats;
  }

  async getLowStockProducts(
    threshold: number = 5,
    limit: number = 10,
  ): Promise<Array<{ _id: string; name: string; sku: string; stock: number; price: number; image?: string }>> {
    const cacheKey = `${CACHE_PREFIX}:low-stock:${threshold}:${limit}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const allProducts = await this.productsService.findAll({ limit: 1000 });
    const lowStockProducts = allProducts.data
      .map((product) => {
        const totalStock = product.variants.reduce((sum, v) => sum + v.stock, 0);
        const firstImage = product.images?.[0]?.url;
        return {
          _id: product._id.toString(),
          name: product.name,
          sku: product.sku,
          stock: totalStock,
          price: Number(product.price),
          image: firstImage,
        };
      })
      .filter((p) => p.stock <= threshold)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, limit);

    await this.redis.set(cacheKey, JSON.stringify(lowStockProducts), 'EX', CACHE_TTL);
    return lowStockProducts;
  }

  async trackEvent(dto: TrackEventDto): Promise<void> {
    await this.analyticsQueue.add('track-event', {
      type: 'track-event',
      payload: {
        eventType: dto.type,
        sessionId: dto.sessionId,
        source: dto.source,
        device: dto.device,
        url: dto.url,
        metadata: dto.metadata,
        timestamp: new Date().toISOString(),
      },
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });
  }

  async calculateDaily(date: Date): Promise<void> {
    this.logger.log(`Calculating daily analytics for ${date.toISOString().split('T')[0]}`);

    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const orderStats = await this.ordersService.getStats(dayStart, dayEnd);

    // Get existing tracking data for the day (visitors, pageViews etc.)
    const existingRecord = await this.analyticsRepository.findByDate(dayStart);

    const visitors = existingRecord?.visitors ?? 0;
    const uniqueVisitors = existingRecord?.uniqueVisitors ?? 0;
    const pageViews = existingRecord?.pageViews ?? 0;
    const trafficSources = existingRecord?.trafficSources ?? {};
    const deviceStats = existingRecord?.deviceStats ?? {};

    const conversionRate = uniqueVisitors > 0
      ? Math.round((orderStats.totalOrders / uniqueVisitors) * 10000) / 100
      : 0;

    await this.analyticsRepository.upsertDaily(dayStart, {
      visitors,
      uniqueVisitors,
      pageViews,
      ordersCount: orderStats.totalOrders,
      revenue: orderStats.totalRevenue,
      averageOrderValue: orderStats.averageOrderValue,
      conversionRate,
      topProducts: existingRecord?.topProducts ?? [],
      topCategories: existingRecord?.topCategories ?? [],
      trafficSources,
      deviceStats,
    });

    await this.invalidateCache();

    this.logger.log(
      `Daily analytics calculated: ${orderStats.totalOrders} orders, ₽${orderStats.totalRevenue} revenue`,
    );
  }

  async processTrackEvent(payload: Record<string, unknown>): Promise<void> {
    const now = new Date();
    const eventType = payload.eventType as TrackEventType;

    switch (eventType) {
      case TrackEventType.PAGE_VIEW:
        await this.analyticsRepository.incrementField(now, 'pageViews');
        await this.analyticsRepository.incrementField(now, 'visitors');
        if (payload.sessionId) {
          const dateKey = now.toISOString().split('T')[0];
          const isNew = await this.redis.sadd(
            `${CACHE_PREFIX}:unique:${dateKey}`,
            payload.sessionId as string,
          );
          if (isNew) {
            await this.analyticsRepository.incrementField(now, 'uniqueVisitors');
          }
          await this.redis.expire(`${CACHE_PREFIX}:unique:${dateKey}`, 172800);
        }
        if (payload.source) {
          await this.incrementJsonField(now, 'trafficSources', payload.source as string);
        }
        if (payload.device) {
          await this.incrementJsonField(now, 'deviceStats', payload.device as string);
        }
        break;

      case TrackEventType.ADD_TO_CART:
        this.logger.debug(`Add to cart event: ${JSON.stringify(payload.metadata)}`);
        break;

      case TrackEventType.PURCHASE:
        this.logger.debug(`Purchase event: ${JSON.stringify(payload.metadata)}`);
        break;
    }
  }

  private async incrementJsonField(date: Date, field: 'trafficSources' | 'deviceStats', key: string): Promise<void> {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const existing = await this.analyticsRepository.findByDate(startOfDay);
    if (existing) {
      const data = (existing[field] as Record<string, number>) || {};
      data[key] = (data[key] || 0) + 1;
      await this.analyticsRepository.upsertDaily(startOfDay, { [field]: data });
    } else {
      await this.analyticsRepository.upsertDaily(startOfDay, { [field]: { [key]: 1 } });
    }
  }

  private resolveDateRange(query: AnalyticsQueryDto): { dateFrom: Date; dateTo: Date } {
    const dateTo = query.dateTo ? new Date(query.dateTo) : new Date();
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : this.daysAgo(30);
    return { dateFrom, dateTo };
  }

  private groupByGranularity(
    records: AnalyticsDaily[],
    granularity: Granularity,
  ): { date: string; records: AnalyticsDaily[] }[] {
    const groups = new Map<string, AnalyticsDaily[]>();

    for (const record of records) {
      const key = this.getGroupKey(record.date, granularity);
      const group = groups.get(key) || [];
      group.push(record);
      groups.set(key, group);
    }

    return Array.from(groups.entries()).map(([date, recs]) => ({
      date,
      records: recs,
    }));
  }

  private getGroupKey(date: Date, granularity: Granularity): string {
    const d = new Date(date);
    switch (granularity) {
      case Granularity.DAY:
        return d.toISOString().split('T')[0];
      case Granularity.WEEK: {
        const dayOfWeek = d.getDay();
        const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const monday = new Date(d.setDate(diff));
        return monday.toISOString().split('T')[0];
      }
      case Granularity.MONTH:
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  private calcAvgOrderValue(records: AnalyticsDaily[]): number {
    const totalRevenue = records.reduce((sum, r) => sum + Number(r.revenue), 0);
    const totalOrders = records.reduce((sum, r) => sum + r.ordersCount, 0);
    return totalOrders > 0 ? Math.round((totalRevenue / totalOrders) * 100) / 100 : 0;
  }

  private calcChangePercent(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / previous) * 10000) / 100;
  }

  private daysAgo(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private async invalidateCache(): Promise<void> {
    const keys = await this.redis.keys(`${CACHE_PREFIX}:*`);
    const cacheKeys = keys.filter((k) => !k.includes(':unique:'));
    if (cacheKeys.length > 0) {
      await this.redis.del(...cacheKeys);
    }
  }
}
