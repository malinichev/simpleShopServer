import { DataSource } from 'typeorm';
import {
  AnalyticsDaily,
  TopProductStat,
  TopCategoryStat,
} from '@/modules/analytics/entities/analytics.entity';
import {
  Order,
  OrderStatus,
} from '@/modules/orders/entities/order.entity';
import { OrderItemEntity } from '@/modules/orders/entities/order-item.entity';
import { Product } from '@/modules/products/entities/product.entity';
import { Category } from '@/modules/categories/entities/category.entity';

const DAYS_BACK = 60;

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Заполняет analytics_daily агрегатами из реальных orders за последние 60 дней.
 * Включает:
 * - revenue/ordersCount/AOV из orders (без CANCELLED/REFUNDED)
 * - top 5 products / top 3 categories по сумме продаж
 * - синтетические visitors/pageViews/conversionRate/trafficSources/deviceStats
 */
export async function seedAnalytics(dataSource: DataSource): Promise<void> {
  const analyticsRepo = dataSource.getRepository(AnalyticsDaily);
  const orderRepo = dataSource.getRepository(Order);
  const itemRepo = dataSource.getRepository(OrderItemEntity);
  const productRepo = dataSource.getRepository(Product);
  const categoryRepo = dataSource.getRepository(Category);

  const products = await productRepo.find();
  const productById = new Map(products.map((p) => [p.id, p]));
  const categories = await categoryRepo.find();
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  const records: Partial<AnalyticsDaily>[] = [];

  for (let daysAgo = DAYS_BACK; daysAgo >= 0; daysAgo--) {
    const dayStart = new Date();
    dayStart.setDate(dayStart.getDate() - daysAgo);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const dayOrders = await orderRepo
      .createQueryBuilder('o')
      .where('o.createdAt BETWEEN :a AND :b', { a: dayStart, b: dayEnd })
      .andWhere('o.status NOT IN (:...excluded)', {
        excluded: [OrderStatus.CANCELLED, OrderStatus.REFUNDED],
      })
      .getMany();

    const ordersCount = dayOrders.length;
    const revenue = dayOrders.reduce((s, o) => s + Number(o.total), 0);
    const averageOrderValue = ordersCount > 0 ? revenue / ordersCount : 0;

    // Top products / categories — по items этого дня
    const orderIds = dayOrders.map((o) => o.id);
    let topProducts: TopProductStat[] = [];
    let topCategories: TopCategoryStat[] = [];

    if (orderIds.length > 0) {
      const items = await itemRepo
        .createQueryBuilder('i')
        .where('i.orderId IN (:...ids)', { ids: orderIds })
        .getMany();

      const productAgg = new Map<string, TopProductStat>();
      const categoryAgg = new Map<string, TopCategoryStat>();

      for (const it of items) {
        const product = productById.get(it.productId);
        // Aggregate by product
        const pStat = productAgg.get(it.productId) ?? {
          productId: it.productId,
          name: it.name,
          soldCount: 0,
          revenue: 0,
        };
        pStat.soldCount += it.quantity;
        pStat.revenue += Number(it.total);
        productAgg.set(it.productId, pStat);

        // Aggregate by category (через product.categoryId)
        if (product) {
          const cat = categoryById.get(product.categoryId);
          if (cat) {
            const cStat = categoryAgg.get(cat.id) ?? {
              categoryId: cat.id,
              name: cat.name,
              ordersCount: 0,
              revenue: 0,
            };
            cStat.ordersCount += it.quantity;
            cStat.revenue += Number(it.total);
            categoryAgg.set(cat.id, cStat);
          }
        }
      }

      topProducts = Array.from(productAgg.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

      topCategories = Array.from(categoryAgg.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 3);
    }

    // Синтетический трафик. Свежие дни — больше посетителей.
    const recencyBoost = Math.max(0, 7 - daysAgo) * 30;
    const visitors = rand(80, 250) + recencyBoost;
    const uniqueVisitors = Math.round(visitors * (0.65 + Math.random() * 0.15));
    const pageViews = visitors * rand(4, 8);
    const conversionRate =
      visitors > 0 ? Math.round((ordersCount / visitors) * 10000) / 100 : 0;

    records.push({
      date: dayStart,
      visitors,
      uniqueVisitors,
      pageViews,
      ordersCount,
      revenue: Math.round(revenue * 100) / 100,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      conversionRate,
      topProducts,
      topCategories,
      trafficSources: {
        direct: Math.round(visitors * 0.4),
        search: Math.round(visitors * 0.35),
        social: Math.round(visitors * 0.15),
        referral: Math.round(visitors * 0.1),
      },
      deviceStats: {
        mobile: Math.round(visitors * 0.6),
        desktop: Math.round(visitors * 0.35),
        tablet: Math.round(visitors * 0.05),
      },
    });
  }

  await analyticsRepo.save(records);
  console.log(
    `  Seeded ${records.length} analytics_daily records (${DAYS_BACK + 1} days)`,
  );
  // Используем dayKey для подавления unused-warning'а — пригодится
  // если позже понадобится сгруппировать по string-ключу.
  void dayKey;
}
