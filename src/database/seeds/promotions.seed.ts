import { DataSource } from 'typeorm';
import { Promotion, PromotionType } from '@/modules/promotions/entities/promotion.entity';

const now = new Date();
const oneYearLater = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

const promotionsData = [
  {
    code: 'WELCOME10',
    name: 'Скидка для новых клиентов',
    description: 'Скидка 10% на первый заказ',
    type: PromotionType.PERCENTAGE,
    value: 10,
    usageLimit: 1000,
    usageLimitPerUser: 1,
    startDate: now,
    endDate: oneYearLater,
    isActive: true,
    usedCount: 0,
    categoryIds: [],
    productIds: [],
    excludeProductIds: [],
    userUsage: {},
  },
  {
    code: 'SPORT2024',
    name: 'Сезонная скидка',
    description: 'Скидка 15% на заказы от 5000 ₽',
    type: PromotionType.PERCENTAGE,
    value: 15,
    minOrderAmount: 5000,
    startDate: now,
    endDate: oneYearLater,
    isActive: true,
    usedCount: 0,
    categoryIds: [],
    productIds: [],
    excludeProductIds: [],
    userUsage: {},
  },
  {
    code: 'FREESHIP',
    name: 'Бесплатная доставка',
    description: 'Бесплатная доставка при заказе от 3000 ₽',
    type: PromotionType.FREE_SHIPPING,
    value: 0,
    minOrderAmount: 3000,
    startDate: now,
    endDate: oneYearLater,
    isActive: true,
    usedCount: 0,
    categoryIds: [],
    productIds: [],
    excludeProductIds: [],
    userUsage: {},
  },
];

export async function seedPromotions(dataSource: DataSource): Promise<void> {
  const repository = dataSource.getMongoRepository(Promotion);

  await repository.deleteMany({});
  console.log('  Cleared promotions collection');

  const promotions = promotionsData.map((p) => repository.create(p));
  await repository.save(promotions);
  console.log(`  Seeded ${promotions.length} promotions`);
}
